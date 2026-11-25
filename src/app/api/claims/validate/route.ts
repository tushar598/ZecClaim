import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { ValidateTokenSchema } from "@/lib/validators";
import { hashToken } from "@/lib/security/tokens";
import { checkRateLimit, clientIp, tooManyRequests } from "@/lib/security/rateLimit";
import { getRepo } from "@/lib/db/repo";
import { DEMO_CAMPAIGN_ID } from "@/lib/demo/constants";
import { isSandboxEnabled } from "@/lib/demo/sandbox";

const PURGED = "[PURGED]";

/** First 10 and last 6 characters, so the link holder can recognise the address they submitted. */
function maskAddress(address: string | undefined): string | null {
  if (!address || address === PURGED) return null;
  return address.length > 24 ? `${address.slice(0, 10)}...${address.slice(-6)}` : address;
}

/**
 * POST /api/claims/validate
 * Resolves a claim token (held only by its recipient) to the slot's amount and progress:
 * open, address received, exported in a batch, or paid (payout txid and what the chain said).
 * Never returns hashes; the submitted address is masked and disappears after the scrub.
 */
export async function POST(req: NextRequest) {
  try {
    const rl = await checkRateLimit(`validate:${clientIp(req)}`, 60, 60_000);
    if (!rl.allowed) return tooManyRequests("Too many token validation requests. Please wait a minute.", rl);

    const parsed = ValidateTokenSchema.parse(await req.json());
    const repo = await getRepo();

    const slot = await repo.getSlotByTokenHash(hashToken(parsed.token));
    if (!slot || (slot.campaignId === DEMO_CAMPAIGN_ID && !isSandboxEnabled())) {
      return NextResponse.json(
        { success: false, error: "This claim link is not valid. It may have been mistyped, or the organizer reissued it." },
        { status: 404 }
      );
    }
    const campaign = await repo.getCampaign(slot.campaignId);
    const payout = slot.payoutTxid
      ? (await repo.getPayouts(slot.campaignId)).find((p) => p.txid === slot.payoutTxid) ?? null
      : null;

    return NextResponse.json(
      {
        success: true,
        campaignId: slot.campaignId,
        campaignTitle: campaign?.title || "ZecClaim payout",
        campaignDescription: campaign?.description ?? null,
        network: campaign?.network || "testnet",
        isDemo: Boolean(campaign?.isDemo || slot.campaignId === DEMO_CAMPAIGN_ID),
        amountZat: slot.amountZat,
        slotIndex: slot.slotIndex,
        status: slot.status,
        isClaimable: slot.status === "UNCLAIMED",
        submittedAt: slot.submittedAt ?? null,
        addressHint: maskAddress(slot.recipientAddress),
        addressPoolType: slot.addressPoolType ?? null,
        batchRun: slot.batchRun ?? null,
        payoutReport: slot.payoutReport ?? null,
        payoutReportedAt: slot.payoutReportedAt ?? null,
        payout: payout
          ? {
              txid: payout.txid,
              status: payout.check.status,
              height: payout.check.height,
              confirmations: payout.check.confirmations,
              recordedAt: payout.recordedAt,
            }
          : slot.payoutTxid
            ? { txid: slot.payoutTxid, status: null, height: null, confirmations: null, recordedAt: null }
            : null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: unknown) {
    return errorResponse(err, "Invalid request");
  }
}
