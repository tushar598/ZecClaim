import { NextRequest, NextResponse } from "next/server";
import { ExecuteScrubSchema } from "@/lib/validators";
import { computePurgeSetHash } from "@/lib/security/scrub";
import { verifyCampaignAdmin } from "@/lib/security/auth";
import { getRepo } from "@/lib/db/repo";
import { ClaimSlotRecord } from "@/types";
import { errorResponse } from "@/lib/http";

const PURGED = "[PURGED]";

function hasLiveAddress(slot: Pick<ClaimSlotRecord, "recipientAddress">): boolean {
  return typeof slot.recipientAddress === "string" && slot.recipientAddress.length > 0 && slot.recipientAddress !== PURGED;
}

/**
 * POST /api/scrub
 * Protected by x-admin-secret.
 *
 * Address scrub:
 * 1. Collects every recipient address still stored for the campaign.
 * 2. Computes a SHA-256 commitment over the lexicographically sorted addresses.
 * 3. Overwrites those addresses with "[PURGED]" (status PURGED). `payoutTxid` is kept, so the
 *    public ledger still shows which slots were paid.
 * 4. Records a ScrubAttestation and audit event on the proof portal.
 *
 * Safety gate: a recipient is only considered paid once a payout transaction was recorded for
 * their batch (POST /api/batch/payout). Scrubbing an unpaid recipient destroys the only copy of
 * their payout address, so the request is refused unless `force: true` is sent.
 */
export async function POST(req: NextRequest) {
  try {
    const parsed = ExecuteScrubSchema.parse(await req.json());

    const auth = await verifyCampaignAdmin(req, parsed.campaignId);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });
    }

    const repo = await getRepo();
    const executedAt = new Date();
    const slots = await repo.getSlots(parsed.campaignId);

    const withAddress = slots.filter(hasLiveAddress);
    const unpaid = withAddress.filter((s) => !s.payoutTxid);
    if (unpaid.length > 0 && !parsed.force) {
      const exported = unpaid.filter((s) => s.status === "LOCKED_FOR_BATCH").length;
      return NextResponse.json(
        {
          success: false,
          code: "UNPAID_RECIPIENTS",
          unpaidCount: unpaid.length,
          exportedUnpaidCount: exported,
          error: `${unpaid.length} recipient(s) have no recorded payout yet${exported ? ` (${exported} exported, waiting for the payout txid)` : ""}. Record the payout transaction first, or confirm the scrub with force to discard their addresses.`,
        },
        { status: 409 }
      );
    }

    const sha256PurgedSetHash = computePurgeSetHash(withAddress.map((s) => s.recipientAddress as string));
    const addressesPurgedCount = withAddress.length;

    await repo.updateSlots(
      parsed.campaignId,
      withAddress.map((s) => s.tokenHash),
      { recipientAddress: PURGED, status: "PURGED", purgeHash: sha256PurgedSetHash }
    );
    await repo.recordScrub({ campaignId: parsed.campaignId, addressesPurgedCount, sha256PurgedSetHash, executedAt });
    await repo.recordEvent({
      campaignId: parsed.campaignId,
      eventType: "PII_SCRUBBED",
      details: { addressesPurgedCount, sha256PurgedSetHash, forcedUnpaid: unpaid.length },
      timestamp: executedAt,
    });

    return NextResponse.json({
      success: true,
      campaignId: parsed.campaignId,
      addressesPurgedCount,
      sha256PurgedSetHash,
      forcedUnpaid: unpaid.length,
      executedAt: executedAt.toISOString(),
      message: "Recipient addresses overwritten in the ZecClaim database.",
    });
  } catch (err: unknown) {
    return errorResponse(err, "Invalid request");
  }
}
