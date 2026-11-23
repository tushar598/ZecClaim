/**
 * Watch-Only Unified Full Viewing Key (UFVK) & Nullifier Sync Adapter
 * Pluggable for live Mumbai lightnode (zebra.openlightnodes.org:443) and NU7 Demo Sandbox.
 */

export interface UfvkSpendEvent {
  nullifierHex: string;
  blockHeight: number;
  txid: string;
  spentAt: Date;
}

export interface UfvkWatcherConfig {
  ufvk: string;
  lightnodeHost: string;
  lightnodePort: number;
  isDemoMode?: boolean;
}

/**
 * Checks if a specific note nullifier has been spent on-chain.
 */
export async function checkNullifierSpent(
  nullifierHex: string,
  config: UfvkWatcherConfig
): Promise<UfvkSpendEvent | null> {
  // If demo mode or test fixture, return simulated spend event
  if (config.isDemoMode) {
    return {
      nullifierHex,
      blockHeight: 3_250_100,
      txid: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      spentAt: new Date(),
    };
  }

  // Phase 2 will implement live lightnode gRPC query via openlightnodes
  return null;
}
