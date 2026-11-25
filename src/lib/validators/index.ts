import { z } from "zod";
import {
  inspectZcashAddress,
  inspectUnifiedViewingKey,
  looksLikeSpendingSecret,
} from "@/lib/zcash/zip316";

/**
 * Shared Zod Validation Schemas
 * Used across API Route Handlers, Server Actions, and UI Forms
 */

// Helper validator rejecting any secret spending key bearer fragment
const noSecretFragment = (val: string) => !/(?:#|%23)key(?:=|%3d)/i.test(val);

// Helper validator for strictly shielded Zcash addresses without transparent receivers
const shieldedAddressSchema = z.string().min(20).refine(
  (addr) => {
    const r = inspectZcashAddress(addr);
    return r.isValid && r.isShielded && !r.hasTransparentReceiver && noSecretFragment(addr);
  },
  {
    message: "Address must be a valid shielded address (u1... or zs1...) without transparent receivers",
  }
);

// 64-character transaction id (hex), normalized to lowercase
export const txidSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{64}$/, { message: "Transaction ID must be a 64-character hex string" })
  .transform((v) => v.toLowerCase());

// Optional txid where an empty form field means "not provided"
const optionalTxidSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  txidSchema.optional()
);

// Upper bound for any zatoshi amount: 21M ZEC
const MAX_ZAT = 2_100_000_000_000_000;
const zatAmountSchema = z.number().int().positive().max(MAX_ZAT);

// Campaign Creation & Trust Anchor Schema
export const CreateCampaignSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3)
      .max(100)
      .refine(noSecretFragment, { message: "title must not contain secret key fragment" }),
    description: z
      .string()
      .trim()
      .max(500)
      .refine(noSecretFragment, { message: "description must not contain secret key fragment" })
      .optional(),
    network: z.enum(["testnet", "mainnet"]).optional(),
    lane: z.enum(["OFFLINE_ZIP324", "ONLINE_BATCH", "HYBRID"]),
    ufvk: z
      .string()
      .trim()
      .min(10)
      .refine(noSecretFragment, { message: "ufvk must not contain secret key fragment" })
      .refine((v) => !looksLikeSpendingSecret(v), {
        message:
          "This looks like a seed phrase or spending key. ZecClaim only accepts a read-only Unified Full Viewing Key (uview...).",
      }),
    fundingTxid: txidSchema,
    totalFundedZat: zatAmountSchema,
    slotCount: z.number().int().min(1).max(5000),
    // Claim-link amounts, in one of three ways: omitted (the server splits the Lane 2 budget
    // evenly after fees), `slotAmountZat` (the same amount on every link) or `slotAmountsZat`
    // (one amount per link, in link order; its length must equal slotCount).
    slotAmountZat: zatAmountSchema.optional(),
    slotAmountsZat: z.array(zatAmountSchema).min(1).max(5000).optional(),
    // Planned gift-card amounts (Lane 1 / Hybrid), one entry per card. Imported cards must match.
    cardPlanZat: z.array(zatAmountSchema).min(1).max(1000).optional(),
    clawbackAddress: z.string().trim().min(20).refine(noSecretFragment),
    // Either a date (the server converts it to a block height from the live tip) or a height.
    clawbackAt: z.string().datetime({ offset: true, message: "clawbackAt must be an ISO 8601 date-time" }).optional(),
    clawbackExpiryHeight: z.number().int().positive().optional(),
    // Publish the full UFVK on public pages (default: fingerprint only).
    publishUfvk: z.boolean().optional(),
  })
  .transform((data) => {
    // Network defaults to the viewing key's own network (HRP), then to testnet.
    const keyNetwork = inspectUnifiedViewingKey(data.ufvk).network;
    const resolvedNetwork: "testnet" | "mainnet" = data.network || keyNetwork || "testnet";
    return {
      ...data,
      network: resolvedNetwork,
    };
  })
  .superRefine((data, ctx) => {
    const inspection = inspectUnifiedViewingKey(data.ufvk, data.network);
    if (!inspection.isValid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ufvk"],
        message: inspection.errorMessage || "Invalid Unified Full Viewing Key",
      });
    }
    if (data.slotAmountsZat) {
      if (data.slotAmountZat !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slotAmountsZat"],
          message: "Send either slotAmountZat (same amount on every link) or slotAmountsZat (one per link), not both",
        });
      }
      if (data.slotAmountsZat.length !== data.slotCount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slotAmountsZat"],
          message: `slotAmountsZat has ${data.slotAmountsZat.length} amounts but slotCount is ${data.slotCount}: send one amount per claim link`,
        });
      }
      if (data.lane === "OFFLINE_ZIP324") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slotAmountsZat"],
          message: "Claim-link amounts need an ONLINE_BATCH or HYBRID campaign",
        });
      }
    }
    if (data.cardPlanZat && data.lane === "ONLINE_BATCH") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cardPlanZat"],
        message: "A gift-card plan needs an OFFLINE_ZIP324 or HYBRID campaign",
      });
    }
  })
  .refine(
    (data) => {
      const r = inspectZcashAddress(data.clawbackAddress, data.network);
      return r.isValid && r.isShielded && !r.hasTransparentReceiver;
    },
    {
      message:
        "Clawback address must be a shielded address matching the campaign's network",
      path: ["clawbackAddress"],
    }
  )
  .refine((data) => Boolean(data.clawbackAt || data.clawbackExpiryHeight), {
    message: "Choose when unclaimed funds can be clawed back (clawbackAt or clawbackExpiryHeight)",
    path: ["clawbackAt"],
  });

export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;

// Reissue claim links for UNCLAIMED slots (all of them when slotIndexes is omitted).
export const ReissueLinksSchema = z.object({
  slotIndexes: z.array(z.number().int().min(0).max(4999)).min(1).max(5000).optional(),
});

// Organizer console: list the stored recipient addresses (no parameters; the secret is a header).
export const ListSlotAddressesSchema = z.object({}).strict();

// Lane 2 Claim Token Validation
export const ValidateTokenSchema = z.object({
  token: z
    .string()
    .min(16)
    .refine(noSecretFragment, { message: "token must not contain secret key fragment" }),
});

// Lane 2 Claim Submission
export const SubmitClaimSchema = z.object({
  token: z
    .string()
    .min(16)
    .refine(noSecretFragment, { message: "token must not contain secret key fragment" }),
  address: shieldedAddressSchema,
});

export type SubmitClaimInput = z.infer<typeof SubmitClaimSchema>;

// Lane 2 payout report by the link holder. Fixed reasons only: free text could carry the
// recipient's address onto the public proof portal.
export const ReportPayoutSchema = z
  .object({
    token: z
      .string()
      .min(16)
      .refine(noSecretFragment, { message: "token must not contain secret key fragment" }),
    reason: z.enum(["NOT_RECEIVED", "WRONG_AMOUNT"]),
  })
  .strict();

// Lane 2 Batch Lock & Export
export const LockBatchSchema = z.object({
  campaignId: z.string().min(8),
  // Re-export a specific earlier run instead of the latest one.
  batchRun: z.number().int().min(0).optional(),
});

// Lane 1 Vizor CSV Row Import (strictly rejects #key= or %23key= or %3d)
export const VizorCsvCardSchema = z.object({
  cardId: z.string().min(1),
  amountZec: z.number().positive(),
  feeBufferZat: z.number().int().min(2000), // ZIP 2009 minimum sweep buffer
  claimToken: z
    .string()
    .min(5)
    .refine(noSecretFragment, { message: "claimToken must not contain secret '#key=' or '%23key=' fragment" }),
  ackHash: z.string().length(64),
});

export const ImportVouchersSchema = z.object({
  campaignId: z.string().min(8),
  isSplitCustody: z.boolean().optional(),
  cards: z.array(VizorCsvCardSchema).min(1).max(1000),
});

// Lane 1 Memo ACK Submission (sweepTxid: optional on-chain evidence of the recipient's sweep)
export const SubmitAckSchema = z.object({
  campaignId: z.string().min(8),
  cardId: z.string().trim().min(1).max(64),
  ackCode: z.string().min(4).max(32),
  sweepTxid: optionalTxidSchema,
});

// Lane 1 Dispute Flag ("Already Redeemed" tripwire)
export const FlagDisputeSchema = z.object({
  campaignId: z.string().min(8),
  cardId: z.string().trim().min(1).max(64),
  details: z.string().min(5).max(500),
});

// Lane 1 Audited Clawback
export const ClawbackVouchersSchema = z.object({
  campaignId: z.string().min(8),
  txid: txidSchema,
});

// Lane 2 payout recording: the txid(s) the organizer's wallet broadcast for one batch run,
// in chunk order (one txid per exported chunk).
export const RecordPayoutSchema = z.object({
  campaignId: z.string().min(8),
  batchRun: z.number().int().min(1),
  txids: z.array(txidSchema).min(1).max(50),
});

// Public on-chain lookup (used by the campaign form before anchoring)
export const ChainTxQuerySchema = z.object({
  network: z.enum(["testnet", "mainnet"]),
  txid: txidSchema,
});

// 1-Click Scrub Execution
// `force` acknowledges that recipients without a recorded payout will lose their payout address.
export const ExecuteScrubSchema = z.object({
  campaignId: z.string().min(8),
  force: z.boolean().optional(),
});
