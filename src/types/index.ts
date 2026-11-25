/**
 * ZecClaim Domain Types & Interfaces
 * Post-NU7 Consensus (November 2026)
 */

export type ZcashNetwork = "mainnet" | "testnet";

export type CampaignLane = "OFFLINE_ZIP324" | "ONLINE_BATCH" | "HYBRID";

export type CampaignStatus = "ACTIVE" | "LOCKED" | "COMPLETED" | "CLAWED_BACK";

/**
 * Lane 2 slot lifecycle:
 * UNCLAIMED -> SUBMITTED (address in) -> LOCKED_FOR_BATCH (exported) -> BATCHED (payout tx recorded
 * and found on-chain) -> PURGED (address scrubbed). `payoutTxid` survives the scrub.
 */
export type ClaimSlotStatus = "UNCLAIMED" | "SUBMITTED" | "LOCKED_FOR_BATCH" | "BATCHED" | "PURGED";

/**
 * What a link holder reported after a payout was recorded for their link. Fixed values only:
 * free text could carry the recipient's address onto the public proof portal.
 */
export type PayoutReportReason = "NOT_RECEIVED" | "WRONG_AMOUNT";

/**
 * Lane 1 card lifecycle. ZecClaim cannot observe a gift card being swept (each card is its own
 * key), so the states record what people reported and what the chain confirmed:
 * UNCLAIMED -> ACK_CONFIRMED (recipient entered the memo code, optionally with the sweep txid)
 * UNCLAIMED -> DISPUTED (someone reported the card empty) -> ACK_CONFIRMED (recipient still confirms)
 * UNCLAIMED -> CLAWED_BACK (after the expiry height, with a clawback txid found on-chain)
 */
export type VoucherCardState = "UNCLAIMED" | "ACK_CONFIRMED" | "DISPUTED" | "CLAWED_BACK";

export type AuditEventType =
  | "CAMPAIGN_ANCHORED"
  | "FUNDING_CHECKED"
  | "SLOT_CLAIMED"
  | "ACK_VERIFIED"
  | "DISPUTE_FLAGGED"
  | "BATCH_LOCKED"
  | "PAYOUT_RECORDED"
  | "PII_SCRUBBED"
  | "CLAWBACK_RECONCILED"
  | "LINKS_REISSUED";

/**
 * On-chain transaction check (lightwalletd). `shape` counts transparent inputs/outputs and
 * shielded outputs per pool; amounts, recipients and memos of shielded outputs are never visible.
 */
export type ChainCheckStatus = "MINED" | "MEMPOOL" | "NOT_FOUND" | "UNREACHABLE" | "SKIPPED";

export interface CompactTxShape {
  transparentInputs: number;
  transparentOutputs: number;
  transparentOutputZat: number;
  saplingSpends: number;
  saplingOutputs: number;
  orchardActions: number;
  ironwoodActions: number;
  feeZat: number | null;
}

export interface ChainTxCheck {
  status: ChainCheckStatus;
  txid: string;
  network: ZcashNetwork;
  height: number | null;
  tipHeight: number | null;
  confirmations: number | null;
  shape: CompactTxShape | null;
  checkedAt: string;
  endpoint: string | null;
  note: string | null;
}

export interface CampaignRecord {
  campaignId: string;
  title: string;
  description?: string;
  network: ZcashNetwork;
  lane: CampaignLane;
  ufvk: string;
  fundingTxid: string;
  totalFundedZat: number;
  slotCount: number;
  /**
   * Gift-card amounts the organizer anchored before minting (one entry per card, zatoshi).
   * Imported cards must match it; absent means amounts come from the CSV at import.
   */
  cardPlanZat?: number[];
  clawbackAddress: string;
  clawbackExpiryHeight: number;
  /** Date the organizer picked for the clawback; `clawbackExpiryHeight` was derived from it. */
  clawbackAt?: Date;
  adminSecretHash?: string;
  isDemo?: boolean;
  isSplitCustody?: boolean;
  /** Publish the full UFVK on public pages. Off by default: its OVK decrypts every payout. */
  publishUfvk?: boolean;
  /** Chain tip when the campaign was anchored (null if the node was unreachable). */
  anchorHeight?: number | null;
  fundingCheck?: ChainTxCheck;
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
  batchIndex?: number; // chunk index inside its batch run
  batchRun?: number; // which "Lock & Export" run the slot belongs to (1, 2, ...)
  payoutTxid?: string; // recorded payout transaction that paid this slot's chunk
  /** The link holder's public report that the recorded payout did not arrive as promised. */
  payoutReport?: PayoutReportReason;
  payoutReportedAt?: Date;
  purgeHash?: string;
  createdAt: Date;
}

export interface VoucherCardRecord {
  campaignId: string;
  cardId: string;
  amountZat: number;
  feeBufferZat: number;
  ackCodeHash: string;
  state: VoucherCardState;
  /** Sweep txid the recipient supplied with their ACK, and what the chain said about it. */
  sweepTxid?: string;
  sweepCheck?: ChainTxCheck;
  ackSubmittedAt?: Date;
  disputeReason?: string;
  disputedAt?: Date;
  clawbackTxid?: string;
  isSplitCustody?: boolean;
  memoRef?: string;
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

/** One recorded payout transaction for a Lane 2 batch run chunk. */
export interface PayoutRecord {
  campaignId: string;
  batchRun: number;
  chunkIndex: number;
  recipients: number;
  txid: string;
  check: ChainTxCheck;
  recordedAt: Date;
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
 * Known typecodes: 0x00 P2PKH, 0x01 P2SH, 0x02 Sapling, 0x03 Orchard (shared by Ironwood).
 * Any other value is an unrecognised item that ZIP 316 consumers must ignore.
 */
export type ReceiverTypecode = number;

export interface ParsedReceiver {
  typecode: ReceiverTypecode;
  typeName: "P2PKH" | "P2SH" | "Sapling" | "Orchard" | "Unknown";
  data: Uint8Array;
}

export interface UfvkInspectionResult {
  isValid: boolean;
  network?: ZcashNetwork;
  errorMessage?: string;
  items: { typecode: number; name: string }[];
}

export interface Zip316InspectionResult {
  isValid: boolean;
  isShielded: boolean;
  hasTransparentReceiver: boolean;
  poolType: "ORCHARD" | "IRONWOOD" | "SAPLING" | "TRANSPARENT_REJECTED" | "INVALID";
  receivers: ParsedReceiver[];
  network?: ZcashNetwork;
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
