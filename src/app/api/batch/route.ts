import { NextRequest, NextResponse } from "next/server";
import { LockBatchSchema } from "@/lib/validators";
import { chunkBatchPayouts } from "@/lib/zcash/zip317";
import { generateZingoCliScript } from "@/lib/zcash/zingoScript";
import { verifyCampaignAdmin } from "@/lib/security/auth";
import { getRepo } from "@/lib/db/repo";
import { ClaimSlotRecord, RecipientPayment, PayoutChunk } from "@/types";
import { errorResponse } from "@/lib/http";

const PURGED = "[PURGED]";

const hasAddress = (s: ClaimSlotRecord) =>
  typeof s.recipientAddress === "string" && s.recipientAddress.length > 0 && s.recipientAddress !== PURGED;

/**
 * POST /api/batch
 * Protected by x-admin-secret.
 *
 * Lock & export: every SUBMITTED slot is moved to LOCKED_FOR_BATCH and tagged with a new
 * batch run number (1, 2, ...). Only that run is exported: <= 300-action chunks under ZIP 2009
 * fees, as ZIP 321 URIs and a zingo-cli script for local signing.
 *
 * Re-export: with nothing new to lock, the latest run (or `batchRun` from the body) is
 * regenerated from the locked queue, so an organizer who lost the script can recover it.
 * Runs are never mixed, so a re-export can't pay an earlier, already-broadcast run twice.
 * A run whose payout was already recorded (POST /api/batch/payout) is never re-exported.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = LockBatchSchema.parse(body);

    const auth = await verifyCampaignAdmin(req, parsed.campaignId);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });
    }

    const repo = await getRepo();

    const campaign = await repo.getCampaign(parsed.campaignId);
    if (!campaign) {
      return NextResponse.json({ success: false, error: "Campaign not found." }, { status: 404 });
    }

    const allSlots: ClaimSlotRecord[] = await repo.getSlots(parsed.campaignId);

    const newlySubmitted = allSlots.filter((s) => s.status === "SUBMITTED" && hasAddress(s));

    const latestRun = allSlots.reduce((max, slot) => Math.max(max, slot.batchRun ?? 0), 0);
    let batchRun: number;
    let runSlots: ClaimSlotRecord[];

    if (newlySubmitted.length > 0) {
      batchRun = latestRun + 1;
      const hashes = newlySubmitted.map((s) => s.tokenHash);
      // Conditional on status so a concurrent request cannot lock the same slots into two runs.
      await repo.updateSlots(parsed.campaignId, hashes, { status: "LOCKED_FOR_BATCH", batchRun }, ["SUBMITTED"]);
      // Export what the store actually locked into this run, not this request's snapshot.
      runSlots = (await repo.getSlots(parsed.campaignId)).filter(
        (s) => s.status === "LOCKED_FOR_BATCH" && s.batchRun === batchRun && hasAddress(s)
      );
    } else {
      batchRun = parsed.batchRun ?? latestRun;
      runSlots = allSlots.filter(
        (s) => s.status === "LOCKED_FOR_BATCH" && hasAddress(s) && (s.batchRun ?? 0) === batchRun
      );
    }

    const lockedQueue = [...runSlots].sort((a, b) => a.slotIndex - b.slotIndex);

    if (lockedQueue.length === 0) {
      const paidRun = allSlots.some((s) => (s.batchRun ?? 0) === batchRun && s.payoutTxid);
      return NextResponse.json(
        {
          success: false,
          error: paidRun
            ? `Batch run ${batchRun} already has a recorded payout, so it is not re-exported. Nothing new to lock.`
            : "No submitted claims to lock and no locked batch run to re-export.",
        },
        { status: 400 }
      );
    }

    const recipients: RecipientPayment[] = lockedQueue.map((s) => ({
      address: s.recipientAddress as string,
      amountZat: s.amountZat,
      memo: `ZecClaim: ${campaign.title}`.slice(0, 120),
      slotId: s.tokenHash,
    }));

    const chunks: PayoutChunk[] = chunkBatchPayouts(recipients, 300, 2);

    // Persist batch index per slot
    for (let i = 0; i < chunks.length; i++) {
      const slotIds = chunks[i].recipients.map((r) => r.slotId).filter((id): id is string => Boolean(id));
      await repo.updateSlots(parsed.campaignId, slotIds, { batchIndex: i });
    }

    const totalActions = chunks.reduce((sum, c) => sum + c.actionsCount, 0);
    const totalEstimatedFeeZat = chunks.reduce((sum, c) => sum + c.estimatedFeeZat, 0);
    const isReexport = newlySubmitted.length === 0;

    if (!isReexport) {
      await repo.recordEvent({
        campaignId: parsed.campaignId,
        eventType: "BATCH_LOCKED",
        details: {
          batchRun,
          newlyLocked: newlySubmitted.length,
          totalRecipients: recipients.length,
          totalChunks: chunks.length,
          totalActions,
          totalFeeZat: totalEstimatedFeeZat,
        },
        timestamp: new Date(),
      });
    }

    const zingoScript = generateZingoCliScript(chunks, {
      campaignTitle: campaign.title,
      network: campaign.network,
    });

    // slotId (the token hash) is a server-side lookup key; do not ship it to the browser.
    const publicChunks = chunks.map((c) => ({
      ...c,
      recipients: c.recipients.map(({ address, amountZat, memo }) => ({ address, amountZat, memo })),
    }));

    return NextResponse.json({
      success: true,
      campaignId: parsed.campaignId,
      isReexport,
      batchRun,
      newlyLocked: newlySubmitted.length,
      totalRecipients: recipients.length,
      totalChunks: chunks.length,
      totalActions,
      totalEstimatedFeeZat,
      chunks: publicChunks,
      zingoScript,
    });
  } catch (err: unknown) {
    return errorResponse(err, "Invalid request");
  }
}
