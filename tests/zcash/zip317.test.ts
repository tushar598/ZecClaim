import { describe, it, expect } from "vitest";
import {
  calculateZip2009Fee,
  chunkBatchPayouts,
  SAFE_CHUNK_ACTION_LIMIT,
  MARGINAL_FEE_ZAT_ZIP2009,
} from "@/lib/zcash/zip317";

describe("ZIP 317 & ZIP 2009 Fee & Batch Chunker", () => {
  it("applies 2 grace actions minimum under ZIP 2009 (1000 zat/action)", () => {
    expect(calculateZip2009Fee(1)).toBe(2000); // 2 grace actions * 1000
    expect(calculateZip2009Fee(2)).toBe(2000);
    expect(calculateZip2009Fee(10)).toBe(10_000);
    expect(calculateZip2009Fee(300)).toBe(300_000);
  });

  it("supports configurable fee margin / transition buffer", () => {
    expect(calculateZip2009Fee(10, 500)).toBe(10_500);
    expect(calculateZip2009Fee(1, 1000)).toBe(3_000);
  });

  it("correctly chunks 301 recipients across transactions with <= 300 actions each", () => {
    const recipients = Array.from({ length: 301 }, (_, i) => ({
      address: `u1recipient_${i}_placeholder_unified_address_string_length_check`,
      amountZat: 10_000_000,
      memo: `Payout ${i}`,
    }));

    // With reservedActions = 2, max recipients per chunk = 298
    const chunks = chunkBatchPayouts(recipients, SAFE_CHUNK_ACTION_LIMIT, 2);

    expect(chunks.length).toBe(2);
    expect(chunks[0].recipients.length).toBe(298);
    expect(chunks[0].actionsCount).toBeLessThanOrEqual(SAFE_CHUNK_ACTION_LIMIT);
    expect(chunks[0].estimatedFeeZat).toBe(chunks[0].actionsCount * MARGINAL_FEE_ZAT_ZIP2009);

    expect(chunks[1].recipients.length).toBe(3);
    expect(chunks[1].actionsCount).toBeLessThanOrEqual(SAFE_CHUNK_ACTION_LIMIT);
  });

  it("limits each batch chunk to <= 300 actions for 650 recipients", () => {
    const mockRecipients = Array.from({ length: 650 }, (_, i) => ({
      address: `u1recipient_${i}_placeholder_unified_address_string_length_check`,
      amountZat: 10_000_000,
      memo: `Payout ${i}`,
    }));

    const chunks = chunkBatchPayouts(mockRecipients, SAFE_CHUNK_ACTION_LIMIT);

    expect(chunks.length).toBeGreaterThanOrEqual(3);
    chunks.forEach((chunk) => {
      expect(chunk.actionsCount).toBeLessThanOrEqual(SAFE_CHUNK_ACTION_LIMIT);
      expect(chunk.estimatedFeeZat).toBe(chunk.actionsCount * 1000);
      expect(chunk.zip321Uri.startsWith("zcash:")).toBe(true);
    });
  });

  it("returns empty array for zero recipients", () => {
    expect(chunkBatchPayouts([])).toEqual([]);
  });

  it("throws when maxActionsPerChunk exceeds NU7 consensus block limit (330 actions)", () => {
    const recipients = [
      { address: "u1sample", amountZat: 1000 },
    ];
    expect(() => chunkBatchPayouts(recipients, 331)).toThrow(/cannot exceed NU7 block limit/);
  });
});

describe("estimateBatchFeeZat", () => {
  it("matches the fees chunkBatchPayouts would charge", async () => {
    const { estimateBatchFeeZat, chunkBatchPayouts } = await import("@/lib/zcash/zip317");
    for (const n of [0, 1, 2, 50, 298, 299, 600, 1000]) {
      const recipients = Array.from({ length: n }, (_, i) => ({ address: `u1x${i}`, amountZat: 1 }));
      const chunks = chunkBatchPayouts(recipients, 300, 2);
      const total = chunks.reduce((sum, c) => sum + c.estimatedFeeZat, 0);
      expect(estimateBatchFeeZat(n)).toBe(total);
    }
  });
});
