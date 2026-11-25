import { PayoutChunk } from "@/types";

/**
 * zingo-cli Batch Execution Script Generator
 * Targets: Zcash India Mumbai Lightnode (zebra.openlightnodes.org:443)
 * Consensus Branch ID: 0x77190AD9 (NU7)
 */

export interface ZingoScriptOptions {
  lightnodeHost?: string;
  lightnodePort?: number;
  campaignTitle: string;
  network?: "testnet" | "mainnet";
}

/**
 * Sanitizes input string for safe interpolation inside double-quoted bash strings
 * Strips carriage returns and newlines to prevent breaking out of bash comments or commands
 */
function sanitizeBashDoubleQuotes(input: string): string {
  return input.replace(/[\r\n]+/g, " ").replace(/["$`\\]/g, "\\$&");
}

/**
 * Escapes single quotes for safe interpolation inside bash single-quoted strings: ' -> '\''
 */
function escapeBashSingleQuotes(input: string): string {
  return input.replace(/'/g, "'\\''");
}

/**
 * The lightwalletd URL handed to zingo-cli `--server`: the public default for the network,
 * unless NEXT_PUBLIC_TESTNET_LIGHTNODE_URL / NEXT_PUBLIC_MAINNET_LIGHTNODE_URL overrides it.
 */
export function lightnodeServerUrl(network: "testnet" | "mainnet"): string {
  if (network === "testnet") {
    return process.env.NEXT_PUBLIC_TESTNET_LIGHTNODE_URL || "https://testnet.zec.rocks:443";
  }
  return process.env.NEXT_PUBLIC_MAINNET_LIGHTNODE_URL || "https://zebra.openlightnodes.org:443";
}

export interface ViewingKeyAuditOptions {
  network: "testnet" | "mainnet";
  campaignId: string;
  /** First block that can hold a campaign transaction (the funding height, or the anchor height). */
  startHeight: number | null;
}

export interface ViewingKeyAuditCommands {
  /** Reads the key into $UFVK without echoing it, then prints its SHA-256 (the portal fingerprint). */
  fingerprint: string;
  /** Creates a view-only wallet from $UFVK in a fresh folder, syncs, and lists value transfers. */
  openWallet: string;
  /** Same wallet, later: no key or birthday needed once the folder exists. */
  reopenWallet: string;
  /** The --birthday passed to zingo-cli (a few blocks before startHeight; 0 = from Sapling activation). */
  birthday: number;
}

/**
 * Commands an auditor runs on their own computer to see a campaign's payouts with its viewing
 * key (zingo-cli `--viewkey`, which refuses to overwrite an existing wallet, plus `--birthday`).
 * The key never appears in the command text: it is read into a shell variable, so it stays out of
 * shell history and is never sent to ZecClaim. campaignId is hex (sanitized anyway, as it lands
 * in a path).
 */
export function viewingKeyAuditCommands(options: ViewingKeyAuditOptions): ViewingKeyAuditCommands {
  const birthday = options.startHeight && options.startHeight > 10 ? options.startHeight - 10 : 0;
  const folder = `"$HOME/zecclaim-audit-${options.campaignId.replace(/[^A-Za-z0-9_-]/g, "")}"`;
  const base = `zingo-cli --chain ${options.network} --server ${lightnodeServerUrl(options.network)} \\\n  --data-dir ${folder}`;
  return {
    fingerprint: ["read -rs UFVK   # paste the viewing key, press Enter (nothing is shown)", `printf '%s' "$UFVK" | shasum -a 256`].join("\n"),
    openWallet: `${base} \\\n  --birthday ${birthday} --viewkey "$UFVK" --waitsync value_transfers`,
    reopenWallet: `${base} --waitsync value_transfers`,
    birthday,
  };
}

/**
 * Emits an executable Bash script for the organizer to run locally with zingo-cli.
 * 100% Non-custodial: signing and broadcasting happen on the organizer's machine.
 */
export function generateZingoCliScript(
  chunks: PayoutChunk[],
  options: ZingoScriptOptions
): string {
  const isTestnet = options.network === "testnet";
  // zingo-cli (zingolib v8, zingo-cli/src/lib.rs) accepts --chain "mainnet" | "testnet" | "regtest".
  // It syncs at startup; --waitsync blocks each command until that sync completes. A bare
  // `sync` command no longer exists (it needs a subcommand such as `sync run`), so the script
  // never calls it.
  const chainFlag = isTestnet ? "--chain testnet" : "--chain mainnet";

  const serverArg = options.lightnodeHost
    ? `https://${options.lightnodeHost}:${options.lightnodePort || 443}`
    : lightnodeServerUrl(isTestnet ? "testnet" : "mainnet");

  const safeTitle = sanitizeBashDoubleQuotes(options.campaignTitle);

  const scriptLines: string[] = [
    "#!/usr/bin/env bash",
    `# ZecClaim Payout Script: Campaign: ${safeTitle}`,
    `# Network: ${isTestnet ? "NU7 TESTNET" : "MAINNET"} | Target Lightnode: ${serverArg} | Consensus Branch ID: 0x77190AD9`,
    "# Execute this script in the terminal where zingo-cli is installed.",
    "set -euo pipefail",
    "",
    `ZINGO="zingo-cli --server ${serverArg} ${chainFlag} --waitsync"`,
    "",
    'echo "=================================================="',
    `echo "ZecClaim Payout: ${safeTitle} (${isTestnet ? "TESTNET" : "MAINNET"})"`,
    `echo "Total Chunks: ${chunks.length}"`,
    'echo "=================================================="',
    "",
    `echo "[Step 1/3] Syncing the wallet with the ${isTestnet ? "testnet" : "mainnet"} lightnode and checking the balance..."`,
    "$ZINGO balance",
    "",
  ];

  chunks.forEach((chunk, idx) => {
    const chunkNum = idx + 1;
    if (idx > 0) {
      // The previous chunk's change note must confirm before it can fund the next chunk.
      scriptLines.push(
        `echo "Waiting for chunk ${idx} change to confirm (NU7 target spacing: 25s per block)..."`,
        "sleep 90",
        ""
      );
    }
    scriptLines.push(
      `echo "[Step 2/3] Broadcasting Chunk ${chunkNum}/${chunks.length} (${chunk.recipients.length} recipients, ${chunk.actionsCount} actions, Fee: ${chunk.estimatedFeeZat} zat)..."`
    );

    const receiversJson = JSON.stringify(
      chunk.recipients.map((r) => ({
        address: r.address,
        amount: r.amountZat,
        memo: r.memo || `ZecClaim: ${options.campaignTitle}`,
      }))
    );

    // Escape single quotes to prevent bash command injection
    const safeReceiversJson = escapeBashSingleQuotes(receiversJson);

    scriptLines.push(`$ZINGO quicksend '${safeReceiversJson}'`);
    scriptLines.push(`echo "Chunk ${chunkNum} sent. Record the txid printed above as transaction ${chunkNum} of this batch run in ZecClaim."`);
    scriptLines.push("");
  });

  scriptLines.push('echo "[Step 3/3] All batch payout chunks sent."');
  scriptLines.push('echo "In ZecClaim: Record the payout transaction (it is checked on-chain), then scrub the addresses."');

  return scriptLines.join("\n");
}
