import { describe, it, expect } from "vitest";
import {
  encodeZip321Memo,
  decodeZip321Memo,
  buildZip321Uri,
  parseZip321Uri,
  zatoshiToZecString,
  zecStringToZatoshi,
} from "@/lib/zcash/zip321";

describe("ZIP 321 Payment URI Builder & Parser", () => {
  it("encodes memos into RFC 4648 Base64URL without padding", () => {
    const memo = "ZecClaim Hackathon Payout";
    const encoded = encodeZip321Memo(memo);
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
    expect(decodeZip321Memo(encoded)).toBe(memo);
  });

  it("throws when ASCII memo exceeds 512 bytes", () => {
    const longMemo = "A".repeat(513);
    expect(() => encodeZip321Memo(longMemo)).toThrow(/512-byte/);
  });

  it("strictly enforces UTF-8 byte length limit for multi-byte characters", () => {
    const emoji = "😀"; // exactly 4 UTF-8 bytes: 0xF0 0x9F 0x98 0x80
    const validEmojiMemo = emoji.repeat(128); // 128 * 4 = 512 bytes
    expect(new TextEncoder().encode(validEmojiMemo).length).toBe(512);
    expect(() => encodeZip321Memo(validEmojiMemo)).not.toThrow();

    // 129 emojis = 516 bytes (must throw even though string length is 129 or 258 UTF-16 code units)
    const invalidEmojiMemo = emoji.repeat(129); // 516 bytes
    expect(new TextEncoder().encode(invalidEmojiMemo).length).toBe(516);
    expect(() => encodeZip321Memo(invalidEmojiMemo)).toThrow(/512-byte/);
  });

  it("converts zatoshis to standard 8-decimal ZEC string and back", () => {
    expect(zatoshiToZecString(100_000_000)).toBe("1.00000000");
    expect(zatoshiToZecString(50_000_000)).toBe("0.50000000");
    expect(zatoshiToZecString(1_000)).toBe("0.00001000");

    expect(zecStringToZatoshi("1.00000000")).toBe(100_000_000);
    expect(zecStringToZatoshi("0.50000000")).toBe(50_000_000);
    expect(zecStringToZatoshi("0.00001000")).toBe(1_000);
  });

  it("builds multi-recipient URI with dot-indexing for subsequent recipients", () => {
    const uri = buildZip321Uri([
      { address: "u1primary", amountZat: 100_000_000, memo: "Memo 1" },
      { address: "u1second", amountZat: 50_000_000, memo: "Memo 2" },
      { address: "u1third", amountZat: 25_000_000 },
    ]);

    expect(uri).toContain("zcash:u1primary?");
    expect(uri).toContain("amount=1.00000000");
    expect(uri).toContain("address.1=u1second");
    expect(uri).toContain("amount.1=0.50000000");
    expect(uri).toContain("memo.1=");
    expect(uri).toContain("address.2=u1third");
    expect(uri).toContain("amount.2=0.25000000");
  });

  it("roundtrips parsing of generated ZIP 321 URIs", () => {
    const payments = [
      { address: "u1primaryaddr", amountZat: 100_000_000, memo: "Memo primary" },
      { address: "u1secondaddr", amountZat: 50_000_000, memo: "Memo second" },
      { address: "u1thirdaddr", amountZat: 75_000_000 },
    ];

    const uri = buildZip321Uri(payments);
    const parsed = parseZip321Uri(uri);

    expect(parsed.length).toBe(3);
    expect(parsed[0].address).toBe("u1primaryaddr");
    expect(parsed[0].amountZat).toBe(100_000_000);
    expect(parsed[0].memo).toBe("Memo primary");

    expect(parsed[1].address).toBe("u1secondaddr");
    expect(parsed[1].amountZat).toBe(50_000_000);
    expect(parsed[1].memo).toBe("Memo second");

    expect(parsed[2].address).toBe("u1thirdaddr");
    expect(parsed[2].amountZat).toBe(75_000_000);
  });

  it("throws when building URI with zero recipients", () => {
    expect(() => buildZip321Uri([])).toThrow(/zero recipients/);
  });
});
