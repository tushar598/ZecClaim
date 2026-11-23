import { NextRequest, NextResponse } from "next/server";
import { CreateCampaignSchema } from "@/lib/validators";
import { computeCampaignId } from "@/lib/security/tokens";

/**
 * POST /api/campaigns
 * Anchors a new campaign with a read-only Unified Full Viewing Key (UFVK).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateCampaignSchema.parse(body);

    const campaignId = computeCampaignId(parsed.ufvk, parsed.fundingTxid);

    return NextResponse.json({
      success: true,
      campaignId,
      message: "Campaign pre-anchored successfully with watch-only UFVK.",
      anchor: {
        ufvk: parsed.ufvk,
        fundingTxid: parsed.fundingTxid,
        totalFundedZat: parsed.totalFundedZat,
        clawbackExpiryHeight: parsed.clawbackExpiryHeight,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
  }
}
