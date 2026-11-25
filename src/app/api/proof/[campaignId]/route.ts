import { NextRequest, NextResponse } from "next/server";
import { getCampaignProofData } from "@/lib/proof/getProofData";
import { errorResponse } from "@/lib/http";

interface RouteContext {
  params: Promise<{ campaignId: string }>;
}

/**
 * GET /api/proof/[campaignId]
 * Route parameter variant of the public proof ledger.
 */
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { campaignId } = await context.params;

    if (!campaignId) {
      return NextResponse.json({ success: false, error: "Campaign ID is required" }, { status: 400 });
    }

    const proof = await getCampaignProofData(campaignId);

    if (!proof) {
      return NextResponse.json({ success: false, error: "Campaign not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      ...proof,
    });
  } catch (err: unknown) {
    return errorResponse(err, "Server error", 500);
  }
}
