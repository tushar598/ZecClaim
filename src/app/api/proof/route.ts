import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/proof
 * Returns read-only UFVK ledger, confirmed nullifiers, and public audit attestations.
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const campaignId = searchParams.get("campaignId") || "demo-nu7-campaign";

  return NextResponse.json({
    campaignId,
    ufvkAnchor: "uview1demoanchor9876543210zyxwvutsrqponmlkjihgfedcba",
    fundingTxid: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    totalFundedZat: 100_000_000,
    confirmedNullifiersCount: 1,
    pendingClaimsCount: 0,
    clawedBackZat: 0,
    consensus: {
      network: "testnet",
      branchId: "0x77190AD9",
      targetSpacingSeconds: 25,
      marginalFeeZat: 1000,
    },
  });
}
