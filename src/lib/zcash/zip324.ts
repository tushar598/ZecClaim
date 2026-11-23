import { VizorCsvCardSchema } from "@/lib/validators";
import { z } from "zod";

/**
 * Pure TypeScript Vizor ZIP 324 CSV Parser & Non-Custodial Card Helper
 * Standard: Vizor Wallet ZIP 324 Group Gift Cards (PR #1460 scheme)
 *
 * Invariant: Server parses public card metadata and ACK hashes only.
 * Private seeds are never logged or stored.
 */

export type VizorCsvCard = z.infer<typeof VizorCsvCardSchema>;

export interface ParsedVizorManifest {
  totalCards: number;
  totalZec: number;
  cards: VizorCsvCard[];
}

/**
 * Parses raw CSV string exported by Vizor/Zodl gift-card generator.
 */
export function parseVizorCsv(csvContent: string): ParsedVizorManifest {
  const lines = csvContent.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error("Invalid CSV: missing header or empty content");
  }

  const [headerLine, ...rowLines] = lines;
  const headers = headerLine.split(",").map((h) => h.trim().toLowerCase());

  const cardIdIdx = headers.indexOf("card_id");
  const amountIdx = headers.indexOf("amount_zec");
  const feeIdx = headers.indexOf("sweep_fee_buffer_zat");
  const tokenIdx = headers.indexOf("claim_token");
  const ackIdx = headers.indexOf("ack_hash");

  if (cardIdIdx === -1 || amountIdx === -1 || ackIdx === -1) {
    throw new Error("CSV missing required columns: card_id, amount_zec, ack_hash");
  }

  const cards: VizorCsvCard[] = [];
  let totalZec = 0;

  for (const row of rowLines) {
    if (!row.trim()) continue;
    const cols = row.split(",").map((c) => c.trim());
    const rawCard = {
      cardId: cols[cardIdIdx],
      amountZec: parseFloat(cols[amountIdx]),
      feeBufferZat: feeIdx !== -1 ? parseInt(cols[feeIdx], 10) : 2000,
      claimToken: tokenIdx !== -1 ? cols[tokenIdx] : `token_${cols[cardIdIdx]}`,
      ackHash: cols[ackIdx],
    };

    const validated = VizorCsvCardSchema.parse(rawCard);
    cards.push(validated);
    totalZec += validated.amountZec;
  }

  return {
    totalCards: cards.length,
    totalZec,
    cards,
  };
}
