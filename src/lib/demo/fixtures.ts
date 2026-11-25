import {
  CampaignRecord,
  ClaimSlotRecord,
  VoucherCardRecord,
  AuditEventRecord,
  ScrubAttestationRecord,
  PayoutRecord,
  ChainTxCheck,
} from "@/types";
import { DEMO_ADMIN_SECRET_HASH, hashAckCode, hashToken } from "@/lib/security/tokens";
import { computePurgeSetHash } from "@/lib/security/scrub";
import { encodeUnifiedAddress } from "@/lib/zcash/zip316";
import {
  ADDRESS_TEST_VECTORS,
  DEMO_ACK_CODES,
  DEMO_CAMPAIGN_ID,
  DEMO_CLAIM_TOKENS,
  NU7_TESTNET_ACTIVATION_HEIGHT,
} from "./constants";

/**
 * Single source of truth for the judge sandbox. Both the in-memory store and the
 * MongoDB seed build their records from here, so the demo behaves the same with or
 * without a database.
 *
 * Every on-chain-looking value in here (txids, block heights) is a fixture. Audit events carry
 * `simulated: true` and chain checks are SKIPPED with DEMO_FIXTURE_NOTE so the UI labels them.
 * Actions a judge takes in the sandbox (recording a payout txid, a sweep txid) are checked
 * against the real testnet node.
 */

/** Deterministic, structurally valid (ZIP 316) testnet UFVK with one Orchard FVK item. Not a real wallet key. */
export const DEMO_UFVK = encodeUnifiedAddress("uviewtest", [
  { typecode: 0x03, data: Uint8Array.from({ length: 96 }, (_, i) => (i * 37 + 11) & 0xff) },
]);

export const DEMO_FUNDING_TXID = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
export const DEMO_PAYOUT_TXID = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
const DEMO_RECIPIENT = ADDRESS_TEST_VECTORS.testnet.validShielded;

export interface DemoFixtureSet {
  campaign: CampaignRecord;
  vouchers: VoucherCardRecord[];
  claimSlots: ClaimSlotRecord[];
  payouts: PayoutRecord[];
  auditEvents: AuditEventRecord[];
  scrubAttestation: ScrubAttestationRecord;
}

const h = (offset: number) => NU7_TESTNET_ACTIVATION_HEIGHT + 165_000 + offset;

/** Demo fixture txids are not on chain, so their checks are recorded as SKIPPED with this note. */
export const DEMO_FIXTURE_NOTE = "Demo fixture: this txid is not on chain";

function fixtureCheck(txid: string, now: Date): ChainTxCheck {
  return {
    status: "SKIPPED",
    txid,
    network: "testnet",
    height: null,
    tipHeight: null,
    confirmations: null,
    shape: null,
    checkedAt: now.toISOString(),
    endpoint: null,
    note: DEMO_FIXTURE_NOTE,
  };
}

export function buildDemoFixtures(now: Date = new Date()): DemoFixtureSet {
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const MIN = 60_000;

  const campaign: CampaignRecord = {
    campaignId: DEMO_CAMPAIGN_ID,
    title: "ZecClaim NU7 Mumbai Meetup Sandbox",
    description: "Judge sandbox: meetup gift cards (Lane 1) and online bounty claim links (Lane 2) on testnet",
    network: "testnet",
    lane: "HYBRID",
    ufvk: DEMO_UFVK,
    fundingTxid: DEMO_FUNDING_TXID,
    fundingCheck: fixtureCheck(DEMO_FUNDING_TXID, now),
    anchorHeight: h(0),
    totalFundedZat: 200_000_000, // 2.0 ZEC
    slotCount: 5,
    clawbackAddress: DEMO_RECIPIENT,
    clawbackExpiryHeight: h(70_000),
    adminSecretHash: DEMO_ADMIN_SECRET_HASH,
    isDemo: true,
    isSplitCustody: true,
    publishUfvk: false,
    status: "ACTIVE",
    createdAt: ago(24 * 60 * MIN),
    updatedAt: now,
  };

  const card = (cardId: string, extra: Partial<VoucherCardRecord> = {}): VoucherCardRecord => ({
    campaignId: DEMO_CAMPAIGN_ID,
    cardId,
    amountZat: 10_000_000,
    feeBufferZat: 2000,
    ackCodeHash: hashAckCode(DEMO_ACK_CODES[cardId]),
    state: "UNCLAIMED",
    isSplitCustody: true,
    createdAt: ago(23 * 60 * MIN),
    ...extra,
  });

  const vouchers: VoucherCardRecord[] = [
    card("CARD-01", { state: "ACK_CONFIRMED", ackSubmittedAt: ago(30 * MIN) }),
    card("CARD-02"),
    card("CARD-03"),
    card("CARD-04", {
      state: "DISPUTED",
      disputeReason: "Attendee reported the card was already empty when scanned at the registration desk",
      disputedAt: ago(20 * MIN),
    }),
    card("CARD-05"),
  ];

  const slot = (slotIndex: number, extra: Partial<ClaimSlotRecord>): ClaimSlotRecord => ({
    campaignId: DEMO_CAMPAIGN_ID,
    tokenHash: hashToken(`demo-claim-slot-0${slotIndex + 1}`),
    amountZat: 25_000_000,
    slotIndex,
    status: "UNCLAIMED",
    createdAt: ago(22 * 60 * MIN),
    ...extra,
  });

  const purgeHash = computePurgeSetHash([DEMO_RECIPIENT]);

  const claimSlots: ClaimSlotRecord[] = [
    slot(0, {
      status: "PURGED",
      recipientAddress: "[PURGED]",
      addressPoolType: "ORCHARD",
      submittedAt: ago(120 * MIN),
      batchRun: 1,
      batchIndex: 0,
      payoutTxid: DEMO_PAYOUT_TXID,
      purgeHash,
    }),
    slot(1, { tokenHash: hashToken(DEMO_CLAIM_TOKENS.slot2) }),
    slot(2, {
      status: "SUBMITTED",
      recipientAddress: DEMO_RECIPIENT,
      addressPoolType: "ORCHARD",
      submittedAt: ago(60 * MIN),
    }),
    slot(3, { tokenHash: hashToken(DEMO_CLAIM_TOKENS.slot4) }),
    slot(4, { tokenHash: hashToken(DEMO_CLAIM_TOKENS.slot5) }),
  ];

  const payouts: PayoutRecord[] = [
    {
      campaignId: DEMO_CAMPAIGN_ID,
      batchRun: 1,
      chunkIndex: 0,
      recipients: 1,
      txid: DEMO_PAYOUT_TXID,
      check: fixtureCheck(DEMO_PAYOUT_TXID, now),
      recordedAt: ago(95 * MIN),
    },
  ];

  const scrubAttestation: ScrubAttestationRecord = {
    campaignId: DEMO_CAMPAIGN_ID,
    addressesPurgedCount: 1,
    sha256PurgedSetHash: purgeHash,
    executedAt: ago(90 * MIN),
  };

  const sim = { simulated: true };
  const event = (eventType: AuditEventRecord["eventType"], minutesAgo: number, details: Record<string, unknown>, txid?: string): AuditEventRecord => ({
    campaignId: DEMO_CAMPAIGN_ID,
    eventType,
    details: { ...details, ...sim },
    txid,
    timestamp: ago(minutesAgo * MIN),
  });

  const auditEvents: AuditEventRecord[] = [
    event("CAMPAIGN_ANCHORED", 24 * 60, { title: campaign.title, totalFundedZat: campaign.totalFundedZat, slotCount: campaign.slotCount }, DEMO_FUNDING_TXID),
    event("CAMPAIGN_ANCHORED", 23 * 60, { kind: "VOUCHERS_IMPORTED", cardsImportedCount: 5, totalAmountZat: 50_000_000 }),
    event("SLOT_CLAIMED", 120, { slotIndex: 0, amountZat: 25_000_000, addressPoolType: "ORCHARD" }),
    event("BATCH_LOCKED", 100, { batchRun: 1, totalRecipients: 1, totalChunks: 1, totalActions: 2, totalFeeZat: 2000 }),
    event("PAYOUT_RECORDED", 95, { batchRun: 1, txids: [DEMO_PAYOUT_TXID], recipients: 1, problems: [] }, DEMO_PAYOUT_TXID),
    event("PII_SCRUBBED", 90, { addressesPurgedCount: 1, sha256PurgedSetHash: purgeHash }),
    event("SLOT_CLAIMED", 60, { slotIndex: 2, amountZat: 25_000_000, addressPoolType: "ORCHARD" }),
    event("ACK_VERIFIED", 30, { cardId: "CARD-01", amountZat: 10_000_000, sweepEvidence: "none" }),
    event("DISPUTE_FLAGGED", 20, { cardId: "CARD-04", reason: vouchers[3].disputeReason }),
  ];

  return { campaign, vouchers, claimSlots, payouts, auditEvents, scrubAttestation };
}
