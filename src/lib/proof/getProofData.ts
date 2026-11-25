import { getRepo, Repo } from "@/lib/db/repo";
import { seedDemoCampaign } from "@/lib/db/seedDemo";
import { computeLedger, CampaignLedger, matchCardsToPlan } from "@/lib/campaign/budget";
import { checkIsStale, checkTransaction } from "@/lib/chain/txCheck";
import { ufvkFingerprint } from "@/lib/security/publicViews";
import { inspectUnifiedViewingKey } from "@/lib/zcash/zip316";
import { DEMO_CAMPAIGN_ID } from "@/lib/demo/constants";
import { isSandboxEnabled } from "@/lib/demo/sandbox";
import type {
  AuditEventType,
  CampaignLane,
  CampaignRecord,
  CampaignStatus,
  ChainTxCheck,
  ClaimSlotStatus,
  PayoutRecord,
  PayoutReportReason,
  VoucherCardRecord,
  VoucherCardState,
  ZcashNetwork,
} from "@/types";

/**
 * Public proof-portal data for one campaign.
 *
 * This is the only shape the portal (page and /api/proof) renders. It is built field by
 * field, so ACK hashes, admin hashes, claim token hashes, recipient addresses and (unless the
 * organizer opted in) the UFVK itself can never leak through it.
 *
 * Chain checks that can still change (mempool, unreachable node, few confirmations) are
 * refreshed here at most once a minute, so the portal converges on what the chain says.
 */
export interface ProofVoucher {
  cardId: string;
  amountZat: number;
  feeBufferZat: number;
  state: VoucherCardState;
  sweepTxid: string | null;
  sweepCheck: ChainTxCheck | null;
  ackSubmittedAt: string | null;
  disputeReason: string | null;
  disputedAt: string | null;
  clawbackTxid: string | null;
  isSplitCustody: boolean;
  createdAt: string;
}

export interface ProofSlot {
  slotIndex: number;
  amountZat: number;
  status: ClaimSlotStatus;
  addressPoolType: string | null;
  batchRun: number | null;
  payoutTxid: string | null;
  payoutReport: PayoutReportReason | null;
  payoutReportedAt: string | null;
  createdAt: string;
}

export interface ProofPayout {
  batchRun: number;
  chunkIndex: number;
  recipients: number;
  txid: string;
  check: ChainTxCheck;
  recordedAt: string;
}

export interface ProofAuditEvent {
  eventType: AuditEventType;
  details: Record<string, unknown>;
  blockHeight: number | null;
  txid: string | null;
  timestamp: string;
}

export interface CampaignProofData {
  campaignId: string;
  title: string;
  description: string | null;
  network: ZcashNetwork;
  lane: CampaignLane;
  status: CampaignStatus;
  isDemo: boolean;
  isSplitCustody: boolean;
  ufvk: {
    fingerprint: string;
    published: string | null;
    items: string[];
  };
  fundingTxid: string;
  fundingCheck: ChainTxCheck | null;
  anchorHeight: number | null;
  totalFundedZat: number;
  clawbackAddress: string;
  clawbackExpiryHeight: number;
  clawbackAt: string | null;
  createdAt: string;
  consensus: {
    branchId: string;
    targetSpacingSeconds: number;
    blockActionLimit: number;
    safeBatchChunkCap: number;
    marginalFeeZat: number;
    minimumSweepFeeZat: number;
  };
  ledger: CampaignLedger;
  /**
   * Gift-card amounts the organizer anchored before minting, and how many registered cards match
   * them. Open entries are still inside "unallocated" in the ledger. Null without a plan.
   */
  cardPlan: {
    amountsZat: number[];
    totalZat: number;
    registeredCount: number;
    openZat: number[];
  } | null;
  addressesStored: number;
  vouchers: ProofVoucher[];
  slots: ProofSlot[];
  payouts: ProofPayout[];
  auditEvents: ProofAuditEvent[];
  scrubAttestation: {
    addressesPurgedCount: number;
    sha256PurgedSetHash: string;
    executedAt: string;
  } | null;
}

const iso = (d: Date | string | undefined) => new Date(d ?? Date.now()).toISOString();
const isoOrNull = (d: Date | string | undefined) => (d ? new Date(d).toISOString() : null);
const RECHECK_AFTER_MS = 60_000;
const PURGED = "[PURGED]";

/** Re-runs chain checks that may have changed. Never for the demo's fixture txids. */
async function refreshChecks(
  repo: Repo,
  campaign: CampaignRecord,
  vouchers: VoucherCardRecord[],
  payouts: PayoutRecord[]
) {
  const jobs: Promise<void>[] = [];
  if (checkIsStale(campaign.fundingCheck, RECHECK_AFTER_MS)) {
    jobs.push(
      checkTransaction(campaign.network, campaign.fundingTxid, { timeoutMs: 4000 }).then(async (check) => {
        if (check.status === "UNREACHABLE" && campaign.fundingCheck && campaign.fundingCheck.status !== "UNREACHABLE") return;
        campaign.fundingCheck = check;
        await repo.updateCampaign(campaign.campaignId, { fundingCheck: check });
      })
    );
  }
  for (const p of payouts) {
    if (!checkIsStale(p.check, RECHECK_AFTER_MS)) continue;
    jobs.push(
      checkTransaction(campaign.network, p.txid, { timeoutMs: 4000 }).then(async (check) => {
        if (check.status === "UNREACHABLE") return;
        p.check = check;
        await repo.updatePayoutCheck(campaign.campaignId, p.txid, check);
      })
    );
  }
  for (const v of vouchers) {
    if (!v.sweepTxid || !checkIsStale(v.sweepCheck, RECHECK_AFTER_MS)) continue;
    const txid = v.sweepTxid;
    jobs.push(
      checkTransaction(campaign.network, txid, { timeoutMs: 4000 }).then(async (check) => {
        if (check.status === "UNREACHABLE") return;
        v.sweepCheck = check;
        await repo.updateCard(campaign.campaignId, v.cardId, { sweepCheck: check });
      })
    );
  }
  await Promise.allSettled(jobs);
}

export async function getCampaignProofData(campaignId: string): Promise<CampaignProofData | null> {
  if (campaignId === DEMO_CAMPAIGN_ID) {
    if (!isSandboxEnabled()) return null;
    await seedDemoCampaign(false);
  }
  const repo = await getRepo();
  const campaign = await repo.getCampaign(campaignId);
  if (!campaign) return null;

  const [vouchers, slots, auditEvents, attestation, payouts] = await Promise.all([
    repo.getCards(campaignId),
    repo.getSlots(campaignId),
    repo.getEvents(campaignId, 50),
    repo.getLatestScrub(campaignId),
    repo.getPayouts(campaignId),
  ]);

  const isDemo = Boolean(campaign.isDemo || campaign.campaignId === DEMO_CAMPAIGN_ID);
  if (!isDemo) await refreshChecks(repo, campaign, vouchers, payouts);

  const ufvkItems = inspectUnifiedViewingKey(campaign.ufvk).items.map((i) => i.name);
  const planZat = campaign.cardPlanZat ?? [];
  const planMatch = planZat.length ? matchCardsToPlan(planZat, vouchers) : null;
  const cardPlan = planMatch
    ? {
        amountsZat: planZat,
        totalZat: planZat.reduce((sum, a) => sum + a, 0),
        registeredCount: planMatch.matchedCount,
        openZat: planMatch.remainingZat,
      }
    : null;

  return {
    campaignId: campaign.campaignId,
    title: campaign.title,
    description: campaign.description ?? null,
    network: campaign.network,
    lane: campaign.lane,
    status: campaign.status,
    isDemo,
    isSplitCustody: Boolean(campaign.isSplitCustody),
    ufvk: {
      fingerprint: ufvkFingerprint(campaign.ufvk),
      published: campaign.publishUfvk ? campaign.ufvk : null,
      items: ufvkItems,
    },
    fundingTxid: campaign.fundingTxid,
    fundingCheck: campaign.fundingCheck ?? null,
    anchorHeight: campaign.anchorHeight ?? null,
    totalFundedZat: campaign.totalFundedZat,
    clawbackAddress: campaign.clawbackAddress,
    clawbackExpiryHeight: campaign.clawbackExpiryHeight,
    clawbackAt: isoOrNull(campaign.clawbackAt),
    createdAt: iso(campaign.createdAt),
    consensus: {
      branchId: "0x77190AD9", // ZIP 259 NU7 consensus branch ID
      targetSpacingSeconds: 25, // ZIP 259 / ZIP 218 NU7 block target spacing
      blockActionLimit: 330, // ZIP 218 shielded action budget
      safeBatchChunkCap: 300, // ZecClaim margin under the cap
      marginalFeeZat: 1000, // ZIP 2009 marginal fee
      minimumSweepFeeZat: 2000, // ZIP 317 grace actions x ZIP 2009 marginal fee
    },
    ledger: computeLedger({ totalFundedZat: campaign.totalFundedZat, vouchers, slots }),
    cardPlan,
    addressesStored: slots.filter((s) => s.recipientAddress && s.recipientAddress !== PURGED).length,
    vouchers: vouchers
      .map((v) => ({
        cardId: v.cardId,
        amountZat: v.amountZat,
        feeBufferZat: v.feeBufferZat,
        state: v.state,
        sweepTxid: v.sweepTxid ?? null,
        sweepCheck: v.sweepCheck ?? null,
        ackSubmittedAt: isoOrNull(v.ackSubmittedAt),
        disputeReason: v.disputeReason ?? null,
        disputedAt: isoOrNull(v.disputedAt),
        clawbackTxid: v.clawbackTxid ?? null,
        isSplitCustody: Boolean(v.isSplitCustody),
        createdAt: iso(v.createdAt),
      }))
      .sort((a, b) => a.cardId.localeCompare(b.cardId)),
    slots: slots
      .map((s) => ({
        slotIndex: s.slotIndex,
        amountZat: s.amountZat,
        status: s.status,
        addressPoolType: s.addressPoolType ?? null,
        batchRun: s.batchRun ?? null,
        payoutTxid: s.payoutTxid ?? null,
        payoutReport: s.payoutReport ?? null,
        payoutReportedAt: isoOrNull(s.payoutReportedAt),
        createdAt: iso(s.createdAt),
      }))
      .sort((a, b) => a.slotIndex - b.slotIndex),
    payouts: payouts.map((p) => ({
      batchRun: p.batchRun,
      chunkIndex: p.chunkIndex,
      recipients: p.recipients,
      txid: p.txid,
      check: p.check,
      recordedAt: iso(p.recordedAt),
    })),
    auditEvents: auditEvents.map((e) => ({
      eventType: e.eventType,
      details: e.details ?? {},
      blockHeight: e.blockHeight ?? null,
      txid: e.txid ?? null,
      timestamp: iso(e.timestamp),
    })),
    scrubAttestation: attestation
      ? {
          addressesPurgedCount: attestation.addressesPurgedCount,
          sha256PurgedSetHash: attestation.sha256PurgedSetHash,
          executedAt: iso(attestation.executedAt),
        }
      : null,
  };
}
