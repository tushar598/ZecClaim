import { RecipientPayment } from "@/types";

/**
 * Pure TypeScript ZIP 321 Multi-Payment URI Builder
 * Standard: https://zips.z.cash/zip-0321
 * Formats multi-payment requests with Base64URL-encoded 512-byte memos.
 */

/**
 * Encodes a UTF-8 string memo into RFC 4648 §5 Base64URL without '=' padding.
 */
export function encodeZip321Memo(memoText: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(memoText);
  if (bytes.length > 512) {
    throw new Error(`Memo exceeds 512-byte ZIP 321 limit (got ${bytes.length} bytes)`);
  }
  const binary = String.fromCharCode(...bytes);
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Converts satoshis to standard decimal ZEC string with 8 decimal places.
 */
export function zatoshiToZecString(zatoshis: number): string {
  const zec = (zatoshis / 100_000_000).toFixed(8);
  return zec;
}

/**
 * Builds a ZIP 321 multi-payment URI from an array of recipient payments.
 */
export function buildZip321Uri(payments: RecipientPayment[]): string {
  if (payments.length === 0) {
    throw new Error("Cannot build ZIP 321 URI with zero recipients");
  }

  const [first, ...rest] = payments;
  const parts: string[] = [];

  // Recipient 0 (primary, no index prefix)
  parts.push(`amount=${zatoshiToZecString(first.amountZat)}`);
  if (first.memo) {
    parts.push(`memo=${encodeZip321Memo(first.memo)}`);
  }

  // Recipients 1..N (dot-indexed)
  rest.forEach((recipient, idx) => {
    const dotIdx = idx + 1;
    parts.push(`address.${dotIdx}=${encodeURIComponent(recipient.address)}`);
    parts.push(`amount.${dotIdx}=${zatoshiToZecString(recipient.amountZat)}`);
    if (recipient.memo) {
      parts.push(`memo.${dotIdx}=${encodeZip321Memo(recipient.memo)}`);
    }
  });

  return `zcash:${encodeURIComponent(first.address)}?${parts.join("&")}`;
}
