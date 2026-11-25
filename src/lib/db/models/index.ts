import mongoose, { Schema, Model } from "mongoose";
import {
  CampaignRecord,
  ClaimSlotRecord,
  VoucherCardRecord,
  AuditEventRecord,
  ScrubAttestationRecord,
  PayoutRecord,
} from "@/types";

/**
 * 1. Campaign Schema
 */
const CampaignSchema = new Schema<CampaignRecord>(
  {
    campaignId: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    description: { type: String },
    network: {
      type: String,
      enum: ["testnet", "mainnet"],
      default: "testnet",
      required: true,
      index: true,
    },
    lane: {
      type: String,
      enum: ["OFFLINE_ZIP324", "ONLINE_BATCH", "HYBRID"],
      required: true,
    },
    ufvk: { type: String, required: true },
    fundingTxid: { type: String, required: true },
    totalFundedZat: { type: Number, required: true },
    slotCount: { type: Number, required: true },
    // Planned gift-card amounts (zatoshi). Absent (not []) on campaigns without a plan.
    cardPlanZat: { type: [Number], default: undefined },
    clawbackAddress: { type: String, required: true },
    clawbackExpiryHeight: { type: Number, required: true },
    clawbackAt: { type: Date },
    adminSecretHash: { type: String },
    isDemo: { type: Boolean, default: false },
    isSplitCustody: { type: Boolean, default: false },
    publishUfvk: { type: Boolean, default: false },
    anchorHeight: { type: Number },
    fundingCheck: { type: Schema.Types.Mixed },
    status: {
      type: String,
      enum: ["ACTIVE", "LOCKED", "COMPLETED", "CLAWED_BACK"],
      default: "ACTIVE",
      index: true,
    },
  },
  { timestamps: true }
);

// One funding transaction anchors at most one campaign per network.
CampaignSchema.index({ network: 1, fundingTxid: 1 });

/**
 * 2. ClaimSlot Schema
 * No TTL index: slots are the public Lane 2 ledger. Addresses are removed by the scrub, and the
 * proof portal shows how many are still stored. (Deployments created before this change should
 * drop the old `createdAt_1` TTL index.)
 */
const ClaimSlotSchema = new Schema<ClaimSlotRecord>(
  {
    campaignId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    amountZat: { type: Number, required: true },
    slotIndex: { type: Number, required: true },
    status: {
      type: String,
      enum: ["UNCLAIMED", "SUBMITTED", "LOCKED_FOR_BATCH", "BATCHED", "PURGED"],
      default: "UNCLAIMED",
      index: true,
    },
    recipientAddress: { type: String },
    addressPoolType: {
      type: String,
      enum: ["ORCHARD", "IRONWOOD", "SAPLING"],
    },
    submittedAt: { type: Date },
    batchIndex: { type: Number },
    batchRun: { type: Number },
    payoutTxid: { type: String },
    payoutReport: { type: String, enum: ["NOT_RECEIVED", "WRONG_AMOUNT"] },
    payoutReportedAt: { type: Date },
    purgeHash: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Compound indexes for fast lookups
ClaimSlotSchema.index({ campaignId: 1, slotIndex: 1 });
ClaimSlotSchema.index({ campaignId: 1, status: 1 });

/**
 * 3. VoucherCard Schema (Lane 1 ZIP 324)
 */
const VoucherCardSchema = new Schema<VoucherCardRecord>(
  {
    campaignId: { type: String, required: true, index: true },
    cardId: { type: String, required: true },
    amountZat: { type: Number, required: true },
    feeBufferZat: { type: Number, required: true, default: 2000 },
    ackCodeHash: { type: String, required: true },
    state: {
      type: String,
      enum: ["UNCLAIMED", "ACK_CONFIRMED", "DISPUTED", "CLAWED_BACK"],
      default: "UNCLAIMED",
      index: true,
    },
    sweepTxid: { type: String },
    sweepCheck: { type: Schema.Types.Mixed },
    ackSubmittedAt: { type: Date },
    disputeReason: { type: String },
    disputedAt: { type: Date },
    clawbackTxid: { type: String },
    isSplitCustody: { type: Boolean, default: false },
    memoRef: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

VoucherCardSchema.index({ campaignId: 1, cardId: 1 }, { unique: true });
VoucherCardSchema.index({ campaignId: 1, state: 1 });

/**
 * 4. AuditEvent Schema
 */
const AuditEventSchema = new Schema<AuditEventRecord>(
  {
    campaignId: { type: String, required: true, index: true },
    eventType: {
      type: String,
      enum: [
        "CAMPAIGN_ANCHORED",
        "FUNDING_CHECKED",
        "SLOT_CLAIMED",
        "ACK_VERIFIED",
        "DISPUTE_FLAGGED",
        "BATCH_LOCKED",
        "PAYOUT_RECORDED",
        "PII_SCRUBBED",
        "CLAWBACK_RECONCILED",
        "LINKS_REISSUED",
      ],
      required: true,
    },
    details: { type: Schema.Types.Mixed, required: true },
    blockHeight: { type: Number },
    txid: { type: String },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

AuditEventSchema.index({ campaignId: 1, timestamp: -1 });

/**
 * 5. ScrubAttestation Schema
 */
const ScrubAttestationSchema = new Schema<ScrubAttestationRecord>(
  {
    campaignId: { type: String, required: true, index: true },
    addressesPurgedCount: { type: Number, required: true },
    sha256PurgedSetHash: { type: String, required: true },
    executedAt: { type: Date, default: Date.now, index: true },
    receiptTxid: { type: String },
  },
  { timestamps: false }
);

ScrubAttestationSchema.index({ campaignId: 1, executedAt: -1 });

/**
 * 6. PayoutRecord Schema: one recorded payout transaction per Lane 2 batch-run chunk.
 */
const PayoutRecordSchema = new Schema<PayoutRecord>(
  {
    campaignId: { type: String, required: true, index: true },
    batchRun: { type: Number, required: true },
    chunkIndex: { type: Number, required: true },
    recipients: { type: Number, required: true },
    txid: { type: String, required: true },
    check: { type: Schema.Types.Mixed, required: true },
    recordedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

PayoutRecordSchema.index({ campaignId: 1, batchRun: 1, chunkIndex: 1 }, { unique: true });
PayoutRecordSchema.index({ campaignId: 1, txid: 1 }, { unique: true });
// Cross-campaign lookup: one transaction can be recorded as the payout of only one campaign.
PayoutRecordSchema.index({ txid: 1 });

/**
 * 7. RateLimitBucket Schema: fixed-window counters shared by every server instance.
 */
export interface RateLimitBucketRecord {
  key: string;
  count: number;
  expiresAt: Date;
}

const RateLimitBucketSchema = new Schema<RateLimitBucketRecord>(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false }
);

RateLimitBucketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Campaign: Model<CampaignRecord> =
  mongoose.models.Campaign || mongoose.model<CampaignRecord>("Campaign", CampaignSchema);

export const ClaimSlot: Model<ClaimSlotRecord> =
  mongoose.models.ClaimSlot || mongoose.model<ClaimSlotRecord>("ClaimSlot", ClaimSlotSchema);

export const VoucherCard: Model<VoucherCardRecord> =
  mongoose.models.VoucherCard || mongoose.model<VoucherCardRecord>("VoucherCard", VoucherCardSchema);

export const AuditEvent: Model<AuditEventRecord> =
  mongoose.models.AuditEvent || mongoose.model<AuditEventRecord>("AuditEvent", AuditEventSchema);

export const ScrubAttestation: Model<ScrubAttestationRecord> =
  mongoose.models.ScrubAttestation ||
  mongoose.model<ScrubAttestationRecord>("ScrubAttestation", ScrubAttestationSchema);

export const Payout: Model<PayoutRecord> =
  mongoose.models.Payout || mongoose.model<PayoutRecord>("Payout", PayoutRecordSchema);

export const RateLimitBucket: Model<RateLimitBucketRecord> =
  mongoose.models.RateLimitBucket ||
  mongoose.model<RateLimitBucketRecord>("RateLimitBucket", RateLimitBucketSchema);
