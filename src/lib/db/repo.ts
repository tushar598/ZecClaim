import { connectToDatabase } from "@/lib/db/mongodb";
import { Campaign, ClaimSlot, VoucherCard, AuditEvent, ScrubAttestation, Payout } from "@/lib/db/models";
import { memoryStore } from "@/lib/db/store";
import type {
  AuditEventRecord,
  ChainTxCheck,
  CampaignRecord,
  ClaimSlotRecord,
  ClaimSlotStatus,
  PayoutRecord,
  ScrubAttestationRecord,
  VoucherCardRecord,
  VoucherCardState,
} from "@/types";

/**
 * One data-access interface for every route, backed by MongoDB when MONGODB_URI is configured
 * and by the in-memory store otherwise. Conditional updates (`onlyIf...`) are atomic in MongoDB,
 * so two concurrent requests cannot both move a slot or card out of the same state.
 *
 * Reads return plain objects (never Mongoose documents).
 */
export interface Repo {
  kind: "mongo" | "memory";

  getCampaign(campaignId: string): Promise<CampaignRecord | null>;
  /** The campaign (if any) already anchored with this funding transaction on this network. */
  findCampaignByFundingTxid(network: CampaignRecord["network"], fundingTxid: string): Promise<CampaignRecord | null>;
  insertCampaign(campaign: CampaignRecord): Promise<void>;
  updateCampaign(campaignId: string, patch: Partial<CampaignRecord>): Promise<void>;

  getSlots(campaignId: string): Promise<ClaimSlotRecord[]>;
  getSlotByTokenHash(tokenHash: string): Promise<ClaimSlotRecord | null>;
  insertSlots(slots: ClaimSlotRecord[]): Promise<void>;
  /** Updates the given slots (optionally only those in `onlyIfStatus`); returns how many changed. */
  updateSlots(
    campaignId: string,
    tokenHashes: string[],
    patch: Partial<ClaimSlotRecord>,
    onlyIfStatus?: ClaimSlotStatus[]
  ): Promise<number>;
  /**
   * Replaces an UNCLAIMED slot's token hash (claim link reissue). Atomic: returns false if the
   * slot was claimed in the meantime, so a link in use is never invalidated.
   */
  reissueSlotToken(campaignId: string, oldHash: string, newHash: string): Promise<boolean>;
  /**
   * Stores the link holder's payout report. Atomic: only on a slot with a recorded payout and
   * no earlier report; returns false otherwise.
   */
  reportSlotPayout(campaignId: string, tokenHash: string, report: Pick<ClaimSlotRecord, "payoutReport" | "payoutReportedAt">): Promise<boolean>;

  getCards(campaignId: string): Promise<VoucherCardRecord[]>;
  getCard(campaignId: string, cardId: string): Promise<VoucherCardRecord | null>;
  insertCards(cards: VoucherCardRecord[]): Promise<void>;
  /** Updates one card if its state is in `onlyIfState`; returns the updated card or null. */
  updateCard(
    campaignId: string,
    cardId: string,
    patch: Partial<VoucherCardRecord>,
    onlyIfState?: VoucherCardState[]
  ): Promise<VoucherCardRecord | null>;

  recordEvent(event: AuditEventRecord): Promise<void>;
  getEvents(campaignId: string, limit?: number): Promise<AuditEventRecord[]>;

  recordScrub(attestation: ScrubAttestationRecord): Promise<void>;
  getLatestScrub(campaignId: string): Promise<ScrubAttestationRecord | null>;

  insertPayouts(records: PayoutRecord[]): Promise<void>;
  getPayouts(campaignId: string): Promise<PayoutRecord[]>;
  /** Payout records holding any of these txids, in any campaign. */
  findPayoutsByTxids(txids: string[]): Promise<PayoutRecord[]>;
  updatePayoutCheck(campaignId: string, txid: string, check: ChainTxCheck): Promise<void>;
}

const mongoRepo: Repo = {
  kind: "mongo",

  getCampaign: (campaignId) => Campaign.findOne({ campaignId }).lean<CampaignRecord>().exec(),
  findCampaignByFundingTxid: (network, fundingTxid) =>
    Campaign.findOne({ network, fundingTxid }).lean<CampaignRecord>().exec(),
  async insertCampaign(campaign) {
    await Campaign.create(campaign);
  },
  async updateCampaign(campaignId, patch) {
    await Campaign.updateOne({ campaignId }, { $set: { ...patch, updatedAt: new Date() } });
  },

  getSlots: (campaignId) => ClaimSlot.find({ campaignId }).lean<ClaimSlotRecord[]>().exec(),
  getSlotByTokenHash: (tokenHash) => ClaimSlot.findOne({ tokenHash }).lean<ClaimSlotRecord>().exec(),
  async insertSlots(slots) {
    if (slots.length > 0) await ClaimSlot.insertMany(slots);
  },
  async updateSlots(campaignId, tokenHashes, patch, onlyIfStatus) {
    if (tokenHashes.length === 0) return 0;
    const filter: Record<string, unknown> = { campaignId, tokenHash: { $in: tokenHashes } };
    if (onlyIfStatus) filter.status = { $in: onlyIfStatus };
    const res = await ClaimSlot.updateMany(filter, { $set: patch });
    return res.modifiedCount;
  },
  async reissueSlotToken(campaignId, oldHash, newHash) {
    const res = await ClaimSlot.updateOne(
      { campaignId, tokenHash: oldHash, status: "UNCLAIMED" },
      { $set: { tokenHash: newHash } }
    );
    return res.modifiedCount === 1;
  },
  async reportSlotPayout(campaignId, tokenHash, report) {
    const res = await ClaimSlot.updateOne(
      { campaignId, tokenHash, payoutTxid: { $exists: true }, payoutReport: { $exists: false } },
      { $set: report }
    );
    return res.modifiedCount === 1;
  },

  getCards: (campaignId) => VoucherCard.find({ campaignId }).lean<VoucherCardRecord[]>().exec(),
  getCard: (campaignId, cardId) => VoucherCard.findOne({ campaignId, cardId }).lean<VoucherCardRecord>().exec(),
  async insertCards(cards) {
    if (cards.length > 0) await VoucherCard.insertMany(cards);
  },
  updateCard(campaignId, cardId, patch, onlyIfState) {
    const filter: Record<string, unknown> = { campaignId, cardId };
    if (onlyIfState) filter.state = { $in: onlyIfState };
    return VoucherCard.findOneAndUpdate(filter, { $set: patch }, { new: true }).lean<VoucherCardRecord>().exec();
  },

  async recordEvent(event) {
    await AuditEvent.create(event);
  },
  getEvents: (campaignId, limit = 50) =>
    AuditEvent.find({ campaignId }).sort({ timestamp: -1 }).limit(limit).lean<AuditEventRecord[]>().exec(),

  async recordScrub(attestation) {
    await ScrubAttestation.create(attestation);
  },
  getLatestScrub: (campaignId) =>
    ScrubAttestation.findOne({ campaignId }).sort({ executedAt: -1 }).lean<ScrubAttestationRecord>().exec(),

  async insertPayouts(records) {
    if (records.length > 0) await Payout.insertMany(records);
  },
  getPayouts: (campaignId) =>
    Payout.find({ campaignId }).sort({ batchRun: 1, chunkIndex: 1 }).lean<PayoutRecord[]>().exec(),
  findPayoutsByTxids: (txids) => Payout.find({ txid: { $in: txids } }).lean<PayoutRecord[]>().exec(),
  async updatePayoutCheck(campaignId, txid, check) {
    await Payout.updateOne({ campaignId, txid }, { $set: { check } });
  },
};

const memoryRepo: Repo = {
  kind: "memory",

  getCampaign: (campaignId) => memoryStore.getCampaign(campaignId),
  async findCampaignByFundingTxid(network, fundingTxid) {
    const all = await memoryStore.listCampaigns();
    return all.find((c) => c.network === network && c.fundingTxid === fundingTxid) ?? null;
  },
  async insertCampaign(campaign) {
    await memoryStore.saveCampaign(campaign);
  },
  async updateCampaign(campaignId, patch) {
    const existing = await memoryStore.getCampaign(campaignId);
    if (existing) await memoryStore.saveCampaign({ ...existing, ...patch, updatedAt: new Date() });
  },

  getSlots: (campaignId) => memoryStore.getClaimSlotsByCampaign(campaignId),
  getSlotByTokenHash: (tokenHash) => memoryStore.getClaimSlotByTokenHash(tokenHash),
  async insertSlots(slots) {
    for (const slot of slots) await memoryStore.saveClaimSlot(slot);
  },
  async updateSlots(campaignId, tokenHashes, patch, onlyIfStatus) {
    let changed = 0;
    for (const hash of tokenHashes) {
      const slot = await memoryStore.getClaimSlotByTokenHash(hash);
      if (!slot || slot.campaignId !== campaignId) continue;
      if (onlyIfStatus && !onlyIfStatus.includes(slot.status)) continue;
      await memoryStore.updateClaimSlot(hash, patch);
      changed++;
    }
    return changed;
  },
  async reissueSlotToken(campaignId, oldHash, newHash) {
    const slot = await memoryStore.getClaimSlotByTokenHash(oldHash);
    if (!slot || slot.campaignId !== campaignId || slot.status !== "UNCLAIMED") return false;
    return memoryStore.rekeyClaimSlot(oldHash, newHash);
  },
  async reportSlotPayout(campaignId, tokenHash, report) {
    const slot = await memoryStore.getClaimSlotByTokenHash(tokenHash);
    if (!slot || slot.campaignId !== campaignId || !slot.payoutTxid || slot.payoutReport) return false;
    await memoryStore.updateClaimSlot(tokenHash, report);
    return true;
  },

  getCards: (campaignId) => memoryStore.getVoucherCardsByCampaign(campaignId),
  getCard: (campaignId, cardId) => memoryStore.getVoucherCard(campaignId, cardId),
  async insertCards(cards) {
    for (const card of cards) await memoryStore.saveVoucherCard(card);
  },
  async updateCard(campaignId, cardId, patch, onlyIfState) {
    const card = await memoryStore.getVoucherCard(campaignId, cardId);
    if (!card) return null;
    if (onlyIfState && !onlyIfState.includes(card.state)) return null;
    return memoryStore.updateVoucherCard(campaignId, cardId, patch);
  },

  async recordEvent(event) {
    await memoryStore.recordAuditEvent(event);
  },
  async getEvents(campaignId, limit = 50) {
    return (await memoryStore.getAuditEventsByCampaign(campaignId)).slice(0, limit);
  },

  async recordScrub(attestation) {
    await memoryStore.recordScrubAttestation(attestation);
  },
  getLatestScrub: (campaignId) => memoryStore.getLatestScrubAttestation(campaignId),

  insertPayouts: (records) => memoryStore.savePayouts(records),
  getPayouts: (campaignId) => memoryStore.getPayoutsByCampaign(campaignId),
  findPayoutsByTxids: (txids) => memoryStore.findPayoutsByTxids(txids),
  async updatePayoutCheck(campaignId, txid, check) {
    const record = (await memoryStore.getPayoutsByCampaign(campaignId)).find((p) => p.txid === txid);
    if (record) record.check = check;
  },
};

/** Throws DatabaseUnavailableError in production when MONGODB_URI is set but unreachable. */
export async function getRepo(): Promise<Repo> {
  const db = await connectToDatabase();
  return db ? mongoRepo : memoryRepo;
}
