import {
  CampaignRecord,
  ClaimSlotRecord,
  VoucherCardRecord,
  AuditEventRecord,
  ScrubAttestationRecord,
  PayoutRecord,
} from "@/types";
import { buildDemoFixtures } from "@/lib/demo/fixtures";
import { isSandboxEnabled } from "@/lib/demo/sandbox";

/**
 * In-memory store, used when no MONGODB_URI is configured (local runs and tests).
 *
 * It is a single per-process instance kept on globalThis: Next.js compiles route handlers as
 * separate module graphs in development, so a module-level instance would give every API route
 * its own copy of the data (a claim link created by one route would be "invalid" in the next).
 * It is never shared between serverless instances, which is why production requires MongoDB.
 */

class MemoryStore {
  private campaigns: Map<string, CampaignRecord> = new Map();
  private claimSlots: Map<string, ClaimSlotRecord> = new Map(); // key: tokenHash
  private voucherCards: Map<string, VoucherCardRecord> = new Map(); // key: campaignId:cardId
  private auditEvents: AuditEventRecord[] = [];
  private scrubAttestations: Map<string, ScrubAttestationRecord[]> = new Map(); // key: campaignId
  private payouts: PayoutRecord[] = [];

  private seeded = false;

  /**
   * Seeds the demo lazily on first use, not at import. Seeding hashes demo claim tokens with
   * the server pepper, and importing this module must not require that secret (Next.js
   * imports route modules at build time to collect page data).
   */
  private ensureSeeded() {
    if (!this.seeded) {
      this.seeded = true;
      if (isSandboxEnabled()) this.seedDemoCampaign();
    }
  }

  /**
   * Removes every record of the demo campaign and re-inserts the shared fixtures.
   * Idempotent: repeated calls never duplicate audit events or attestations.
   */
  public seedDemoCampaign() {
    this.seeded = true;
    const fixtures = buildDemoFixtures();
    const demoId = fixtures.campaign.campaignId;

    this.campaigns.delete(demoId);
    for (const [key, slot] of this.claimSlots) {
      if (slot.campaignId === demoId) this.claimSlots.delete(key);
    }
    for (const [key, card] of this.voucherCards) {
      if (card.campaignId === demoId) this.voucherCards.delete(key);
    }
    this.auditEvents = this.auditEvents.filter((e) => e.campaignId !== demoId);
    this.scrubAttestations.delete(demoId);
    this.payouts = this.payouts.filter((p) => p.campaignId !== demoId);

    this.campaigns.set(demoId, fixtures.campaign);
    for (const slot of fixtures.claimSlots) {
      this.claimSlots.set(slot.tokenHash, slot);
    }
    for (const card of fixtures.vouchers) {
      this.voucherCards.set(`${demoId}:${card.cardId}`, card);
    }
    this.auditEvents.push(...fixtures.auditEvents);
    this.scrubAttestations.set(demoId, [fixtures.scrubAttestation]);
    this.payouts.push(...fixtures.payouts);
  }

  // Campaigns
  public async getCampaign(campaignId: string): Promise<CampaignRecord | null> {
    this.ensureSeeded();
    return this.campaigns.get(campaignId) || null;
  }

  public async saveCampaign(campaign: CampaignRecord): Promise<CampaignRecord> {
    this.ensureSeeded();
    this.campaigns.set(campaign.campaignId, campaign);
    return campaign;
  }

  public async listCampaigns(): Promise<CampaignRecord[]> {
    this.ensureSeeded();
    return Array.from(this.campaigns.values());
  }

  // Claim Slots
  public async saveClaimSlot(slot: ClaimSlotRecord): Promise<ClaimSlotRecord> {
    this.ensureSeeded();
    this.claimSlots.set(slot.tokenHash, slot);
    return slot;
  }

  public async getClaimSlotByTokenHash(tokenHash: string): Promise<ClaimSlotRecord | null> {
    this.ensureSeeded();
    return this.claimSlots.get(tokenHash) || null;
  }

  public async getClaimSlotsByCampaign(campaignId: string): Promise<ClaimSlotRecord[]> {
    this.ensureSeeded();
    return Array.from(this.claimSlots.values()).filter((s) => s.campaignId === campaignId);
  }

  public async updateClaimSlot(
    tokenHash: string,
    updates: Partial<ClaimSlotRecord>
  ): Promise<ClaimSlotRecord | null> {
    this.ensureSeeded();
    const existing = this.claimSlots.get(tokenHash);
    if (!existing) return null;
    const updated = { ...existing, ...updates };
    this.claimSlots.set(tokenHash, updated);
    return updated;
  }

  // Voucher Cards
  public async saveVoucherCard(card: VoucherCardRecord): Promise<VoucherCardRecord> {
    this.ensureSeeded();
    this.voucherCards.set(`${card.campaignId}:${card.cardId}`, card);
    return card;
  }

  public async getVoucherCard(campaignId: string, cardId: string): Promise<VoucherCardRecord | null> {
    this.ensureSeeded();
    return this.voucherCards.get(`${campaignId}:${cardId}`) || null;
  }

  public async getVoucherCardsByCampaign(campaignId: string): Promise<VoucherCardRecord[]> {
    this.ensureSeeded();
    return Array.from(this.voucherCards.values()).filter((c) => c.campaignId === campaignId);
  }

  public async updateVoucherCard(
    campaignId: string,
    cardId: string,
    updates: Partial<VoucherCardRecord>
  ): Promise<VoucherCardRecord | null> {
    this.ensureSeeded();
    const key = `${campaignId}:${cardId}`;
    const existing = this.voucherCards.get(key);
    if (!existing) return null;
    const updated = { ...existing, ...updates };
    this.voucherCards.set(key, updated);
    return updated;
  }

  // Audit Events
  public async recordAuditEvent(event: AuditEventRecord): Promise<AuditEventRecord> {
    this.ensureSeeded();
    this.auditEvents.push(event);
    return event;
  }

  public async getAuditEventsByCampaign(campaignId: string): Promise<AuditEventRecord[]> {
    this.ensureSeeded();
    return this.auditEvents
      .filter((e) => e.campaignId === campaignId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // Scrub Attestations
  public async recordScrubAttestation(attestation: ScrubAttestationRecord): Promise<ScrubAttestationRecord> {
    this.ensureSeeded();
    const existing = this.scrubAttestations.get(attestation.campaignId) || [];
    existing.push(attestation);
    this.scrubAttestations.set(attestation.campaignId, existing);
    return attestation;
  }

  public async getLatestScrubAttestation(campaignId: string): Promise<ScrubAttestationRecord | null> {
    this.ensureSeeded();
    const list = this.scrubAttestations.get(campaignId) || [];
    if (list.length === 0) return null;
    return list[list.length - 1];
  }

  // Payout records
  public async savePayouts(records: PayoutRecord[]): Promise<void> {
    this.ensureSeeded();
    this.payouts.push(...records);
  }

  public async findPayoutsByTxids(txids: string[]): Promise<PayoutRecord[]> {
    this.ensureSeeded();
    const wanted = new Set(txids);
    return this.payouts.filter((p) => wanted.has(p.txid));
  }

  public async getPayoutsByCampaign(campaignId: string): Promise<PayoutRecord[]> {
    this.ensureSeeded();
    return this.payouts
      .filter((p) => p.campaignId === campaignId)
      .sort((a, b) => a.batchRun - b.batchRun || a.chunkIndex - b.chunkIndex);
  }

  public clearAll() {
    this.seeded = true;
    this.campaigns.clear();
    this.claimSlots.clear();
    this.voucherCards.clear();
    this.auditEvents = [];
    this.scrubAttestations.clear();
    this.payouts = [];
    if (isSandboxEnabled()) this.seedDemoCampaign();
  }

  /** Moves a slot to a new token hash (claim link reissue). */
  public rekeyClaimSlot(oldHash: string, newHash: string): boolean {
    this.ensureSeeded();
    const slot = this.claimSlots.get(oldHash);
    if (!slot || this.claimSlots.has(newHash)) return false;
    this.claimSlots.delete(oldHash);
    this.claimSlots.set(newHash, { ...slot, tokenHash: newHash });
    return true;
  }
}

declare global {
  var zecclaimMemoryStore: MemoryStore | undefined;
}

export const memoryStore: MemoryStore = globalThis.zecclaimMemoryStore ?? new MemoryStore();
globalThis.zecclaimMemoryStore = memoryStore;
