import { z } from "zod";

/**
 * Shared Zod Validation Schemas
 * Used across API Route Handlers, Server Actions, and UI Forms
 */

// Campaign Creation & Trust Anchor Schema
export const CreateCampaignSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().max(500).optional(),
  lane: z.enum(["OFFLINE_ZIP324", "ONLINE_BATCH", "HYBRID"]),
  ufvk: z.string().startsWith("uview", { message: "UFVK must start with uview..." }),
  fundingTxid: z.string().length(64, { message: "Funding TxID must be a 64-character hex string" }),
  totalFundedZat: z.number().positive(),
  slotCount: z.number().int().min(1).max(5000),
  clawbackAddress: z.string().min(10),
  clawbackExpiryHeight: z.number().int().positive(),
});

export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;

// Lane 2 Claim Token Validation
export const ValidateTokenSchema = z.object({
  token: z.string().min(16),
});

// Lane 2 Claim Submission
export const SubmitClaimSchema = z.object({
  token: z.string().min(16),
  address: z.string().min(20),
});

export type SubmitClaimInput = z.infer<typeof SubmitClaimSchema>;

// Lane 2 Batch Lock & Export
export const LockBatchSchema = z.object({
  campaignId: z.string().min(8),
});

// Lane 1 Vizor CSV Row Import
export const VizorCsvCardSchema = z.object({
  cardId: z.string().min(1),
  amountZec: z.number().positive(),
  feeBufferZat: z.number().int().min(2000), // ZIP 2009 minimum sweep buffer
  claimToken: z.string().min(16),
  ackHash: z.string().length(64),
});

export const ImportVouchersSchema = z.object({
  campaignId: z.string().min(8),
  cards: z.array(VizorCsvCardSchema).min(1).max(1000),
});

// Lane 1 Memo ACK Submission
export const SubmitAckSchema = z.object({
  campaignId: z.string().min(8),
  cardId: z.string().min(1),
  ackCode: z.string().min(4).max(32),
});

// Lane 1 Dispute Flag
export const FlagDisputeSchema = z.object({
  campaignId: z.string().min(8),
  cardId: z.string().min(1),
  details: z.string().min(5).max(500),
});

// 1-Click Scrub Execution
export const ExecuteScrubSchema = z.object({
  campaignId: z.string().min(8),
});
