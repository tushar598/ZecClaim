/**
 * ZecClaim Domain Types & Interfaces
 * Post-NU7 Consensus (November 2026)
 */

export type ZcashNetwork = "mainnet" | "testnet";

export type CampaignLane = "OFFLINE_ZIP324" | "ONLINE_BATCH" | "HYBRID";

export type CampaignStatus = "ACTIVE" | "LOCKED" | "COMPLETED" | "CLAWED_BACK";

export type ClaimSlotStatus = "UNCLAIMED" | "SUBMITTED" | "BATCHED" | "PURGED";

export type VoucherCardState = "UNCLAIMED" | "SPENT" | "ACK_CONFIRMED" | "DISPUTED" | "CLAWED_BACK";

export type AuditEventType =
  | "CAMPAIGN_ANCHORED"
  | "SLOT_CLAIMED"
  | "NULLIFIER_SPENT"
  | "ACK_VERIFIED"
  | "DISPUTE_FLAGGED"
  | "BATCH_LOCKED"
  | "PII_SCRUBBED"
  | "CLAWBACK_RECONCILED";

export interface CampaignRecord {
  campaignId: string;
  title: string;
  description?: string;
  lane: CampaignLane;
  ufvk: string;
  fundingTxid: string;
  totalFundedZat: number;
  slotCount: number;
  clawbackAddress: string;
  clawbackExpiryHeight: number;
  status: CampaignStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClaimSlotRecord {
  campaignId: string;
  tokenHash: string;
  amountZat: number;
  slotIndex: number;
  status: ClaimSlotStatus;
  recipientAddress?: string;
  addressPoolType?: "ORCHARD" | "IRONWOOD" | "SAPLING";
  submittedAt?: Date;
  batchIndex?: number;
  purgeHash?: string;
  createdAt: Date;
}

export interface VoucherCardRecord {
  campaignId: string;
  cardId: string;
  amountZat: number;
  feeBufferZat: number;
  nullifierHex?: string;
  ackCodeHash: string;
  state: VoucherCardState;
  spentAtHeight?: number;
  spentTxid?: string;
  ackSubmittedAt?: Date;
  disputeReason?: string;
  createdAt: Date;
}

export interface AuditEventRecord {
  campaignId: string;
  eventType: AuditEventType;
  details: Record<string, unknown>;
  blockHeight?: number;
  txid?: string;
  timestamp: Date;
}

export interface ScrubAttestationRecord {
  campaignId: string;
  addressesPurgedCount: number;
  sha256PurgedSetHash: string;
  executedAt: Date;
  receiptTxid?: string;
}

/**
 * ZIP 316 Receiver Types
 */
export type ReceiverTypecode =
  | 0x00 // P2PKH (Transparent)
  | 0x01 // P2SH (Transparent)
  | 0x02 // Sapling
  | 0x03 // Orchard
  | 0x04; // Ironwood

export interface ParsedReceiver {
  typecode: ReceiverTypecode;
  typeName: "P2PKH" | "P2SH" | "Sapling" | "Orchard" | "Ironwood" | "Unknown";
  data: Uint8Array;
}

export interface Zip316InspectionResult {
  isValid: boolean;
  isShielded: boolean;
  hasTransparentReceiver: boolean;
  poolType: "ORCHARD" | "IRONWOOD" | "SAPLING" | "TRANSPARENT_REJECTED" | "INVALID";
  receivers: ParsedReceiver[];
  errorMessage?: string;
  warningMessage?: string;
}

/**
 * Batch & Fee Types (ZIP 317 / 2009)
 */
export interface RecipientPayment {
  address: string;
  amountZat: number;
  memo?: string;
  slotId?: string;
}

export interface PayoutChunk {
  batchIndex: number;
  recipients: RecipientPayment[];
  actionsCount: number;
  estimatedFeeZat: number;
  zip321Uri: string;
}
