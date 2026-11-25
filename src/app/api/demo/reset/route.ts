import { NextRequest, NextResponse } from "next/server";
import { getRepo } from "@/lib/db/repo";
import { seedDemoCampaign, DEMO_CAMPAIGN_ID } from "@/lib/db/seedDemo";
import { checkRateLimit, clientIp, tooManyRequests } from "@/lib/security/rateLimit";
import { errorResponse } from "@/lib/http";
import { isSandboxEnabled } from "@/lib/demo/sandbox";

/**
 * POST /api/demo/reset
 * 1-Click Judge Sandbox Reset Endpoint.
 *
 * Invariant:
 * Strictly restricted to demo campaigns (isDemo: true).
 * Clears demo state and restores pristine NU7 test fixtures.
 */
export async function POST(req: NextRequest) {
  try {
    if (!isSandboxEnabled()) {
      return NextResponse.json({ success: false, error: "The sandbox is disabled on this deployment." }, { status: 404 });
    }
    const rl = await checkRateLimit(`demo-reset:${clientIp(req)}`, 10, 60_000);
    if (!rl.allowed) return tooManyRequests("Too many resets. Please wait a minute.", rl);

    let campaignId = DEMO_CAMPAIGN_ID;

    try {
      const body = await req.json();
      if (body?.campaignId) {
        campaignId = body.campaignId;
      }
    } catch {
      // Body is optional; defaults to demo-nu7-campaign
    }

    // Only the demo sandbox can be reset.
    if (campaignId !== DEMO_CAMPAIGN_ID) {
      const campaign = await (await getRepo()).getCampaign(campaignId);
      if (!campaign || !campaign.isDemo) {
        return NextResponse.json(
          { success: false, error: "Forbidden: Only demo sandbox campaigns can be reset." },
          { status: 403 }
        );
      }
    }

    // Execute idempotent full re-seed. Rate limits are deliberately NOT reset here:
    // this endpoint is public, so resetting them would let anyone bypass ACK/claim limits.
    await seedDemoCampaign(true);

    return NextResponse.json({
      success: true,
      message: "Judge sandbox successfully reset to clean initial fixtures.",
      campaignId,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    return errorResponse(err, "Reset failed", 500);
  }
}
