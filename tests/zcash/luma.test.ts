import { describe, it, expect } from "vitest";
import { parseClientLumaCsv } from "@/lib/zcash/luma";

describe("Client-Side Luma CSV Parser", () => {
  it("discards Name and Email columns in browser memory and extracts only shielded addresses", () => {
    const csv = [
      "name,email,address,amount_zec",
      "Alice,alice@example.com,u1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq,0.5",
      "Bob,bob@example.com,u1zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz,1.0",
    ].join("\n");

    const result = parseClientLumaCsv(csv);

    expect(result.totalRowsProcessed).toBe(2);
    expect(result.discardedColumns).toContain("name");
    expect(result.discardedColumns).toContain("email");

    expect(result.recipients[0]).toEqual({
      address: "u1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
      amountZat: 50_000_000,
      memo: undefined,
    });
    // Ensure no name or email exists on recipient object
    expect((result.recipients[0] as unknown as Record<string, unknown>).name).toBeUndefined();
    expect((result.recipients[0] as unknown as Record<string, unknown>).email).toBeUndefined();

    expect(result.recipients[1]).toEqual({
      address: "u1zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
      amountZat: 100_000_000,
      memo: undefined,
    });
  });

  it("sanitizes accidental #key= fragment in address column", () => {
    const csv = [
      "address",
      "u1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq#key=accidental_key_leak",
    ].join("\n");

    const result = parseClientLumaCsv(csv, 10_000_000);
    expect(result.recipients[0].address).toBe(
      "u1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq"
    );
    expect(result.recipients[0].address).not.toContain("#key=");
    expect(result.recipients[0].amountZat).toBe(10_000_000);
  });

  it("throws descriptive error when address column is absent", () => {
    const csv = [
      "name,email,ticket_id",
      "Alice,alice@example.com,TICK-101",
    ].join("\n");

    expect(() => parseClientLumaCsv(csv)).toThrow(
      /missing required Zcash address column/i
    );
  });
});
