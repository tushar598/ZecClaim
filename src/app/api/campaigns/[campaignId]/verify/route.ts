import { NextRequest, NextResponse } from "next/server";
import { verifyCampaignAdmin } from "@/lib/security/auth";
import { errorResponse } from "@/lib/http";

interface RouteContext {
  params: Promise<{ campaignId: string }>;
}

/**
 * POST /api/campaigns/[campaignId]/verify
 * Checks the `x-admin-secret` header for this campaign. The organizer console calls it before
 * showing any management controls. Failed attempts are rate limited per IP (see auth.ts).
 */
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { campaignId } = await context.params;
    const auth = await verifyCampaignAdmin(req, campaignId);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });
    }
    return NextResponse.json({ success: true, campaignId }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: unknown) {
    return errorResponse(err, "Invalid request");
  }
}
