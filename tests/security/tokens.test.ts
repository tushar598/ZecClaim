import { describe, it, expect } from "vitest";
import {
  generateClaimToken,
  hashToken,
  computeCampaignId,
  getPepper,
} from "@/lib/security/tokens";

describe("Security Tokens & Hashing Module", () => {
  it("generates CSPRNG claim tokens with expected prefix and entropy", () => {
    const token1 = generateClaimToken();
    const token2 = generateClaimToken();

    expect(token1).toMatch(/^claim_[a-f0-9]{64}$/);
    expect(token2).toMatch(/^claim_[a-f0-9]{64}$/);
    expect(token1).not.toBe(token2);
  });

  it("hashes tokens deterministically using SHA-256 and server pepper", () => {
    const token = "claim_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces distinct hashes for different tokens", () => {
    const hash1 = hashToken("token_alpha");
    const hash2 = hashToken("token_beta");

    expect(hash1).not.toBe(hash2);
  });

  it("retrieves a non-empty pepper constant", () => {
    const pepper = getPepper();
    expect(typeof pepper).toBe("string");
    expect(pepper.length).toBeGreaterThan(10);
  });

  it("computes deterministic 16-character campaignId from UFVK and funding TxID", () => {
    const ufvk = "uview1testanchorufvk1234567890abcdef";
    const txid = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    const id1 = computeCampaignId(ufvk, txid);
    const id2 = computeCampaignId(ufvk, txid);

    expect(id1).toBe(id2);
    expect(id1.length).toBe(16);
    expect(id1).toMatch(/^[a-f0-9]{16}$/);

    const id3 = computeCampaignId(ufvk, "different_txid_64_character_hex_string_0123456789abcdef01234567");
    expect(id1).not.toBe(id3);
  });
});
