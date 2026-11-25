import crypto from "crypto";
import { CampaignRecord, ClaimSlotRecord, VoucherCardRecord } from "@/types";

/**
 * Public projections of stored records.
 *
 * Anything returned by an unauthenticated endpoint must pass through these helpers:
 * - `adminSecretHash` would let an attacker test admin-secret guesses offline.
 * - `ackCodeHash` is an unsalted SHA-256 of a short ACK code. Published, it can be
 *   brute-forced offline in minutes, and the attacker could then "confirm" a card
 *   they swept themselves and pre-empt the real recipient's dispute.
 * - `recipientAddress` and `tokenHash` are recipient PII / claim credentials.
 * - `ufvk` is replaced by its SHA-256 fingerprint unless the organizer opted in to publishing it:
 *   the full key's outgoing viewing key decrypts every payout, including recipient addresses,
 *   which would undo the address scrub. Auditors get the key out of band and compare fingerprints.
 */

/** SHA-256 (hex) of the UFVK string, so an auditor holding the key can match it to the campaign. */
export function ufvkFingerprint(ufvk: string): string {
  return crypto.createHash("sha256").update(ufvk.trim()).digest("hex");
}

type PlainRecord<T> = T & { _id?: unknown; __v?: unknown };

function toPlain<T>(record: T | { toObject: () => T }): PlainRecord<T> {
  const maybeDoc = record as { toObject?: () => T };
  return (typeof maybeDoc.toObject === "function" ? maybeDoc.toObject() : record) as PlainRecord<T>;
}

export type PublicCampaign = Omit<CampaignRecord, "adminSecretHash" | "ufvk"> & {
  ufvk: string | null;
  ufvkFingerprint: string;
};
export type PublicVoucher = Omit<VoucherCardRecord, "ackCodeHash">;
export type PublicClaimSlot = Omit<ClaimSlotRecord, "recipientAddress" | "tokenHash">;

export function toPublicCampaign(record: CampaignRecord | { toObject: () => CampaignRecord }): PublicCampaign {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { adminSecretHash, _id, __v, ufvk, ...rest } = toPlain(record);
  return { ...rest, ufvk: rest.publishUfvk ? ufvk : null, ufvkFingerprint: ufvkFingerprint(ufvk) };
}

export function toPublicVoucher(record: VoucherCardRecord | { toObject: () => VoucherCardRecord }): PublicVoucher {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { ackCodeHash, _id, __v, ...rest } = toPlain(record);
  return rest;
}

export function toPublicClaimSlot(record: ClaimSlotRecord | { toObject: () => ClaimSlotRecord }): PublicClaimSlot {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { recipientAddress, tokenHash, _id, __v, ...rest } = toPlain(record);
  return rest;
}
