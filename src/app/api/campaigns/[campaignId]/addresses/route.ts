import { NextRequest, NextResponse } from "next/server";
import { verifyCampaignAdmin } from "@/lib/security/auth";
import { getRepo } from "@/lib/db/repo";
import { ListSlotAddressesSchema } from "@/lib/validators";
import { errorResponse } from "@/lib/http";

const PURGED = "[PURGED]";

interface RouteContext {
  params: Promise<{ campaignId: string }>;
}

/**
 * POST /api/campaigns/[campaignId]/addresses
 * Protected by x-admin-secret.
 *
 * The recipient address stored for each claim link, for the organizer console. The organizer
 * already receives these addresses in every batch export, so this exposes nothing new to them;
 * the public GET /api/campaigns/[id] keeps withholding them. Scrubbed addresses are gone and
 * are not listed. This is ZecClaim's record of what was submitted, not proof of payment: the
 * payout transaction's recipients are only visible to holders of the campaign viewing key.
 */
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { campaignId } = await context.params;
    const auth = await verifyCampaignAdmin(req, campaignId);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });
    }

    const raw = await req.text();
    ListSlotAddressesSchema.parse(raw.trim() ? JSON.parse(raw) : {});

    const slots = await (await getRepo()).getSlots(campaignId);
    const addresses = slots
      .filter((s) => typeof s.recipientAddress === "string" && s.recipientAddress.length > 0 && s.recipientAddress !== PURGED)
      .sort((a, b) => a.slotIndex - b.slotIndex)
      .map((s) => ({ slotIndex: s.slotIndex, address: s.recipientAddress as string, poolType: s.addressPoolType ?? null }));

    return NextResponse.json({ success: true, campaignId, addresses }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: unknown) {
    return errorResponse(err, "Invalid request");
  }
}
