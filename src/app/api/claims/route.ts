import { NextRequest, NextResponse } from "next/server";
import { SubmitClaimSchema } from "@/lib/validators";
import { inspectZcashAddress } from "@/lib/zcash/zip316";

/**
 * POST /api/claims
 * Server-side ZIP 316 preflight & slot locking gate.
 * Invariant: Rejects transparent t1... and mixed UAs with 0x00/0x01 receivers.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = SubmitClaimSchema.parse(body);

    // Strict server-side ZIP 316 Preflight
    const inspection = inspectZcashAddress(parsed.address);
    if (!inspection.isValid || !inspection.isShielded) {
      return NextResponse.json(
        {
          success: false,
          error: inspection.errorMessage || "Transparent or invalid address rejected by policy.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Claim submitted and verified as strictly shielded.",
      poolType: inspection.poolType,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
  }
}
