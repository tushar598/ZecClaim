import { describe, it, expect } from "vitest";
import { computePurgeSetHash, formatAttestationReport } from "@/lib/security/scrub";

describe("PII Scrub & Cryptographic Attestation Generator", () => {
  it("computes deterministic hash for empty set", () => {
    const hash = computePurgeSetHash([]);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("enforces canonical lexicographical sorting of addresses before hashing", () => {
    const list1 = [
      "u1zcashaddresscharlie",
      "u1zcashaddressalice",
      "u1zcashaddressbob",
    ];
    const list2 = [
      "u1zcashaddressbob",
      "u1zcashaddresscharlie",
      "u1zcashaddressalice",
    ];

    const hash1 = computePurgeSetHash(list1);
    const hash2 = computePurgeSetHash(list2);

    expect(hash1).toBe(hash2);
  });

  it("generates formatted public attestation report string without em dashes", () => {
    const date = new Date("2026-11-23T12:00:00Z");
    const result = {
      addressesPurgedCount: 42,
      sha256PurgedSetHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      executedAt: date,
    };

    const report = formatAttestationReport(result);

    expect(report).toContain("=== ZECCLAIM PII SCRUB ATTESTATION ===");
    expect(report).toContain("Purged Addresses Count: 42");
    expect(report).toContain("SHA-256 Set Hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(report).toContain("Permanent Memory & Database Wipe Complete");
    // Invariant: No em dashes in UI copy
    expect(report).not.toContain("—");
  });
});
