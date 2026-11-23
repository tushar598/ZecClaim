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
}

/**
 * Emits an executable Bash script for the organizer to run locally with zingo-cli.
 * 100% Non-custodial: signing and broadcasting happen on the organizer's machine.
 */
export function generateZingoCliScript(
  chunks: PayoutChunk[],
  options: ZingoScriptOptions
): string {
  const host = options.lightnodeHost || "zebra.openlightnodes.org";
  const port = options.lightnodePort || 443;

  const scriptLines: string[] = [
    "#!/usr/bin/env bash",
    `# ZecClaim Payout Script — Campaign: ${options.campaignTitle}`,
    `# Target Lightnode: ${host}:${port} | NU7 Consensus Branch ID: 0x77190AD9`,
    "# Execute this script in the terminal where zingo-cli is installed.",
    "set -euo pipefail",
    "",
    `ZINGO="zingo-cli --server https://${host}:${port}"`,
    "",
    'echo "=================================================="',
    `echo "ZecClaim Payout: ${options.campaignTitle}"`,
    `echo "Total Chunks: ${chunks.length}"`,
    'echo "=================================================="',
    "",
    'echo "[Step 1/3] Syncing local wallet with Mumbai lightnode..."',
    '$ZINGO --regtest=false sync',
    "",
  ];

  chunks.forEach((chunk, idx) => {
    const chunkNum = idx + 1;
    scriptLines.push(`echo "[Step 2/3] Broadcasting Chunk ${chunkNum}/${chunks.length} (${chunk.recipients.length} recipients, ${chunk.actionsCount} actions)..."`);

    const receiversJson = JSON.stringify(
      chunk.recipients.map((r) => ({
        address: r.address,
        amount: r.amountZat,
        memo: r.memo || `ZecClaim: ${options.campaignTitle}`,
      }))
    );

    scriptLines.push(`$ZINGO quicksend '${receiversJson}'`);
    scriptLines.push(`echo "Chunk ${chunkNum} broadcast completed."`);
    scriptLines.push("");
  });

  scriptLines.push('echo "[Step 3/3] All batch payout chunks sent successfully."');
  scriptLines.push('echo "You may now return to ZecClaim and execute the 1-Click PII Scrub."');

  return scriptLines.join("\n");
}
