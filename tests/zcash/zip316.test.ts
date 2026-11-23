import { describe, it, expect } from "vitest";
import { inspectZcashAddress } from "@/lib/zcash/zip316";

describe("ZIP 316 Preflight Address Validator", () => {
  it("hard-rejects transparent t1... addresses", () => {
    const result = inspectZcashAddress("t1abc1234567890abcdef1234567890abcdef12");
    expect(result.isValid).toBe(false);
    expect(result.isShielded).toBe(false);
    expect(result.hasTransparentReceiver).toBe(true);
    expect(result.poolType).toBe("TRANSPARENT_REJECTED");
    expect(result.errorMessage).toContain("Transparent addresses (t1...) are not supported");
  });

  it("hard-rejects transparent t3... addresses", () => {
    const result = inspectZcashAddress("t3abc1234567890abcdef1234567890abcdef12");
    expect(result.isValid).toBe(false);
    expect(result.isShielded).toBe(false);
    expect(result.poolType).toBe("TRANSPARENT_REJECTED");
  });

  it("warns on legacy Sapling zs1... addresses", () => {
    const result = inspectZcashAddress("zs1z7rejlpsa98s2rrrfkwmaxu53e4ue0ulcrw0h4x5g8phpmwfzq8");
    expect(result.isValid).toBe(true);
    expect(result.isShielded).toBe(true);
    expect(result.poolType).toBe("SAPLING");
    expect(result.warningMessage).toContain("Legacy Sapling address detected");
  });

  it("validates modern Orchard Unified Address", () => {
    // 60+ character string starting with u1
    const testUa = "u1q8q7s2e5v7f4h6j8k0m2n4p6r8t0v2w4x6y8z0a2c4e6g8i0k2m4n6p8r0t2v4w6x8y0z2";
    const result = inspectZcashAddress(testUa);
    expect(result.isValid).toBe(true);
    expect(result.isShielded).toBe(true);
    expect(result.poolType).toBe("ORCHARD");
    expect(result.hasTransparentReceiver).toBe(false);
  });
});
