import { NextRequest, NextResponse } from "next/server";
import { LockBatchSchema } from "@/lib/validators";
import { chunkBatchPayouts } from "@/lib/zcash/zip317";
import { generateZingoCliScript } from "@/lib/zcash/zingoScript";

/**
 * POST /api/batch
 * Locks payout queue and auto-chunks payouts into safe <= 300 action batches under ZIP 2009.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = LockBatchSchema.parse(body);

    // Mock recipient set for Phase 0 scaffolding
    const mockRecipients = [
      {
        address: "u1sampleorchardaddressforzecclaimbatchpayouttestnetfixture0001",
        amountZat: 50_000_000,
        memo: `ZecClaim: ${parsed.campaignId}`,
      },
    ];

    const chunks = chunkBatchPayouts(mockRecipients, 300);
    const zingoScript = generateZingoCliScript(chunks, {
      campaignTitle: parsed.campaignId,
    });

    return NextResponse.json({
      success: true,
      campaignId: parsed.campaignId,
      totalChunks: chunks.length,
      chunks,
      zingoScript,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
  }
}
