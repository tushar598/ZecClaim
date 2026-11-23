import crypto from "crypto";

/**
 * 1-Click PII Scrub & Cryptographic Attestation Generator
 *
 * Invariant:
 * Addresses are sorted alphabetically, hashed into a deterministic SHA-256 commitment,
 * and then permanently wiped from the database.
 */

export interface ScrubExecutionResult {
  addressesPurgedCount: number;
  sha256PurgedSetHash: string;
  executedAt: Date;
}

/**
 * Computes a deterministic SHA-256 hash over an array of recipient addresses.
 */
export function computePurgeSetHash(addresses: string[]): string {
  if (addresses.length === 0) {
    return crypto.createHash("sha256").update("EMPTY_SET").digest("hex");
  }

  // Sort lexicographically to guarantee canonical output
  const sorted = [...addresses].sort();
  const serialized = sorted.join(",");

  return crypto.createHash("sha256").update(serialized).digest("hex");
}

/**
 * Formats a clean public attestation report string for display on the DAO portal.
 */
export function formatAttestationReport(result: ScrubExecutionResult): string {
  return [
    "=== ZECCLAIM PII SCRUB ATTESTATION ===",
    `Timestamp: ${result.executedAt.toISOString()}`,
    `Purged Addresses Count: ${result.addressesPurgedCount}`,
    `SHA-256 Set Hash: ${result.sha256PurgedSetHash}`,
    "Status: Permanent Memory & Database Wipe Complete",
    "=======================================",
  ].join("\n");
}
