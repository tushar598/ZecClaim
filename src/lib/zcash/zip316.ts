import { bech32, bech32m } from "@scure/base";
import { blake2b } from "@noble/hashes/blake2.js";
import {
  ParsedReceiver,
  Zip316InspectionResult,
  UfvkInspectionResult,
  ZcashNetwork,
} from "@/types";

/**
 * Pure TypeScript ZIP 316 Unified Address / Unified Viewing Key decoder & preflight validator.
 *
 * Standards:
 * - ZIP 316: Unified Addresses and Unified Viewing Keys (Bech32m + F4Jumble + TLV items)
 * - ZIP 32 / Sapling: legacy Bech32 Sapling payment addresses (zs1 / ztestsapling1)
 *
 * ZIP 316 typecode registry (as published on zips.z.cash):
 *   0x00 P2PKH, 0x01 P2SH, 0x02 Sapling, 0x03 Orchard, 0x04..0xBF unassigned,
 *   0xC0 viewing-key birthday (UVK only), 0xE0..0xFC MUST-understand metadata.
 * The Ironwood pool reuses the Orchard receiver format (typecode 0x03); there is no
 * separate Ironwood receiver typecode, so an address can never prove "Ironwood" by itself.
 *
 * Decoder rules enforced here (ZIP 316 "Consumer" requirements):
 * - Items MUST be in strictly ascending typecode order (this also rejects duplicates).
 * - Unrecognised non-metadata items are ignored.
 * - Unrecognised MUST-understand metadata items (0xE0..0xFC) make the whole UA/UVK unsupported.
 *
 * ZecClaim policy on top of ZIP 316:
 * - Any transparent receiver (0x00 / 0x01) is hard-rejected.
 * - An Orchard receiver (0x03) is required for "Verified Shielded"; Sapling-only is accepted with a warning.
 */

export const CONSENSUS_BRANCH_ID_NU7 = "0x77190AD9";

const TRANSPARENT_ERROR =
  "Transparent addresses (t1...) are not supported. Please use a modern shielded Unified Address (u1...) from a supported wallet like Zingo, Zodl, or Ywallet.";

/** Typecodes in this range are MUST-understand metadata (ZIP 316 Revision 1+). */
function isMustUnderstandMetadata(typecode: number): boolean {
  return typecode >= 0xe0 && typecode <= 0xfc;
}

/**
 * Determines whether a Zcash address is for Mainnet, Testnet, or Unknown
 */
export function getAddressNetwork(address: string): ZcashNetwork | "unknown" {
  const trimmed = address.trim();
  if (
    trimmed.startsWith("utest1") ||
    trimmed.startsWith("zutest1") ||
    trimmed.startsWith("ztestsapling1") ||
    trimmed.startsWith("tm") ||
    trimmed.startsWith("t2")
  ) {
    return "testnet";
  }
  if (
    trimmed.startsWith("u1") ||
    trimmed.startsWith("zu1") ||
    trimmed.startsWith("zs1") ||
    trimmed.startsWith("t1") ||
    trimmed.startsWith("t3")
  ) {
    return "mainnet";
  }
  return "unknown";
}

const F4JUMBLE_G_PERS = new TextEncoder().encode("UA_F4Jumble_G"); // 13 bytes
const F4JUMBLE_H_PERS = new TextEncoder().encode("UA_F4Jumble_H"); // 13 bytes

/**
 * Constructs 16-byte personalization for G round function:
 * "UA_F4Jumble_G" (13 bytes) || [round] (1 byte) || [j_lo, j_hi] (2 bytes LE)
 */
function makeGPers(round: number, j: number): Uint8Array {
  const pers = new Uint8Array(16);
  pers.set(F4JUMBLE_G_PERS, 0);
  pers[13] = round & 0xff;
  pers[14] = j & 0xff;
  pers[15] = (j >> 8) & 0xff;
  return pers;
}

/**
 * Constructs 16-byte personalization for H round function:
 * "UA_F4Jumble_H" (13 bytes) || [round] (1 byte) || [0, 0] (2 bytes)
 */
function makeHPers(round: number): Uint8Array {
  const pers = new Uint8Array(16);
  pers.set(F4JUMBLE_H_PERS, 0);
  pers[13] = round & 0xff;
  pers[14] = 0;
  pers[15] = 0;
  return pers;
}

/**
 * Round function G(i, u): expands u (length lL) into lR bytes using BLAKE2b XOF blocks
 */
function roundG(i: number, u: Uint8Array, lR: number): Uint8Array {
  const out = new Uint8Array(lR);
  const blocks = Math.ceil(lR / 64);
  for (let j = 0; j < blocks; j++) {
    const pers = makeGPers(i, j);
    const digest = blake2b(u, { dkLen: 64, personalization: pers });
    const offset = j * 64;
    const len = Math.min(64, lR - offset);
    out.set(digest.subarray(0, len), offset);
  }
  return out;
}

/**
 * Round function H(i, u): hashes u (length lR) into lL bytes using BLAKE2b
 */
function roundH(i: number, u: Uint8Array, lL: number): Uint8Array {
  const pers = makeHPers(i);
  return blake2b(u, { dkLen: lL, personalization: pers });
}

/**
 * Bitwise XOR between two byte arrays of identical length
 */
function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== b.length) {
    throw new Error(`XOR length mismatch: ${a.length} !== ${b.length}`);
  }
  const res = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    res[i] = a[i] ^ b[i];
  }
  return res;
}

/**
 * F4Jumble permutation (ZIP 316)
 * Valid for byte lengths 38 <= l <= 4194368
 */
export function f4jumble(message: Uint8Array): Uint8Array {
  const l = message.length;
  if (l < 38 || l > 4194368) {
    throw new Error(`F4Jumble message length out of range [38, 4194368]: ${l}`);
  }
  const lL = Math.min(64, Math.floor(l / 2));
  const lR = l - lL;

  const a = message.subarray(0, lL);
  const b = message.subarray(lL);

  const G0 = roundG(0, a, lR);
  const y = xorBytes(b, G0);
  const H0 = roundH(0, y, lL);
  const x = xorBytes(a, H0);
  const G1 = roundG(1, x, lR);
  const d = xorBytes(y, G1);
  const H1 = roundH(1, d, lL);
  const c = xorBytes(x, H1);

  const out = new Uint8Array(l);
  out.set(c, 0);
  out.set(d, lL);
  return out;
}

/**
 * Inverse F4Jumble permutation (F4Jumble^-1)
 */
export function f4jumbleInv(jumbled: Uint8Array): Uint8Array {
  const l = jumbled.length;
  if (l < 38 || l > 4194368) {
    throw new Error(`F4Jumble message length out of range [38, 4194368]: ${l}`);
  }
  const lL = Math.min(64, Math.floor(l / 2));
  const lR = l - lL;

  const c = jumbled.subarray(0, lL);
  const d = jumbled.subarray(lL);

  const H1 = roundH(1, d, lL);
  const x = xorBytes(c, H1);
  const G1 = roundG(1, x, lR);
  const y = xorBytes(d, G1);
  const H0 = roundH(0, y, lL);
  const a = xorBytes(x, H0);
  const G0 = roundG(0, a, lR);
  const b = xorBytes(y, G0);

  const out = new Uint8Array(l);
  out.set(a, 0);
  out.set(b, lL);
  return out;
}

/**
 * Returns 16-byte zero-padded HRP buffer as specified in ZIP 316
 */
export function getHrpPadding(hrp: string): Uint8Array {
  const pad = new Uint8Array(16);
  for (let i = 0; i < hrp.length; i++) {
    pad[i] = hrp.charCodeAt(i);
  }
  return pad;
}

/**
 * Encodes an integer into standard CompactSize format (Bitcoin / Zcash)
 */
export function encodeCompactSize(val: number): Uint8Array {
  if (val < 0xfd) {
    return new Uint8Array([val]);
  } else if (val <= 0xffff) {
    const buf = new Uint8Array(3);
    buf[0] = 0xfd;
    new DataView(buf.buffer).setUint16(1, val, true);
    return buf;
  } else if (val <= 0xffffffff) {
    const buf = new Uint8Array(5);
    buf[0] = 0xfe;
    new DataView(buf.buffer).setUint32(1, val, true);
    return buf;
  } else {
    const buf = new Uint8Array(9);
    buf[0] = 0xff;
    new DataView(buf.buffer).setBigUint64(1, BigInt(val), true);
    return buf;
  }
}

/**
 * Decodes a CompactSize integer from a byte buffer at given offset
 */
export function decodeCompactSize(
  bytes: Uint8Array,
  offset: number
): { value: number; size: number } {
  if (offset >= bytes.length) {
    throw new Error("CompactSize offset out of bounds");
  }
  const first = bytes[offset];
  if (first < 0xfd) {
    return { value: first, size: 1 };
  } else if (first === 0xfd) {
    if (offset + 3 > bytes.length) throw new Error("Truncated CompactSize uint16");
    const val = new DataView(bytes.buffer, bytes.byteOffset + offset).getUint16(1, true);
    return { value: val, size: 3 };
  } else if (first === 0xfe) {
    if (offset + 5 > bytes.length) throw new Error("Truncated CompactSize uint32");
    const val = new DataView(bytes.buffer, bytes.byteOffset + offset).getUint32(1, true);
    return { value: val, size: 5 };
  } else {
    if (offset + 9 > bytes.length) throw new Error("Truncated CompactSize uint64");
    const val = Number(
      new DataView(bytes.buffer, bytes.byteOffset + offset).getBigUint64(1, true)
    );
    return { value: val, size: 9 };
  }
}

/**
 * Encodes TLV items into a ZIP 316 Bech32m string (works for both UAs and UVKs).
 * Items are written in the order given; callers are responsible for ascending typecode order.
 */
export function encodeUnifiedAddress(
  hrp: string,
  receivers: { typecode: number; data: Uint8Array }[]
): string {
  if (receivers.length === 0) {
    throw new Error("Cannot encode Unified Address with zero receivers");
  }

  const tlvParts: Uint8Array[] = [];
  for (const r of receivers) {
    const tcBytes = encodeCompactSize(r.typecode);
    const lenBytes = encodeCompactSize(r.data.length);
    const chunk = new Uint8Array(tcBytes.length + lenBytes.length + r.data.length);
    chunk.set(tcBytes, 0);
    chunk.set(lenBytes, tcBytes.length);
    chunk.set(r.data, tcBytes.length + lenBytes.length);
    tlvParts.push(chunk);
  }

  const totalTlvLen = tlvParts.reduce((sum, p) => sum + p.length, 0);
  const padding = getHrpPadding(hrp);
  const unjumbled = new Uint8Array(totalTlvLen + 16);

  let offset = 0;
  for (const part of tlvParts) {
    unjumbled.set(part, offset);
    offset += part.length;
  }
  unjumbled.set(padding, offset);

  const jumbled = f4jumble(unjumbled);
  const words = bech32m.toWords(jumbled);
  return bech32m.encode(hrp, words, false);
}

/**
 * Encodes a legacy Sapling payment address (43-byte diversifier || pk_d) as Bech32.
 * Exposed for tests and fixtures.
 */
export function encodeSaplingAddress(network: ZcashNetwork, payload: Uint8Array): string {
  if (payload.length !== 43) {
    throw new Error(`Sapling payment address payload must be 43 bytes, got ${payload.length}`);
  }
  const hrp = network === "testnet" ? "ztestsapling" : "zs";
  return bech32.encode(hrp, bech32.toWords(payload), false);
}

interface RawUnifiedItem {
  typecode: number;
  data: Uint8Array;
}

/**
 * Splits a raw (unjumbled, padding-stripped) payload into TLV items and enforces the
 * structural ZIP 316 rules shared by UAs and UVKs (ordering, duplicates, bounds).
 */
function parseUnifiedItems(rawBytes: Uint8Array): RawUnifiedItem[] {
  const items: RawUnifiedItem[] = [];
  let offset = 0;
  let previousTypecode = -1;

  while (offset < rawBytes.length) {
    const tcInfo = decodeCompactSize(rawBytes, offset);
    offset += tcInfo.size;

    const lenInfo = decodeCompactSize(rawBytes, offset);
    offset += lenInfo.size;

    if (offset + lenInfo.value > rawBytes.length) {
      throw new Error("Malformed receiver TLV: data length exceeds payload bounds");
    }

    if (tcInfo.value === previousTypecode) {
      throw new Error(`Duplicate typecode 0x${tcInfo.value.toString(16).padStart(2, "0")}`);
    }
    if (tcInfo.value < previousTypecode) {
      throw new Error("Items are not in ascending typecode order");
    }
    previousTypecode = tcInfo.value;

    items.push({
      typecode: tcInfo.value,
      data: new Uint8Array(rawBytes.subarray(offset, offset + lenInfo.value)),
    });
    offset += lenInfo.value;
  }

  if (items.length === 0) {
    throw new Error("Payload contains no items");
  }

  return items;
}

const RECEIVER_RULES: Record<number, { name: ParsedReceiver["typeName"]; length: number }> = {
  0x00: { name: "P2PKH", length: 20 },
  0x01: { name: "P2SH", length: 20 },
  0x02: { name: "Sapling", length: 43 },
  0x03: { name: "Orchard", length: 43 },
};

/**
 * Parses receiver TLVs from a raw (unjumbled, padding-stripped) Unified Address payload.
 * Known receivers are length-checked; unknown non-metadata items are returned as "Unknown"
 * so the caller can ignore them, as ZIP 316 requires.
 */
export function parseReceiverTlvs(rawBytes: Uint8Array): ParsedReceiver[] {
  const items = parseUnifiedItems(rawBytes);

  return items.map((item) => {
    const rule = RECEIVER_RULES[item.typecode];
    if (rule) {
      if (item.data.length !== rule.length) {
        throw new Error(
          `Invalid ${rule.name} receiver length: expected ${rule.length} bytes, got ${item.data.length}`
        );
      }
      return { typecode: item.typecode, typeName: rule.name, data: item.data };
    }
    if (isMustUnderstandMetadata(item.typecode)) {
      throw new Error(
        `Unsupported MUST-understand metadata item 0x${item.typecode.toString(16)} (for example an address expiry)`
      );
    }
    return { typecode: item.typecode, typeName: "Unknown", data: item.data };
  });
}

interface DecodedUnified {
  hrp: string;
  rawItems: Uint8Array;
}

/**
 * Bech32m-decodes a ZIP 316 string, inverts F4Jumble and verifies the HRP padding.
 */
function decodeUnifiedPayload(encoded: string, allowedHrps: string[]): DecodedUnified {
  let decoded;
  try {
    decoded = bech32m.decode(encoded as `${string}1${string}`, false);
  } catch (err: unknown) {
    throw new Error(`Invalid Bech32m encoding: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!allowedHrps.includes(decoded.prefix)) {
    throw new Error(`Unrecognized HRP '${decoded.prefix}'. Expected one of: ${allowedHrps.join(", ")}.`);
  }

  const jumbled = bech32m.fromWords(decoded.words);
  if (jumbled.length < 38) {
    throw new Error("Payload too short (< 38 bytes).");
  }

  const unjumbled = f4jumbleInv(jumbled);
  const expectedPadding = getHrpPadding(decoded.prefix);
  const actualPadding = unjumbled.subarray(unjumbled.length - 16);
  for (let i = 0; i < 16; i++) {
    if (actualPadding[i] !== expectedPadding[i]) {
      throw new Error("HRP padding mismatch. The string is corrupted or forged.");
    }
  }

  return { hrp: decoded.prefix, rawItems: unjumbled.subarray(0, unjumbled.length - 16) };
}

function invalid(errorMessage: string, receivers: ParsedReceiver[] = []): Zip316InspectionResult {
  return {
    isValid: false,
    isShielded: false,
    hasTransparentReceiver: false,
    poolType: "INVALID",
    receivers,
    errorMessage,
  };
}

/**
 * Inspects a Zcash address and applies strict ZecClaim policy rules:
 * 1. Hard-reject transparent addresses (t1, t3, tm, t2).
 * 2. Hard-reject Unified Addresses containing transparent receivers (typecodes 0x00, 0x01).
 * 3. Accept legacy Sapling (zs1 / ztestsapling1, fully Bech32-decoded) with a warning.
 * 4. Pass Unified Addresses carrying an Orchard receiver (0x03), which Orchard and Ironwood share.
 */
export function inspectZcashAddress(
  address: string,
  expectedNetwork?: ZcashNetwork
): Zip316InspectionResult {
  const trimmed = address.trim();
  const addressNetwork = getAddressNetwork(trimmed);
  const network = addressNetwork === "unknown" ? undefined : addressNetwork;

  if (expectedNetwork && addressNetwork !== "unknown" && addressNetwork !== expectedNetwork) {
    return {
      ...invalid(
        `Address belongs to ${addressNetwork}, but campaign is locked to ${expectedNetwork}. Please use a valid ${expectedNetwork} shielded address.`
      ),
      network: addressNetwork,
    };
  }

  // Rule 1: transparent prefixes (mainnet & testnet)
  if (
    trimmed.startsWith("t1") ||
    trimmed.startsWith("t3") ||
    trimmed.startsWith("tm") ||
    trimmed.startsWith("t2")
  ) {
    return {
      isValid: false,
      isShielded: false,
      hasTransparentReceiver: true,
      poolType: "TRANSPARENT_REJECTED",
      receivers: [],
      network,
      errorMessage: TRANSPARENT_ERROR,
    };
  }

  // Rule 2: legacy Sapling payment address, fully decoded
  if (trimmed.startsWith("zs1") || trimmed.startsWith("ztestsapling1")) {
    let payload: Uint8Array;
    try {
      const decoded = bech32.decode(trimmed as `${string}1${string}`, false);
      const expectedHrp = trimmed.startsWith("zs1") ? "zs" : "ztestsapling";
      if (decoded.prefix !== expectedHrp) {
        return invalid("Unrecognized Sapling address prefix.");
      }
      payload = bech32.fromWords(decoded.words);
    } catch (err: unknown) {
      return invalid(
        `Invalid Sapling address (Bech32): ${err instanceof Error ? err.message : String(err)}`
      );
    }
    if (payload.length !== 43) {
      return invalid(
        `Invalid Sapling address: expected a 43-byte payload, got ${payload.length} bytes.`
      );
    }
    return {
      isValid: true,
      isShielded: true,
      hasTransparentReceiver: false,
      poolType: "SAPLING",
      receivers: [{ typecode: 0x02, typeName: "Sapling", data: payload }],
      network,
      warningMessage:
        "Legacy Sapling address detected. Supported, but modern Orchard/Ironwood Unified Addresses (u1...) are strongly recommended for post-NU7 privacy.",
    };
  }

  // Rule 3: Unified Address (Revision 0 "u"/"utest" and Revision 2 "zu"/"zutest")
  if (
    trimmed.startsWith("u1") ||
    trimmed.startsWith("utest1") ||
    trimmed.startsWith("zu1") ||
    trimmed.startsWith("zutest1")
  ) {
    let decoded: DecodedUnified;
    try {
      decoded = decodeUnifiedPayload(trimmed, ["u", "utest", "zu", "zutest"]);
    } catch (err: unknown) {
      return invalid(err instanceof Error ? err.message : String(err));
    }

    let receivers: ParsedReceiver[];
    try {
      receivers = parseReceiverTlvs(decoded.rawItems);
    } catch (err: unknown) {
      return invalid(
        `Failed to parse receiver TLVs: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (receivers.some((r) => r.typecode === 0x00 || r.typecode === 0x01)) {
      return {
        isValid: false,
        isShielded: false,
        hasTransparentReceiver: true,
        poolType: "TRANSPARENT_REJECTED",
        receivers,
        network,
        errorMessage:
          "Unified Address contains a transparent receiver (P2PKH/P2SH). Mixed transparent receivers are strictly prohibited to prevent privacy leakage.",
      };
    }

    if (receivers.some((r) => r.typecode === 0x03)) {
      return {
        isValid: true,
        isShielded: true,
        hasTransparentReceiver: false,
        poolType: "ORCHARD",
        receivers,
        network,
      };
    }

    if (receivers.some((r) => r.typecode === 0x02)) {
      return {
        isValid: true,
        isShielded: true,
        hasTransparentReceiver: false,
        poolType: "SAPLING",
        receivers,
        network,
        warningMessage:
          "Legacy Sapling-only Unified Address detected. Modern Orchard/Ironwood Unified Addresses are recommended for post-NU7 privacy.",
      };
    }

    return invalid(
      "Unified Address does not contain a supported shielded receiver (Orchard/Ironwood or Sapling).",
      receivers
    );
  }

  return invalid("Unrecognized address format. Expected a shielded Unified Address (u1... or utest1...).");
}

const UFVK_ITEM_RULES: Record<number, { name: string; length: number }> = {
  0x00: { name: "Transparent (P2PKH) FVK", length: 65 },
  0x02: { name: "Sapling FVK", length: 128 },
  0x03: { name: "Orchard FVK", length: 96 },
};

/**
 * Detects input that looks like spending material (seed phrase or spending key) so the
 * UI and API can refuse it before it is ever transmitted or stored.
 */
export function looksLikeSpendingSecret(input: string): boolean {
  const trimmed = input.trim();
  if (/^secret-extended-key-/i.test(trimmed)) return true;
  if (/^(usk|uskm|usktest)1/i.test(trimmed)) return true;
  const words = trimmed.split(/\s+/);
  return words.length >= 12 && words.length <= 24 && words.every((w) => /^[a-z]{3,8}$/.test(w));
}

/**
 * Structurally validates a Unified Full Viewing Key (ZIP 316):
 * Bech32m checksum, F4Jumble, HRP padding, TLV ordering, item lengths, and at least
 * one shielded (Sapling or Orchard) full viewing key.
 *
 * This proves the string is a well-formed UFVK. It does not (and cannot) prove that the
 * key controls the funding transaction; that requires scanning the chain with the key.
 */
export function inspectUnifiedViewingKey(
  ufvk: string,
  expectedNetwork?: ZcashNetwork
): UfvkInspectionResult {
  const trimmed = ufvk.trim();

  if (looksLikeSpendingSecret(trimmed)) {
    return {
      isValid: false,
      errorMessage:
        "This looks like a seed phrase or spending key. Never share it. ZecClaim only needs a read-only Unified Full Viewing Key (uview...).",
      items: [],
    };
  }

  if (/^uivk/.test(trimmed)) {
    return {
      isValid: false,
      errorMessage:
        "This is an incoming viewing key (uivk...). ZecClaim needs a Unified Full Viewing Key (uview...) so outgoing payouts can be audited.",
      items: [],
    };
  }

  let decoded: DecodedUnified;
  try {
    decoded = decodeUnifiedPayload(trimmed, ["uview", "uviewtest", "uvf", "uvftest"]);
  } catch (err: unknown) {
    return {
      isValid: false,
      errorMessage: `Invalid Unified Full Viewing Key: ${err instanceof Error ? err.message : String(err)}`,
      items: [],
    };
  }

  const network: ZcashNetwork = decoded.hrp.endsWith("test") ? "testnet" : "mainnet";
  if (expectedNetwork && network !== expectedNetwork) {
    return {
      isValid: false,
      network,
      errorMessage: `Viewing key belongs to ${network}, but the campaign is set to ${expectedNetwork}.`,
      items: [],
    };
  }

  let rawItems: RawUnifiedItem[];
  try {
    rawItems = parseUnifiedItems(decoded.rawItems);
  } catch (err: unknown) {
    return {
      isValid: false,
      network,
      errorMessage: `Invalid Unified Full Viewing Key: ${err instanceof Error ? err.message : String(err)}`,
      items: [],
    };
  }

  const items: UfvkInspectionResult["items"] = [];
  for (const item of rawItems) {
    const rule = UFVK_ITEM_RULES[item.typecode];
    if (rule) {
      if (item.data.length !== rule.length) {
        return {
          isValid: false,
          network,
          errorMessage: `Invalid ${rule.name}: expected ${rule.length} bytes, got ${item.data.length}.`,
          items,
        };
      }
      items.push({ typecode: item.typecode, name: rule.name });
    } else if (isMustUnderstandMetadata(item.typecode)) {
      return {
        isValid: false,
        network,
        errorMessage: `Unsupported MUST-understand metadata item 0x${item.typecode.toString(16)} in viewing key.`,
        items,
      };
    } else {
      items.push({ typecode: item.typecode, name: "Unknown / metadata (ignored)" });
    }
  }

  const hasShielded = items.some((i) => i.typecode === 0x02 || i.typecode === 0x03);
  if (!hasShielded) {
    return {
      isValid: false,
      network,
      errorMessage: "Viewing key has no shielded (Sapling or Orchard) component.",
      items,
    };
  }

  return { isValid: true, network, items };
}
