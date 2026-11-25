import { base64urlnopad } from "@scure/base";
import { RecipientPayment } from "@/types";

/**
 * Pure TypeScript ZIP 321 Multi-Payment URI Builder & Parser
 * Standard: https://zips.z.cash/zip-0321
 * Formats multi-payment requests with Base64URL-encoded 512-byte memos.
 */

/**
 * Encodes a UTF-8 string memo into RFC 4648 §5 Base64URL without '=' padding.
 * Enforces strict 512 UTF-8 byte length limit (not character count).
 */
export function encodeZip321Memo(memoText: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(memoText);
  if (bytes.length > 512) {
    throw new Error(`Memo exceeds 512-byte ZIP 321 limit (got ${bytes.length} UTF-8 bytes)`);
  }
  return base64urlnopad.encode(bytes);
}

/**
 * Decodes a Base64URL memo into UTF-8 string text.
 */
export function decodeZip321Memo(base64UrlMemo: string): string {
  const bytes = base64urlnopad.decode(base64UrlMemo);
  if (bytes.length > 512) {
    throw new Error(`Decoded memo exceeds 512-byte ZIP 321 limit (got ${bytes.length} UTF-8 bytes)`);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Converts satoshis to standard decimal ZEC string with 8 decimal places.
 */
export function zatoshiToZecString(zatoshis: number): string {
  return (zatoshis / 100_000_000).toFixed(8);
}

/**
 * Converts decimal ZEC string to satoshis.
 */
export function zecStringToZatoshi(zecStr: string): number {
  const parsed = parseFloat(zecStr);
  if (isNaN(parsed) || parsed < 0) {
    throw new Error(`Invalid ZEC amount string: ${zecStr}`);
  }
  return Math.round(parsed * 100_000_000);
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

/**
 * Parses a ZIP 321 URI string back into an array of RecipientPayment objects.
 */
export function parseZip321Uri(uri: string): RecipientPayment[] {
  if (!uri.startsWith("zcash:")) {
    throw new Error("Invalid ZIP 321 URI: must start with 'zcash:'");
  }

  const [addrPart, queryPart] = uri.slice(6).split("?");
  const primaryAddr = decodeURIComponent(addrPart);
  if (!primaryAddr) {
    throw new Error("Invalid ZIP 321 URI: missing primary recipient address");
  }

  const params = new URLSearchParams(queryPart || "");
  const paymentsMap = new Map<number, Partial<RecipientPayment>>();

  // Recipient 0
  paymentsMap.set(0, { address: primaryAddr });
  if (params.has("amount")) {
    paymentsMap.get(0)!.amountZat = zecStringToZatoshi(params.get("amount")!);
  }
  if (params.has("memo")) {
    paymentsMap.get(0)!.memo = decodeZip321Memo(params.get("memo")!);
  }

  // Dot-indexed recipients (address.i, amount.i, memo.i)
  params.forEach((val, key) => {
    const match = key.match(/^(address|amount|memo)\.(\d+)$/);
    if (match) {
      const field = match[1];
      const idx = parseInt(match[2], 10);
      if (!paymentsMap.has(idx)) {
        paymentsMap.set(idx, {});
      }
      const p = paymentsMap.get(idx)!;
      if (field === "address") {
        p.address = decodeURIComponent(val);
      } else if (field === "amount") {
        p.amountZat = zecStringToZatoshi(val);
      } else if (field === "memo") {
        p.memo = decodeZip321Memo(val);
      }
    }
  });

  const sortedIndices = Array.from(paymentsMap.keys()).sort((a, b) => a - b);
  const payments: RecipientPayment[] = [];

  for (const idx of sortedIndices) {
    const item = paymentsMap.get(idx)!;
    if (!item.address) {
      throw new Error(`Invalid ZIP 321 URI: missing address for recipient index ${idx}`);
    }
    payments.push({
      address: item.address,
      amountZat: item.amountZat ?? 0,
      memo: item.memo,
    });
  }

  return payments;
}
