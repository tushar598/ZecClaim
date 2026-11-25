import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { SubmitClaimSchema } from "@/lib/validators";
import { inspectZcashAddress } from "@/lib/zcash/zip316";
import { hashToken } from "@/lib/security/tokens";
import { checkRateLimit, clientIp, tooManyRequests } from "@/lib/security/rateLimit";
import { getRepo } from "@/lib/db/repo";
import { DEMO_CAMPAIGN_ID } from "@/lib/demo/constants";
import { isSandboxEnabled } from "@/lib/demo/sandbox";

/**
 * POST /api/claims
 * Server-side ZIP 316 preflight & atomic slot locking gate.
 *
 * Invariants:
 * 1. Hard-rejects transparent t1... and mixed UAs with 0x00/0x01 receivers.
 * 2. Enforces campaign network lock (testnet vs. mainnet address mismatch rejection).
 * 3. Incoming token is hashed (SHA-256 + pepper) to look up slot. Raw token is never persisted.
 * 4. Conditional UNCLAIMED -> SUBMITTED update prevents races and replayed claims.
 */
export async function POST(req: NextRequest) {
  try {
    const rl = await checkRateLimit(`claim:${clientIp(req)}`, 30, 60_000);
    if (!rl.allowed) return tooManyRequests("Too many claim attempts. Please wait a minute.", rl);

    const parsed = SubmitClaimSchema.parse(await req.json());
    const tokenHash = hashToken(parsed.token);
    const repo = await getRepo();
    const now = new Date();

    const slot = await repo.getSlotByTokenHash(tokenHash);
    if (!slot || (slot.campaignId === DEMO_CAMPAIGN_ID && !isSandboxEnabled())) {
      return NextResponse.json({ success: false, error: "This claim link is not valid." }, { status: 404 });
    }
    if (slot.status !== "UNCLAIMED") {
      return NextResponse.json({ success: false, error: "This claim slot has already been claimed or locked." }, { status: 409 });
    }

    const campaign = await repo.getCampaign(slot.campaignId);
    const inspection = inspectZcashAddress(parsed.address, campaign?.network);
    if (!inspection.isValid || !inspection.isShielded || inspection.hasTransparentReceiver) {
      return NextResponse.json(
        {
          success: false,
          error:
            inspection.errorMessage ||
            "Transparent or mixed addresses are strictly rejected by policy. Please provide a shielded Unified Address without transparent receivers.",
        },
        { status: 422 }
      );
    }

    const poolType =
      inspection.poolType === "TRANSPARENT_REJECTED" || inspection.poolType === "INVALID" ? undefined : inspection.poolType;
    const changed = await repo.updateSlots(
      slot.campaignId,
      [tokenHash],
      { status: "SUBMITTED", recipientAddress: parsed.address, addressPoolType: poolType, submittedAt: now },
      ["UNCLAIMED"]
    );
    if (changed === 0) {
      return NextResponse.json({ success: false, error: "This claim slot was locked by a concurrent request." }, { status: 409 });
    }

    await repo.recordEvent({
      campaignId: slot.campaignId,
      eventType: "SLOT_CLAIMED",
      details: { slotIndex: slot.slotIndex, amountZat: slot.amountZat, addressPoolType: inspection.poolType },
      timestamp: now,
    });

    return NextResponse.json({
      success: true,
      message: "Claim submitted and verified as strictly shielded.",
      campaignId: slot.campaignId,
      slotIndex: slot.slotIndex,
      amountZat: slot.amountZat,
      poolType: inspection.poolType,
    });
  } catch (err: unknown) {
    return errorResponse(err, "Invalid request");
  }
}
