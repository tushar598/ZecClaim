import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { ReportPayoutSchema } from "@/lib/validators";
import { hashToken } from "@/lib/security/tokens";
import { checkRateLimit, clientIp, tooManyRequests } from "@/lib/security/rateLimit";
import { getRepo } from "@/lib/db/repo";
import { DEMO_CAMPAIGN_ID } from "@/lib/demo/constants";
import { isSandboxEnabled } from "@/lib/demo/sandbox";

/**
 * POST /api/claims/report
 * The holder of a claim link reports that the payout recorded for it did not arrive
 * (`NOT_RECEIVED`) or arrived with a different amount (`WRONG_AMOUNT`).
 *
 * ZecClaim cannot see who a shielded payout paid, so a recorded payout txid proves only that a
 * transaction exists. This report is the recipient's public counter-statement: it is shown on the
 * proof portal next to the link number (never with an address), the link's amount moves from
 * "distributed" to "awaiting" in the public ledger, and it cannot be withdrawn. One report per
 * link, only once a payout has been recorded for it. The claim token is the credential.
 */
export async function POST(req: NextRequest) {
  try {
    const rl = await checkRateLimit(`payout-report:${clientIp(req)}`, 10, 60_000);
    if (!rl.allowed) return tooManyRequests("Too many reports. Please wait a minute.", rl);

    const parsed = ReportPayoutSchema.parse(await req.json());
    const repo = await getRepo();
    const tokenHash = hashToken(parsed.token);
    const slot = await repo.getSlotByTokenHash(tokenHash);
    if (!slot || (slot.campaignId === DEMO_CAMPAIGN_ID && !isSandboxEnabled())) {
      return NextResponse.json({ success: false, error: "This claim link is not valid." }, { status: 404 });
    }
    if (!slot.payoutTxid) {
      return NextResponse.json(
        { success: false, error: "No payout has been recorded for this link yet, so there is nothing to report. Check again after the organizer records it." },
        { status: 409 }
      );
    }
    if (slot.payoutReport) {
      return NextResponse.json({ success: false, error: "This link already has a payout report on record." }, { status: 409 });
    }

    const now = new Date();
    const stored = await repo.reportSlotPayout(slot.campaignId, tokenHash, { payoutReport: parsed.reason, payoutReportedAt: now });
    if (!stored) {
      return NextResponse.json({ success: false, error: "This link changed during your request. Reload and try again." }, { status: 409 });
    }

    await repo.recordEvent({
      campaignId: slot.campaignId,
      eventType: "DISPUTE_FLAGGED",
      details: { kind: "PAYOUT_REPORT", slotIndex: slot.slotIndex, reason: parsed.reason, payoutTxid: slot.payoutTxid },
      txid: slot.payoutTxid,
      timestamp: now,
    });

    return NextResponse.json(
      {
        success: true,
        payoutReport: parsed.reason,
        payoutReportedAt: now,
        message: "Report published on the campaign's proof portal. Your address is not part of it.",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: unknown) {
    return errorResponse(err, "Invalid request");
  }
}
