import { NextRequest, NextResponse } from "next/server";
import { ChainTxQuerySchema } from "@/lib/validators";
import { checkTransaction } from "@/lib/chain/txCheck";
import { checkRateLimit, clientIp, tooManyRequests } from "@/lib/security/rateLimit";
import { errorResponse } from "@/lib/http";

/**
 * GET /api/chain/tx?network=testnet&txid=<64 hex>
 * Public, rate limited. Looks a transaction up through lightwalletd and returns its status,
 * height, confirmations and shape (no amounts: shielded values are not visible on-chain).
 * Used by the campaign form to check a funding txid before anchoring.
 */
export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(`chain-tx:${clientIp(req)}`, 30, 60_000);
    if (!rl.allowed) return tooManyRequests("Too many lookups. Please wait a minute.", rl);

    const parsed = ChainTxQuerySchema.parse({
      network: req.nextUrl.searchParams.get("network"),
      txid: req.nextUrl.searchParams.get("txid"),
    });
    const check = await checkTransaction(parsed.network, parsed.txid);
    return NextResponse.json({ success: true, check });
  } catch (err: unknown) {
    return errorResponse(err, "Invalid request");
  }
}
