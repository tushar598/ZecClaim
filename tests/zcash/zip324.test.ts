import { describe, it, expect } from "vitest";
import { parseVizorCsv } from "@/lib/zcash/zip324";

describe("Vizor ZIP 324 CSV Parser", () => {
  it("parses valid Vizor group gift-card export CSV", () => {
    const csvData = [
      "card_id,amount_zec,sweep_fee_buffer_zat,claim_token,ack_hash",
      "CARD-01,0.05000000,2000,sampletoken1234567890,e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "CARD-02,0.10000000,2000,sampletoken0987654321,e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ].join("\n");

    const parsed = parseVizorCsv(csvData);
    expect(parsed.totalCards).toBe(2);
    expect(parsed.totalZec).toBeCloseTo(0.15, 5);
    expect(parsed.cards[0].cardId).toBe("CARD-01");
    expect(parsed.cards[0].feeBufferZat).toBe(2000);
  });

  it("throws when required headers are missing", () => {
    const invalidCsv = "invalid,header\n1,2";
    expect(() => parseVizorCsv(invalidCsv)).toThrow(/missing required columns/);
  });
});
