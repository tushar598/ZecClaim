import { describe, it, expect } from "vitest";
import { encodeZip321Memo, buildZip321Uri, zatoshiToZecString } from "@/lib/zcash/zip321";

describe("ZIP 321 Payment URI Builder", () => {
  it("encodes memos into RFC 4648 Base64URL without padding", () => {
    const memo = "ZecClaim Hackathon Payout";
    const encoded = encodeZip321Memo(memo);
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
  });

  it("throws when memo exceeds 512 bytes", () => {
    const longMemo = "A".repeat(513);
    expect(() => encodeZip321Memo(longMemo)).toThrow(/512-byte/);
  });

  it("converts zatoshis to standard 8-decimal ZEC string", () => {
    expect(zatoshiToZecString(100_000_000)).toBe("1.00000000");
    expect(zatoshiToZecString(50_000_000)).toBe("0.50000000");
    expect(zatoshiToZecString(1_000)).toBe("0.00001000");
  });

  it("builds multi-recipient URI with dot-indexing for subsequent recipients", () => {
    const uri = buildZip321Uri([
      { address: "u1primary", amountZat: 100_000_000, memo: "Memo 1" },
      { address: "u1second", amountZat: 50_000_000, memo: "Memo 2" },
    ]);

    expect(uri).toContain("zcash:u1primary?");
    expect(uri).toContain("amount=1.00000000");
    expect(uri).toContain("address.1=u1second");
    expect(uri).toContain("amount.1=0.50000000");
    expect(uri).toContain("memo.1=");
  });
});
