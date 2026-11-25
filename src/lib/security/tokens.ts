import crypto from "crypto";
import { DEMO_ADMIN_SECRET, DEMO_ACK_CODES } from "@/lib/demo/constants";

/**
 * Cryptographic Token Generation & Hashing Utilities (server-only: uses Node crypto)
 *
 * Security Invariant:
 * The server only stores SHA-256(token + pepper). The raw token is returned
 * only once to the organizer upon link generation.
 */

// Re-exported for existing server-side callers; client code must import from @/lib/demo/constants.
export { DEMO_ADMIN_SECRET, DEMO_ACK_CODES };

export const DEMO_PEPPER = "zecclaim-demo-sandbox-salt";
// SHA-256(`${DEMO_ADMIN_SECRET}:${DEMO_PEPPER}`)
export const DEMO_ADMIN_SECRET_HASH = "0e64c394f3b19631ceec56f15f470b4eb4799bd958087e363b86b36b0f1500c0";

export function hashAckCode(ackCode: string): string {
  return crypto.createHash("sha256").update(ackCode.trim()).digest("hex");
}

const DEFAULT_DEV_PEPPER = "zecclaim-dev-default-pepper-constant";

export function getPepper(): string {
  const pepper = process.env.ADMIN_SECRET_PEPPER || process.env.TOKEN_HASH_PEPPER;
  if (process.env.NODE_ENV === "production" && !pepper) {
    throw new Error(
      "CRITICAL SECURITY CONFIGURATION ERROR: ADMIN_SECRET_PEPPER (or TOKEN_HASH_PEPPER) environment variable must be set in production."
    );
  }
  return pepper || DEFAULT_DEV_PEPPER;
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
 * Generates a high-entropy CSPRNG admin secret for campaign organizers.
 */
export function generateAdminSecret(): string {
  const randomBytes = crypto.randomBytes(32);
  return `sec_${randomBytes.toString("hex")}`;
}

/**
 * Hashes an admin secret using SHA-256 with the server pepper.
 */
export function hashAdminSecret(secret: string): string {
  return hashToken(secret);
}

/**
 * Constant-time comparison between a candidate admin secret and expected hash.
 */
export function verifyAdminSecret(secret: string, expectedHash: string): boolean {
  const candidateHash = hashAdminSecret(secret);
  if (candidateHash.length !== expectedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(candidateHash, "hex"), Buffer.from(expectedHash, "hex"));
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
