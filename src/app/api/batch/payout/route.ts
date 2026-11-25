import { NextRequest, NextResponse } from "next/server";
import { RecordPayoutSchema } from "@/lib/validators";
import { verifyCampaignAdmin } from "@/lib/security/auth";
import { getRepo } from "@/lib/db/repo";
import { checkTransaction } from "@/lib/chain/txCheck";
import { payoutProblems } from "@/lib/chain/describe";
import { errorResponse } from "@/lib/http";
import { DEMO_CAMPAIGN_ID } from "@/lib/demo/constants";
import type { ChainTxCheck, PayoutRecord } from "@/types";

/**
 * POST /api/batch/payout
 * Protected by x-admin-secret.
 *
 * Records the transaction(s) the organizer's wallet broadcast for one exported batch run, one
 * txid per chunk in chunk order. A txid already recorded by another campaign (as a payout or as
 * its funding) is refused. Each txid is looked up on the campaign's network:
 * - not found -> refused (nothing is recorded);
 * - mined before the campaign was anchored -> refused (it cannot pay links issued later);
 * - mined or in the mempool -> recorded with its shape (transparent inputs/outputs, shielded
 *   outputs per pool). Problems such as fewer shielded outputs than recipients, or transparent
 *   outputs, are stored and shown publicly next to the payout.
 *
 * Recording moves the run's slots from LOCKED_FOR_BATCH to BATCHED with `payoutTxid`, which is
 * what the proof portal counts as distributed and what the address scrub requires.
 *
 * Limit: shielded transactions hide their sender, so this cannot tell whether the payout came
 * from the campaign account. An auditor holding the viewing key can; link holders can report a
 * payout that never arrived (POST /api/claims/report).
 */
export async function POST(req: NextRequest) {
  try {
    const parsed = RecordPayoutSchema.parse(await req.json());

    const auth = await verifyCampaignAdmin(req, parsed.campaignId);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });
    }

    const repo = await getRepo();
    const campaign = await repo.getCampaign(parsed.campaignId);
    if (!campaign) return NextResponse.json({ success: false, error: "Campaign not found." }, { status: 404 });

    const runSlots = (await repo.getSlots(parsed.campaignId)).filter((s) => (s.batchRun ?? 0) === parsed.batchRun);
    if (runSlots.length === 0) {
      return NextResponse.json({ success: false, error: `Batch run ${parsed.batchRun} does not exist.` }, { status: 404 });
    }
    if (runSlots.some((s) => s.payoutTxid)) {
      return NextResponse.json({ success: false, error: `Batch run ${parsed.batchRun} already has a recorded payout.` }, { status: 409 });
    }
    const locked = runSlots.filter((s) => s.status === "LOCKED_FOR_BATCH");
    if (locked.length === 0) {
      return NextResponse.json({ success: false, error: `Batch run ${parsed.batchRun} has no exported recipients awaiting payout.` }, { status: 409 });
    }

    const chunkCount = Math.max(...locked.map((s) => s.batchIndex ?? 0)) + 1;
    if (parsed.txids.length !== chunkCount) {
      return NextResponse.json(
        { success: false, error: `Batch run ${parsed.batchRun} was exported as ${chunkCount} transaction(s). Enter exactly ${chunkCount} txid(s), in chunk order.` },
        { status: 400 }
      );
    }
    if (new Set(parsed.txids).size !== parsed.txids.length) {
      return NextResponse.json({ success: false, error: "Each chunk needs its own transaction id." }, { status: 400 });
    }
    const existing = await repo.getPayouts(parsed.campaignId);
    const reused = parsed.txids.find((t) => existing.some((p) => p.txid === t) || t === campaign.fundingTxid);
    if (reused) {
      return NextResponse.json({ success: false, error: `Transaction ${reused} is already recorded for this campaign.` }, { status: 409 });
    }
    // One transaction pays one campaign's batch. Sandbox records never block a real campaign.
    const elsewhere = (await repo.findPayoutsByTxids(parsed.txids)).find(
      (p) => p.campaignId !== campaign.campaignId && p.campaignId !== DEMO_CAMPAIGN_ID
    );
    if (elsewhere) {
      return NextResponse.json(
        { success: false, error: `Transaction ${elsewhere.txid} is already recorded as the payout of another campaign. One transaction can pay only one campaign.` },
        { status: 409 }
      );
    }
    for (const t of parsed.txids) {
      const funded = await repo.findCampaignByFundingTxid(campaign.network, t);
      if (funded && funded.campaignId !== DEMO_CAMPAIGN_ID) {
        return NextResponse.json(
          { success: false, error: `Transaction ${t} is the funding transaction of a campaign, not a payout.` },
          { status: 409 }
        );
      }
    }

    const checks: ChainTxCheck[] = await Promise.all(parsed.txids.map((t) => checkTransaction(campaign.network, t)));
    const missing = checks.find((c) => c.status === "NOT_FOUND");
    if (missing) {
      return NextResponse.json(
        { success: false, error: `Transaction ${missing.txid} was not found on ${campaign.network}. Check the txid your wallet printed.`, checks },
        { status: 422 }
      );
    }
    const isDemo = Boolean(campaign.isDemo || campaign.campaignId === DEMO_CAMPAIGN_ID);
    const unreachable = checks.find((c) => c.status === "UNREACHABLE");
    if (unreachable && !isDemo) {
      return NextResponse.json(
        { success: false, error: `Cannot check transactions right now (${unreachable.note}). Try again shortly.`, checks },
        { status: 503 }
      );
    }
    // A payout is sent after the links went out, so it cannot be mined before the campaign was
    // anchored. (The sandbox's anchor height is a fixture, so it is exempt.)
    const floor = isDemo ? null : campaign.anchorHeight ?? campaign.fundingCheck?.height ?? null;
    const tooOld = floor === null ? undefined : checks.find((c) => c.status === "MINED" && c.height !== null && c.height < floor);
    if (tooOld) {
      return NextResponse.json(
        {
          success: false,
          error: `Transaction ${tooOld.txid} was mined at height ${tooOld.height}, before this campaign was anchored (height ${floor}), so it cannot be its payout.`,
          checks,
        },
        { status: 422 }
      );
    }

    const now = new Date();
    const records: PayoutRecord[] = parsed.txids.map((txid, chunkIndex) => ({
      campaignId: parsed.campaignId,
      batchRun: parsed.batchRun,
      chunkIndex,
      recipients: locked.filter((s) => (s.batchIndex ?? 0) === chunkIndex).length,
      txid,
      check: checks[chunkIndex],
      recordedAt: now,
    }));

    for (const record of records) {
      const slotHashes = locked.filter((s) => (s.batchIndex ?? 0) === record.chunkIndex).map((s) => s.tokenHash);
      await repo.updateSlots(parsed.campaignId, slotHashes, { status: "BATCHED", payoutTxid: record.txid }, ["LOCKED_FOR_BATCH"]);
    }
    await repo.insertPayouts(records);

    const problems = records.flatMap((r) => payoutProblems(r.check, r.recipients).map((p) => `Chunk ${r.chunkIndex + 1}: ${p}`));
    await repo.recordEvent({
      campaignId: parsed.campaignId,
      eventType: "PAYOUT_RECORDED",
      details: {
        batchRun: parsed.batchRun,
        txids: parsed.txids,
        recipients: locked.length,
        statuses: checks.map((c) => c.status),
        heights: checks.map((c) => c.height),
        problems,
      },
      txid: parsed.txids[0],
      blockHeight: checks[0].height ?? undefined,
      timestamp: now,
    });

    return NextResponse.json({
      success: true,
      batchRun: parsed.batchRun,
      paidRecipients: locked.length,
      payouts: records.map((r) => ({ chunkIndex: r.chunkIndex, recipients: r.recipients, txid: r.txid, check: r.check })),
      problems,
      message: problems.length
        ? "Payout recorded with problems that are shown on the proof portal."
        : "Payout recorded and found on-chain.",
    });
  } catch (err: unknown) {
    return errorResponse(err, "Invalid request");
  }
}
