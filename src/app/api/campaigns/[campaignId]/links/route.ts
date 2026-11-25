import { NextRequest, NextResponse } from "next/server";
import { verifyCampaignAdmin } from "@/lib/security/auth";
import { getRepo } from "@/lib/db/repo";
import { ReissueLinksSchema } from "@/lib/validators";
import { generateClaimToken, hashToken } from "@/lib/security/tokens";
import { errorResponse } from "@/lib/http";

interface RouteContext {
  params: Promise<{ campaignId: string }>;
}

/**
 * POST /api/campaigns/[campaignId]/links
 * Protected by x-admin-secret.
 *
 * Claim links are stored only as peppered hashes, so a lost link cannot be shown again. This
 * issues a fresh token for each UNCLAIMED slot (all of them, or `slotIndexes`) and revokes the
 * old one. Slots that already have an address are never touched, so no recipient loses a claim.
 * The new links are returned once.
 */
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { campaignId } = await context.params;
    const auth = await verifyCampaignAdmin(req, campaignId);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });
    }

    const raw = await req.text();
    const parsed = ReissueLinksSchema.parse(raw.trim() ? JSON.parse(raw) : {});
    const repo = await getRepo();
    const wanted = parsed.slotIndexes ? new Set(parsed.slotIndexes) : null;

    const slots = (await repo.getSlots(campaignId))
      .filter((s) => s.status === "UNCLAIMED" && (!wanted || wanted.has(s.slotIndex)))
      .sort((a, b) => a.slotIndex - b.slotIndex);

    if (slots.length === 0) {
      return NextResponse.json(
        { success: false, error: "No unused claim links to reissue. Links that already received an address cannot be reissued." },
        { status: 409 }
      );
    }

    const tokens: { slotIndex: number; token: string; claimPath: string; amountZat: number }[] = [];
    for (const slot of slots) {
      const token = generateClaimToken();
      if (await repo.reissueSlotToken(campaignId, slot.tokenHash, hashToken(token))) {
        tokens.push({ slotIndex: slot.slotIndex, token, claimPath: `/claim/${token}`, amountZat: slot.amountZat });
      }
    }

    await repo.recordEvent({
      campaignId,
      eventType: "LINKS_REISSUED",
      details: { reissuedCount: tokens.length, slotIndexes: tokens.map((t) => t.slotIndex) },
      timestamp: new Date(),
    });

    return NextResponse.json(
      {
        success: true,
        campaignId,
        reissued: tokens.length,
        skipped: slots.length - tokens.length,
        tokens,
        message: "New claim links issued. The previous links for these slots no longer work.",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: unknown) {
    return errorResponse(err, "Invalid request");
  }
}
