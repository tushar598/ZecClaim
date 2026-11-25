import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getChainTip } from "@/lib/chain/txCheck";
import { checkRateLimit, clientIp, tooManyRequests } from "@/lib/security/rateLimit";
import { errorResponse } from "@/lib/http";

const NetworkSchema = z.enum(["testnet", "mainnet"]);

/**
 * GET /api/chain/tip?network=testnet
 * Public, rate limited. Current chain height from lightwalletd (null if unreachable).
 */
export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(`chain-tip:${clientIp(req)}`, 60, 60_000);
    if (!rl.allowed) return tooManyRequests("Too many lookups. Please wait a minute.", rl);

    const network = NetworkSchema.parse(req.nextUrl.searchParams.get("network"));
    const tip = await getChainTip(network);
    return NextResponse.json({ success: true, network, ...tip });
  } catch (err: unknown) {
    return errorResponse(err, "Invalid request");
  }
}
