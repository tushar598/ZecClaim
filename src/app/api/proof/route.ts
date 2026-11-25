import { NextRequest, NextResponse } from "next/server";
import { getCampaignProofData } from "@/lib/proof/getProofData";
import { errorResponse } from "@/lib/http";

/**
 * GET /api/proof
 * Public proof data (?campaignId=...): ledger, on-chain checks, disputes, scrub commitment, audit trail.
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const campaignId = searchParams.get("campaignId") || "demo-nu7-campaign";

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
