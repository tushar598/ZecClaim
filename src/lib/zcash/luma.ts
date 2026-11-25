/**
 * Client-Side Luma CSV Parser
 *
 * Privacy Invariant:
 * Evaluated exclusively in browser React memory.
 * All attendee identity fields (Name, Email, Social Handle, Ticket ID) are
 * permanently discarded BEFORE network transmission to the server.
 * The payload sent to /api/campaigns/[campaignId]/import-luma contains
 * strictly: { address, amountZat?, memo? }.
 */

export interface ClientLumaRecipient {
  address: string;
  amountZat?: number;
  memo?: string;
}

export interface ParsedLumaCsvResult {
  recipients: ClientLumaRecipient[];
  discardedColumns: string[];
  totalRowsProcessed: number;
}

/**
 * Strips bearer key fragments if accidentally included in CSV
 */
function sanitizeAddress(addr: string): string {
  if (!addr) return "";
  const match = addr.search(/(?:#|%23)key(?:=|%3d)/i);
  if (match !== -1) {
    return addr.substring(0, match);
  }
  return addr.trim();
}

/**
 * Parses Luma attendee CSV text, isolating shielded addresses and discarding all PII.
 */
export function parseClientLumaCsv(
  csvContent: string,
  defaultAmountZat?: number
): ParsedLumaCsvResult {
  const lines = csvContent.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error("Invalid CSV: missing header or empty content");
  }

  const [headerLine, ...rowLines] = lines;
  const headers = headerLine
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, ""));

  // Detect address column
  let addressIdx = headers.findIndex((h) =>
    ["address", "zcash_address", "unified_address", "shielded_address", "zcash", "wallet"].includes(h)
  );

  // If header has no standard match, search for a column named after u1/utest or containing "addr"
  if (addressIdx === -1) {
    addressIdx = headers.findIndex((h) => h.includes("address") || h.includes("wallet"));
  }

  if (addressIdx === -1) {
    // If the header row itself looks like a raw row of values without headers, or missing address column:
    throw new Error(
      "CSV missing required Zcash address column. Expected column header: 'address', 'zcash_address', or 'shielded_address'."
    );
  }

  // Detect optional amount column
  const amountZecIdx = headers.findIndex((h) => ["amount", "amount_zec", "zec"].includes(h));
  const amountZatIdx = headers.findIndex((h) => ["amount_zat", "zat", "zatoshi"].includes(h));

  // Detect optional memo column
  const memoIdx = headers.findIndex((h) => ["memo", "note", "reference"].includes(h));

  // Track discarded PII columns for the user transparency report
  const discardedColumns = headers.filter(
    (_, idx) => idx !== addressIdx && idx !== amountZecIdx && idx !== amountZatIdx && idx !== memoIdx
  );

  const recipients: ClientLumaRecipient[] = [];

  for (const row of rowLines) {
    if (!row.trim()) continue;
    const cols = row.split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));

    const rawAddress = cols[addressIdx];
    if (!rawAddress) continue;

    const address = sanitizeAddress(rawAddress);

    let amountZat: number | undefined = defaultAmountZat;
    if (amountZatIdx !== -1 && cols[amountZatIdx]) {
      const parsedZat = parseInt(cols[amountZatIdx], 10);
      if (!isNaN(parsedZat) && parsedZat > 0) amountZat = parsedZat;
    } else if (amountZecIdx !== -1 && cols[amountZecIdx]) {
      const parsedZec = parseFloat(cols[amountZecIdx]);
      if (!isNaN(parsedZec) && parsedZec > 0) {
        amountZat = Math.round(parsedZec * 100_000_000);
      }
    }

    const memo = memoIdx !== -1 && cols[memoIdx] ? cols[memoIdx].slice(0, 512) : undefined;

    recipients.push({
      address,
      amountZat,
      memo,
    });
  }

  return {
    recipients,
    discardedColumns,
    totalRowsProcessed: recipients.length,
  };
}
