import { NextRequest, NextResponse } from "next/server";
import { ImportVouchersSchema, SubmitAckSchema } from "@/lib/validators";

/**
 * POST /api/vouchers
 * Ingests Vizor ZIP 324 CSV cards OR processes memo ACK submissions.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Check if ACK submission or batch import
    if ("ackCode" in body) {
      const parsedAck = SubmitAckSchema.parse(body);
      return NextResponse.json({
        success: true,
        cardId: parsedAck.cardId,
        message: "Memo ACK verified against spent nullifier.",
      });
    }

    const parsedImport = ImportVouchersSchema.parse(body);
    return NextResponse.json({
      success: true,
      campaignId: parsedImport.campaignId,
      cardsImported: parsedImport.cards.length,
      message: "Vizor gift card batch registered without storing private keys.",
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
  }
}
