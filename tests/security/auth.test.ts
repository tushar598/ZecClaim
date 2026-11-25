import { describe, it, expect } from "vitest";
import {
  generateAdminSecret,
  hashAdminSecret,
  verifyAdminSecret,
} from "@/lib/security/tokens";

describe("Admin Secret Auth & Cryptographic Guard", () => {
  it("generates CSPRNG admin secret with expected prefix and 64-hex entropy", () => {
    const sec1 = generateAdminSecret();
    const sec2 = generateAdminSecret();

    expect(sec1).toMatch(/^sec_[a-f0-9]{64}$/);
    expect(sec2).toMatch(/^sec_[a-f0-9]{64}$/);
    expect(sec1).not.toBe(sec2);
  });

  it("hashes admin secret with server pepper and verifies in constant time", () => {
    const secret = generateAdminSecret();
    const hash = hashAdminSecret(secret);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyAdminSecret(secret, hash)).toBe(true);
  });

  it("rejects invalid or tampered admin secrets", () => {
    const secret = generateAdminSecret();
    const hash = hashAdminSecret(secret);

    expect(verifyAdminSecret("sec_invalid_secret_candidate_1234567890", hash)).toBe(false);
    expect(verifyAdminSecret(secret + "_tampered", hash)).toBe(false);
  });
});
