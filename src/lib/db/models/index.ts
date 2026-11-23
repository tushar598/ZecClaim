import mongoose, { Schema, Model } from "mongoose";
import {
  CampaignRecord,
  ClaimSlotRecord,
  VoucherCardRecord,
  AuditEventRecord,
  ScrubAttestationRecord,
} from "@/types";

/**
 * 1. Campaign Schema
 */
const CampaignSchema = new Schema<CampaignRecord>(
  {
    campaignId: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    description: { type: String },
    lane: {
      type: String,
      enum: ["OFFLINE_ZIP324", "ONLINE_BATCH", "HYBRID"],
      required: true,
    },
    ufvk: { type: String, required: true },
    fundingTxid: { type: String, required: true },
    totalFundedZat: { type: Number, required: true },
    slotCount: { type: Number, required: true },
    clawbackAddress: { type: String, required: true },
    clawbackExpiryHeight: { type: Number, required: true },
    status: {
      type: String,
      enum: ["ACTIVE", "LOCKED", "COMPLETED", "CLAWED_BACK"],
      default: "ACTIVE",
    },
  },
  { timestamps: true }
);

/**
 * 2. ClaimSlot Schema (with 7-Day TTL Auto-Purge)
 */
const ClaimSlotSchema = new Schema<ClaimSlotRecord>(
  {
    campaignId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    amountZat: { type: Number, required: true },
    slotIndex: { type: Number, required: true },
    status: {
      type: String,
      enum: ["UNCLAIMED", "SUBMITTED", "BATCHED", "PURGED"],
      default: "UNCLAIMED",
    },
    recipientAddress: { type: String },
    addressPoolType: {
      type: String,
      enum: ["ORCHARD", "IRONWOOD", "SAPLING"],
    },
    submittedAt: { type: Date },
    batchIndex: { type: Number },
    purgeHash: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Auto-purge TTL index: deletes claim slots 7 days after creation
ClaimSlotSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 });

/**
 * 3. VoucherCard Schema (Lane 1 ZIP 324)
 */
const VoucherCardSchema = new Schema<VoucherCardRecord>(
  {
    campaignId: { type: String, required: true, index: true },
    cardId: { type: String, required: true },
    amountZat: { type: Number, required: true },
    feeBufferZat: { type: Number, required: true, default: 2000 },
    nullifierHex: { type: String, index: true },
    ackCodeHash: { type: String, required: true },
    state: {
      type: String,
      enum: ["UNCLAIMED", "SPENT", "ACK_CONFIRMED", "DISPUTED", "CLAWED_BACK"],
      default: "UNCLAIMED",
    },
    spentAtHeight: { type: Number },
    spentTxid: { type: String },
    ackSubmittedAt: { type: Date },
    disputeReason: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

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
        "SLOT_CLAIMED",
        "NULLIFIER_SPENT",
        "ACK_VERIFIED",
        "DISPUTE_FLAGGED",
        "BATCH_LOCKED",
        "PII_SCRUBBED",
        "CLAWBACK_RECONCILED",
      ],
      required: true,
    },
    details: { type: Schema.Types.Mixed, required: true },
    blockHeight: { type: Number },
    txid: { type: String },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

/**
 * 5. ScrubAttestation Schema
 */
const ScrubAttestationSchema = new Schema<ScrubAttestationRecord>(
  {
    campaignId: { type: String, required: true, index: true },
    addressesPurgedCount: { type: Number, required: true },
    sha256PurgedSetHash: { type: String, required: true },
    executedAt: { type: Date, default: Date.now },
    receiptTxid: { type: String },
  },
  { timestamps: false }
);

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
