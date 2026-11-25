import type { ChainTxCheck, ZcashNetwork } from "@/types";
import {
  LightwalletdClient,
  hasCustomLightwalletdTransport,
  lightwalletdEndpoint,
} from "@/lib/zcash/lightwalletd";

/**
 * On-chain checks through lightwalletd (server-only).
 *
 * Every check returns a `ChainTxCheck` instead of throwing, so callers can store exactly what
 * the chain said, including "the node was unreachable", and the UI never claims more than that.
 * Set ZECCLAIM_CHAIN_CHECKS=off to disable network calls (status SKIPPED).
 */

const EXPECTED_CHAIN: Record<ZcashNetwork, string> = { mainnet: "main", testnet: "test" };
const INFO_TTL_MS = 10 * 60_000;
const TIP_TTL_MS = 15_000;

export function chainChecksEnabled(): boolean {
  return hasCustomLightwalletdTransport() || process.env.ZECCLAIM_CHAIN_CHECKS !== "off";
}

const infoCache = new Map<string, { chainName: string; at: number }>();
const tipCache = new Map<string, { height: number; at: number }>();
const tipTimeCache = new Map<string, { height: number; timeMs: number }>();

export function resetChainCaches() {
  infoCache.clear();
  tipCache.clear();
  tipTimeCache.clear();
}

class WrongChainError extends Error {}

async function clientFor(network: ZcashNetwork, timeoutMs: number): Promise<LightwalletdClient> {
  const endpoint = lightwalletdEndpoint(network);
  const client = new LightwalletdClient(endpoint, timeoutMs);
  let info = infoCache.get(endpoint);
  if (!info || Date.now() - info.at > INFO_TTL_MS) {
    const fetched = await client.getInfo();
    info = { chainName: fetched.chainName, at: Date.now() };
    infoCache.set(endpoint, info);
    if (fetched.blockHeight > 0) tipCache.set(endpoint, { height: fetched.blockHeight, at: Date.now() });
  }
  if (info.chainName !== EXPECTED_CHAIN[network]) {
    throw new WrongChainError(`${endpoint} serves chain "${info.chainName}", not ${network}`);
  }
  return client;
}

async function tipFrom(client: LightwalletdClient): Promise<number> {
  const cached = tipCache.get(client.endpoint);
  if (cached && Date.now() - cached.at < TIP_TTL_MS) return cached.height;
  const height = await client.getLatestHeight();
  tipCache.set(client.endpoint, { height, at: Date.now() });
  return height;
}

const describeFailure = (err: unknown) =>
  err instanceof Error ? err.message.split("\n")[0].slice(0, 160) : "lightwalletd request failed";

export interface ChainTip {
  height: number | null;
  /** Timestamp of the tip block (ms). Used to turn dates into block heights. */
  timeMs: number | null;
  endpoint: string | null;
  note: string | null;
}

/** Tip block time, fetched once per tip height (GetBlock is only called when the tip moves). */
async function tipTimeFrom(client: LightwalletdClient, height: number): Promise<number | null> {
  const cached = tipTimeCache.get(client.endpoint);
  if (cached && cached.height === height) return cached.timeMs;
  try {
    const seconds = await client.getBlockTime(height);
    if (seconds === null) return null;
    tipTimeCache.set(client.endpoint, { height, timeMs: seconds * 1000 });
    return seconds * 1000;
  } catch {
    return null;
  }
}

export async function getChainTip(network: ZcashNetwork, opts: { timeoutMs?: number } = {}): Promise<ChainTip> {
  if (!chainChecksEnabled()) {
    return { height: null, timeMs: null, endpoint: null, note: "Chain checks are disabled on this server" };
  }
  const endpoint = lightwalletdEndpoint(network);
  try {
    const client = await clientFor(network, opts.timeoutMs ?? 6000);
    const height = await tipFrom(client);
    return { height, timeMs: await tipTimeFrom(client, height), endpoint, note: null };
  } catch (err) {
    return { height: null, timeMs: null, endpoint, note: describeFailure(err) };
  }
}

/**
 * Looks a txid up on the campaign's network. MINED results include the transaction shape from
 * the compact block (transparent inputs/outputs, shielded outputs per pool).
 */
export async function checkTransaction(
  network: ZcashNetwork,
  txid: string,
  opts: { timeoutMs?: number } = {}
): Promise<ChainTxCheck> {
  const normalized = txid.trim().toLowerCase();
  const base: ChainTxCheck = {
    status: "SKIPPED",
    txid: normalized,
    network,
    height: null,
    tipHeight: null,
    confirmations: null,
    shape: null,
    checkedAt: new Date().toISOString(),
    endpoint: null,
    note: null,
  };
  if (!chainChecksEnabled()) return { ...base, note: "Chain checks are disabled on this server" };

  const endpoint = lightwalletdEndpoint(network);
  try {
    const client = await clientFor(network, opts.timeoutMs ?? 8000);
    const [found, tip] = await Promise.all([client.getTransaction(normalized), tipFrom(client)]);
    const withTip = { ...base, endpoint, tipHeight: tip };

    if (!found) return { ...withTip, status: "NOT_FOUND", note: `Not found on ${network}` };
    if (found.state === "MEMPOOL") return { ...withTip, status: "MEMPOOL", note: "In the mempool, not mined yet" };
    if (found.state === "FORK") return { ...withTip, status: "NOT_FOUND", note: "Only mined on a fork, not the main chain" };

    const height = found.height as number;
    const blockTxs = await client.getBlockTxs(height);
    const compact = blockTxs.find((t) => t.txid === normalized);
    return {
      ...withTip,
      status: "MINED",
      height,
      confirmations: Math.max(1, tip - height + 1),
      shape: compact?.shape ?? null,
      note: compact ? null : "Mined, but the compact block did not list it",
    };
  } catch (err) {
    return { ...base, endpoint, status: "UNREACHABLE", note: describeFailure(err) };
  }
}

/** True when a stored check could change on a re-check (not final yet). */
export function checkIsStale(check: ChainTxCheck | undefined | null, minAgeMs: number): boolean {
  if (!check) return true;
  if (check.status === "MINED" && (check.confirmations ?? 0) >= 10) return false;
  if (check.status === "NOT_FOUND" && Date.now() - Date.parse(check.checkedAt) < 10 * minAgeMs) return false;
  return Date.now() - Date.parse(check.checkedAt) > minAgeMs;
}
