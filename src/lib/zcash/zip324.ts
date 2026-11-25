import { VizorCsvCardSchema } from "@/lib/validators";
import { z } from "zod";

/**
 * Pure TypeScript Vizor ZIP 324 CSV Parser & Non-Custodial Card Helper
 * Standard: Vizor Wallet ZIP 324 Group Gift Cards (PR #1460 scheme)
 *
 * Invariant: Server parses public card metadata and ACK hashes only.
 * Private seeds ('#key=...') are strictly stripped and NEVER serialized or persisted.
 */

export type VizorCsvCard = z.infer<typeof VizorCsvCardSchema>;

export interface ClientVizorCard {
  cardId: string;
  amountZec: number;
  amountZat: number;
  feeBufferZat: number;
  claimToken: string; // Sanitized public token with #key= stripped
  secretUri: string; // Bearer URI with #key= kept strictly in React memory for client-side QR rendering
  ackHash: string;
}

export interface ParsedClientVizorManifest {
  totalCards: number;
  totalZec: number;
  cards: ClientVizorCard[];
}

export interface ParsedVizorManifest {
  totalCards: number;
  totalZec: number;
  cards: VizorCsvCard[];
}

/**
 * Strips bearer '#key=' secret fragments and hash parameters from URLs or tokens.
 * Handles:
 * - Production Vizor: https://link.vizor.cash/payment-links/open#key=...
 * - Production Zodl: https://gift.zodl.com/redeem#key=...
 * - Draft ZIP 324 URIs: :65536/card_data#key=...
 * - URL-encoded variants (%23key=, %3d)
 */
export function stripKeyFragment(tokenOrUrl: string): string {
  if (!tokenOrUrl) return "";
  // Check for explicit key fragment (case-insensitive or URL-encoded)
  const keyMatch = tokenOrUrl.search(/(?:#|%23)key(?:=|%3d)/i);
  if (keyMatch !== -1) {
    return tokenOrUrl.substring(0, keyMatch);
  }
  // Check for any hash fragment that could carry bearer secret material
  const hashIdx = tokenOrUrl.indexOf("#");
  if (hashIdx !== -1) {
    return tokenOrUrl.substring(0, hashIdx);
  }
  const encodedHashIdx = tokenOrUrl.toLowerCase().indexOf("%23");
  if (encodedHashIdx !== -1) {
    return tokenOrUrl.substring(0, encodedHashIdx);
  }
  return tokenOrUrl;
}

/**
 * Parses raw CSV in the browser.
 * Keeps bearer secretUri strictly in client memory for rendering local QR codes,
 * while generating sanitized VizorCsvCards for server registration.
 *
 * Supports flexible headers (card_id, amount_zec, sweep_fee_buffer_zat, claim_url/link/uri, ack_hash).
 */
export function parseClientVizorCsv(csvContent: string): ParsedClientVizorManifest {
  const lines = csvContent.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error("Invalid CSV: missing header or empty content");
  }

  const [headerLine, ...rowLines] = lines;
  const headers = headerLine.split(",").map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, ""));

  const cardIdIdx = headers.findIndex((h) => ["card_id", "cardid", "card", "id"].includes(h));
  const amountIdx = headers.findIndex((h) => ["amount_zec", "amount", "zec"].includes(h));
  const feeIdx = headers.findIndex((h) => ["sweep_fee_buffer_zat", "fee_buffer_zat", "fee", "buffer"].includes(h));
  const tokenIdx = headers.findIndex((h) => ["claim_url", "claim_token", "url", "link", "uri", "payment_link"].includes(h));
  const ackIdx = headers.findIndex((h) => ["ack_hash", "ackhash", "ack"].includes(h));

  if (cardIdIdx === -1 || amountIdx === -1 || ackIdx === -1) {
    throw new Error("CSV missing required columns: card_id, amount_zec, ack_hash");
  }
  // Slips are printed from the gift-card URI. Without it a slip would carry a QR code that
  // looks real but redeems nothing, so refuse instead of inventing a placeholder.
  if (tokenIdx === -1) {
    throw new Error("CSV missing the gift card link column (claim_url, link or uri) needed to print slips");
  }

  const cards: ClientVizorCard[] = [];
  let totalZec = 0;

  for (const row of rowLines) {
    if (!row.trim()) continue;
    const cols = row.split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));

    const rawUri = cols[tokenIdx];
    if (!rawUri) {
      throw new Error(`Card ${cols[cardIdIdx] || "(unknown)"} has no gift card link; cannot print a slip for it`);
    }
    const sanitizedToken = stripKeyFragment(rawUri);
    const amountZec = parseFloat(cols[amountIdx]);
    const feeBufferZat = feeIdx !== -1 && cols[feeIdx] ? parseInt(cols[feeIdx], 10) : 2000;

    cards.push({
      cardId: cols[cardIdIdx],
      amountZec,
      amountZat: Math.round(amountZec * 100_000_000),
      feeBufferZat,
      claimToken: sanitizedToken || `token_${cols[cardIdIdx]}`,
      secretUri: rawUri, // Stored ONLY in browser React memory for QR slip generation
      ackHash: cols[ackIdx],
    });

    totalZec += amountZec;
  }

  return {
    totalCards: cards.length,
    totalZec,
    cards,
  };
}

/**
 * Generates the clean server payload.
 * Strictly purges secretUri; server receives ONLY public card metadata and ACK hashes.
 */
export function toServerImportPayload(
  manifest: ParsedClientVizorManifest,
  campaignId: string,
  isSplitCustody: boolean = false
) {
  return {
    campaignId,
    isSplitCustody,
    cards: manifest.cards.map((c) => ({
      cardId: c.cardId,
      amountZec: c.amountZec,
      feeBufferZat: c.feeBufferZat,
      claimToken: c.claimToken,
      ackHash: c.ackHash,
    })),
  };
}

/**
 * Parses raw CSV string exported by Vizor/Zodl gift-card generator.
 * Completely purges '#key=' fragments before validation or return.
 */
export function parseVizorCsv(csvContent: string): ParsedVizorManifest {
  const lines = csvContent.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error("Invalid CSV: missing header or empty content");
  }

  const [headerLine, ...rowLines] = lines;
  const headers = headerLine.split(",").map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, ""));

  const cardIdIdx = headers.findIndex((h) => ["card_id", "cardid", "card", "id"].includes(h));
  const amountIdx = headers.findIndex((h) => ["amount_zec", "amount", "zec"].includes(h));
  const feeIdx = headers.findIndex((h) => ["sweep_fee_buffer_zat", "fee_buffer_zat", "fee", "buffer"].includes(h));
  const tokenIdx = headers.findIndex((h) => ["claim_url", "claim_token", "url", "link", "uri", "payment_link"].includes(h));
  const ackIdx = headers.findIndex((h) => ["ack_hash", "ackhash", "ack"].includes(h));

  if (cardIdIdx === -1 || amountIdx === -1 || ackIdx === -1) {
    throw new Error("CSV missing required columns: card_id, amount_zec, ack_hash");
  }

  const cards: VizorCsvCard[] = [];
  let totalZec = 0;

  for (const row of rowLines) {
    if (!row.trim()) continue;
    const cols = row.split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));

    const rawToken = tokenIdx !== -1 ? cols[tokenIdx] : `token_${cols[cardIdIdx]}`;
    // Prime invariant: Strip #key= bearer key immediately (case-insensitive)
    const sanitizedToken = stripKeyFragment(rawToken);

    const rawCard = {
      cardId: cols[cardIdIdx],
      amountZec: parseFloat(cols[amountIdx]),
      feeBufferZat: feeIdx !== -1 && cols[feeIdx] ? parseInt(cols[feeIdx], 10) : 2000,
      claimToken: sanitizedToken || `token_${cols[cardIdIdx]}`,
      ackHash: cols[ackIdx],
    };

    const validated = VizorCsvCardSchema.parse(rawCard);

    // Defense in depth: Verify sanitized token contains zero secret fragment
    if (/(?:#|%23)key(?:=|%3d)/i.test(validated.claimToken)) {
      throw new Error("Security violation: #key= secret fragment detected in sanitized claim token!");
    }

    cards.push(validated);
    totalZec += validated.amountZec;
  }

  return {
    totalCards: cards.length,
    totalZec,
    cards,
  };
}
