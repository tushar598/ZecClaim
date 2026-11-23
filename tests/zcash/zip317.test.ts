import { describe, it, expect } from "vitest";
import {
  calculateZip2009Fee,
  chunkBatchPayouts,
  SAFE_CHUNK_ACTION_LIMIT,
} from "@/lib/zcash/zip317";

describe("ZIP 317 & ZIP 2009 Fee & Batch Chunker", () => {
  it("applies 2 grace actions minimum under ZIP 2009 (1000 zat/action)", () => {
    expect(calculateZip2009Fee(1)).toBe(2000); // 2 grace actions * 1000
    expect(calculateZip2009Fee(2)).toBe(2000);
    expect(calculateZip2009Fee(10)).toBe(10_000);
    expect(calculateZip2009Fee(300)).toBe(300_000);
  });

  it("limits each batch chunk to <= 300 actions", () => {
    // Generate 650 mock recipients
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
    });
  });
});
