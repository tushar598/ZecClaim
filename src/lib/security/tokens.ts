import crypto from "crypto";

/**
 * Cryptographic Token Generation & Hashing Utilities
 *
 * Security Invariant:
 * The server only stores SHA-256(token + pepper). The raw token is returned
 * only once to the organizer upon link generation.
 */

const DEFAULT_PEPPER = "zecclaim-dev-default-pepper-constant";

export function getPepper(): string {
  return process.env.TOKEN_HASH_PEPPER || DEFAULT_PEPPER;
}

/**
 * Generates a high-entropy CSPRNG blind claim token.
 */
export function generateClaimToken(): string {
  const randomBytes = crypto.randomBytes(32);
  return `claim_${randomBytes.toString("hex")}`;
}

/**
 * Hashes a token using SHA-256 with the server pepper.
 */
export function hashToken(token: string): string {
  const pepper = getPepper();
  return crypto
    .createHash("sha256")
    .update(`${token}:${pepper}`)
    .digest("hex");
}

/**
 * Computes deterministic campaignId from UFVK and funding TxID.
 */
export function computeCampaignId(ufvk: string, fundingTxid: string): string {
  return crypto
    .createHash("sha256")
    .update(`${ufvk}:${fundingTxid}`)
    .digest("hex")
    .slice(0, 16);
}
