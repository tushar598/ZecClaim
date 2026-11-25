import { NextRequest, NextResponse } from "next/server";
import { getRepo } from "@/lib/db/repo";
import { seedDemoCampaign } from "@/lib/db/seedDemo";
import { DEMO_CAMPAIGN_ID } from "@/lib/demo/constants";
import { isSandboxEnabled } from "@/lib/demo/sandbox";
import { toPublicCampaign, toPublicClaimSlot, toPublicVoucher } from "@/lib/security/publicViews";
import { errorResponse } from "@/lib/http";

interface RouteContext {
  params: Promise<{ campaignId: string }>;
}

/**
 * GET /api/campaigns/[campaignId]
 * Public campaign detail used by the organizer console: slot and card counts, sanitized lists,
 * recorded payouts and recent audit events. Never returns hashes, addresses or the full UFVK
 * (unless the organizer chose to publish it).
 */
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { campaignId } = await context.params;
    if (!campaignId) {
      return NextResponse.json({ success: false, error: "Campaign ID is required" }, { status: 400 });
    }

    if (campaignId === DEMO_CAMPAIGN_ID && !isSandboxEnabled()) {
      return NextResponse.json({ success: false, error: "Campaign not found" }, { status: 404 });
    }
    const repo = await getRepo();
    let campaign = await repo.getCampaign(campaignId);
    if (!campaign && campaignId === DEMO_CAMPAIGN_ID) {
      await seedDemoCampaign(false);
      campaign = await repo.getCampaign(campaignId);
    }
    if (!campaign) {
      return NextResponse.json({ success: false, error: "Campaign not found" }, { status: 404 });
    }

    const [claimSlots, voucherCards, auditEvents, payouts] = await Promise.all([
      repo.getSlots(campaignId),
      repo.getCards(campaignId),
      repo.getEvents(campaignId, 20),
      repo.getPayouts(campaignId),
    ]);

    return NextResponse.json({
      success: true,
      campaign: toPublicCampaign(campaign),
      slots: {
        total: claimSlots.length,
        claimed: claimSlots.filter((s) => s.status !== "UNCLAIMED").length,
        unclaimed: claimSlots.filter((s) => s.status === "UNCLAIMED").length,
        submitted: claimSlots.filter((s) => s.status === "SUBMITTED").length,
        locked: claimSlots.filter((s) => s.status === "LOCKED_FOR_BATCH").length,
        paid: claimSlots.filter((s) => Boolean(s.payoutTxid)).length,
        purged: claimSlots.filter((s) => s.status === "PURGED").length,
        list: claimSlots.map((s) => toPublicClaimSlot(s)).sort((a, b) => a.slotIndex - b.slotIndex),
      },
      vouchers: {
        total: voucherCards.length,
        ackConfirmed: voucherCards.filter((v) => v.state === "ACK_CONFIRMED").length,
        withSweepEvidence: voucherCards.filter((v) => v.sweepCheck?.status === "MINED").length,
        disputed: voucherCards.filter((v) => v.state === "DISPUTED" || Boolean(v.disputeReason)).length,
        clawedBack: voucherCards.filter((v) => v.state === "CLAWED_BACK").length,
        list: voucherCards.map((v) => toPublicVoucher(v)),
      },
      isDemo: Boolean(campaign.isDemo || campaign.campaignId === DEMO_CAMPAIGN_ID),
      payouts: payouts.map((p) => ({
        batchRun: p.batchRun,
        chunkIndex: p.chunkIndex,
        recipients: p.recipients,
        txid: p.txid,
        check: p.check,
        recordedAt: p.recordedAt,
      })),
      auditEvents: auditEvents.map((e) => ({
        eventType: e.eventType,
        details: e.details,
        txid: e.txid,
        blockHeight: e.blockHeight,
        timestamp: e.timestamp,
      })),
    });
  } catch (err: unknown) {
    return errorResponse(err, "Server error", 500);
  }
}
