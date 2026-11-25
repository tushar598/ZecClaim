import { describe, it, expect } from "vitest";
import {
  inspectZcashAddress,
  inspectUnifiedViewingKey,
  looksLikeSpendingSecret,
  f4jumble,
  f4jumbleInv,
  encodeUnifiedAddress,
  encodeSaplingAddress,
} from "@/lib/zcash/zip316";
import { ADDRESS_TEST_VECTORS } from "@/lib/demo/constants";

const bytes = (n: number, fill: number) => new Uint8Array(n).fill(fill);

describe("ZIP 316 Preflight Address Validator & F4Jumble", () => {
  it("executes F4Jumble roundtrip encoding & decoding", () => {
    // 64-byte message
    const msg = new Uint8Array(64);
    for (let i = 0; i < 64; i++) msg[i] = i * 3 + 1;

    const jumbled = f4jumble(msg);
    expect(jumbled.length).toBe(64);
    expect(jumbled).not.toEqual(msg);

    const unjumbled = f4jumbleInv(jumbled);
    expect(unjumbled).toEqual(msg);
  });

  it("throws on F4Jumble message shorter than 38 bytes", () => {
    const shortMsg = new Uint8Array(37);
    expect(() => f4jumble(shortMsg)).toThrow(/out of range/);
  });

  it("hard-rejects transparent t1... addresses", () => {
    const result = inspectZcashAddress("t1abc1234567890abcdef1234567890abcdef12");
    expect(result.isValid).toBe(false);
    expect(result.isShielded).toBe(false);
    expect(result.hasTransparentReceiver).toBe(true);
    expect(result.poolType).toBe("TRANSPARENT_REJECTED");
    expect(result.errorMessage).toContain("Transparent addresses (t1...) are not supported");
  });

  it("hard-rejects transparent t3... addresses", () => {
    const result = inspectZcashAddress("t3abc1234567890abcdef1234567890abcdef12");
    expect(result.isValid).toBe(false);
    expect(result.isShielded).toBe(false);
    expect(result.poolType).toBe("TRANSPARENT_REJECTED");
  });

  it("hard-rejects testnet transparent tm... and t2... addresses", () => {
    const resTm = inspectZcashAddress("tmabc1234567890abcdef1234567890abcdef12");
    expect(resTm.isValid).toBe(false);
    expect(resTm.poolType).toBe("TRANSPARENT_REJECTED");

    const resT2 = inspectZcashAddress("t2abc1234567890abcdef1234567890abcdef12");
    expect(resT2.isValid).toBe(false);
    expect(resT2.poolType).toBe("TRANSPARENT_REJECTED");
  });

  it("warns on legacy Sapling zs1... addresses", () => {
    const result = inspectZcashAddress(encodeSaplingAddress("mainnet", bytes(43, 0x5a)));
    expect(result.isValid).toBe(true);
    expect(result.isShielded).toBe(true);
    expect(result.poolType).toBe("SAPLING");
    expect(result.warningMessage).toContain("Legacy Sapling address detected");
  });

  it("warns on testnet Sapling ztestsapling1... addresses", () => {
    const result = inspectZcashAddress(encodeSaplingAddress("testnet", bytes(43, 0x5b)));
    expect(result.isValid).toBe(true);
    expect(result.isShielded).toBe(true);
    expect(result.poolType).toBe("SAPLING");
    expect(result.warningMessage).toContain("Legacy Sapling address detected");
  });

  it("validates modern Orchard Unified Address on Mainnet (u1...)", () => {
    const orchardReceiver = {
      typecode: 0x03,
      data: new Uint8Array(43).fill(0xaa),
    };
    const validUa = encodeUnifiedAddress("u", [orchardReceiver]);
    expect(validUa.startsWith("u1")).toBe(true);

    const result = inspectZcashAddress(validUa);
    expect(result.isValid).toBe(true);
    expect(result.isShielded).toBe(true);
    expect(result.poolType).toBe("ORCHARD");
    expect(result.hasTransparentReceiver).toBe(false);
    expect(result.receivers.length).toBe(1);
    expect(result.receivers[0].typecode).toBe(0x03);
    expect(result.receivers[0].typeName).toBe("Orchard");
  });

  it("validates modern Orchard Unified Address on Testnet (utest1...)", () => {
    const orchardReceiver = {
      typecode: 0x03,
      data: new Uint8Array(43).fill(0xbb),
    };
    const validTestUa = encodeUnifiedAddress("utest", [orchardReceiver]);
    expect(validTestUa.startsWith("utest1")).toBe(true);

    const result = inspectZcashAddress(validTestUa);
    expect(result.isValid).toBe(true);
    expect(result.isShielded).toBe(true);
    expect(result.poolType).toBe("ORCHARD");
    expect(result.hasTransparentReceiver).toBe(false);
  });

  it("HARD-REJECTS mixed UA bundling transparent P2PKH receiver (0x00) with Orchard", () => {
    const p2pkhReceiver = {
      typecode: 0x00,
      data: new Uint8Array(20).fill(0x11),
    };
    const orchardReceiver = {
      typecode: 0x03,
      data: new Uint8Array(43).fill(0x22),
    };
    const mixedUa = encodeUnifiedAddress("u", [p2pkhReceiver, orchardReceiver]);

    const result = inspectZcashAddress(mixedUa);
    expect(result.isValid).toBe(false);
    expect(result.isShielded).toBe(false);
    expect(result.hasTransparentReceiver).toBe(true);
    expect(result.poolType).toBe("TRANSPARENT_REJECTED");
    expect(result.errorMessage).toContain("transparent receiver");
  });

  it("HARD-REJECTS mixed UA bundling transparent P2SH receiver (0x01) with Orchard", () => {
    const p2shReceiver = {
      typecode: 0x01,
      data: new Uint8Array(20).fill(0x33),
    };
    const orchardReceiver = {
      typecode: 0x03,
      data: new Uint8Array(43).fill(0x44),
    };
    const mixedUa = encodeUnifiedAddress("u", [p2shReceiver, orchardReceiver]);

    const result = inspectZcashAddress(mixedUa);
    expect(result.isValid).toBe(false);
    expect(result.hasTransparentReceiver).toBe(true);
    expect(result.poolType).toBe("TRANSPARENT_REJECTED");
  });

  it("warns on Sapling-only Unified Address", () => {
    const saplingReceiver = {
      typecode: 0x02,
      data: new Uint8Array(43).fill(0x55),
    };
    const saplingUa = encodeUnifiedAddress("u", [saplingReceiver]);

    const result = inspectZcashAddress(saplingUa);
    expect(result.isValid).toBe(true);
    expect(result.isShielded).toBe(true);
    expect(result.poolType).toBe("SAPLING");
    expect(result.warningMessage).toContain("Legacy Sapling-only");
  });

  it("rejects address with invalid Bech32m checksum", () => {
    const orchardReceiver = {
      typecode: 0x03,
      data: new Uint8Array(43).fill(0xaa),
    };
    const validUa = encodeUnifiedAddress("u", [orchardReceiver]);
    // Tamper with last character
    const tampered = validUa.slice(0, -1) + (validUa.slice(-1) === "p" ? "q" : "p");

    const result = inspectZcashAddress(tampered);
    expect(result.isValid).toBe(false);
    expect(result.poolType).toBe("INVALID");
    expect(result.errorMessage).toContain("Invalid Bech32m");
  });

  it("rejects Unified Address with truncated receiver length", () => {
    // Corrupted Orchard receiver of only 25 bytes instead of 43 (total payload: 25+1+1+16 = 43 >= 38)
    const corruptedReceiver = {
      typecode: 0x03,
      data: new Uint8Array(25).fill(0xaa),
    };
    const corruptedUa = encodeUnifiedAddress("u", [corruptedReceiver]);

    const result = inspectZcashAddress(corruptedUa);
    expect(result.isValid).toBe(false);
    expect(result.poolType).toBe("INVALID");
    expect(result.errorMessage).toContain("Failed to parse receiver TLVs");
  });

  it("enforces expectedNetwork matching", () => {
    const orchardReceiver = {
      typecode: 0x03,
      data: new Uint8Array(43).fill(0x77),
    };
    const mainnetUa = encodeUnifiedAddress("u", [orchardReceiver]);
    const testnetUa = encodeUnifiedAddress("utest", [orchardReceiver]);

    // Test matching network
    const mainMatch = inspectZcashAddress(mainnetUa, "mainnet");
    expect(mainMatch.isValid).toBe(true);
    expect(mainMatch.network).toBe("mainnet");

    const testMatch = inspectZcashAddress(testnetUa, "testnet");
    expect(testMatch.isValid).toBe(true);
    expect(testMatch.network).toBe("testnet");

    // Test cross-network rejection
    const mainOnTest = inspectZcashAddress(mainnetUa, "testnet");
    expect(mainOnTest.isValid).toBe(false);
    expect(mainOnTest.errorMessage).toContain("Address belongs to mainnet, but campaign is locked to testnet");

    const testOnMain = inspectZcashAddress(testnetUa, "mainnet");
    expect(testOnMain.isValid).toBe(false);
    expect(testOnMain.errorMessage).toContain("Address belongs to testnet, but campaign is locked to mainnet");
  });

  it("rejects Sapling strings that are not valid Bech32 payment addresses", () => {
    expect(inspectZcashAddress("zs1thisisnotarealaddressatall").isValid).toBe(false);
    // Valid checksum but wrong payload length
    const shortPayload = encodeSaplingAddress("mainnet", bytes(43, 1)).slice(0, -8);
    expect(inspectZcashAddress(shortPayload).isValid).toBe(false);
  });

  it("accepts the real address test vectors used by the judge sandbox", () => {
    expect(inspectZcashAddress(ADDRESS_TEST_VECTORS.testnet.validShielded, "testnet").poolType).toBe("ORCHARD");
    expect(inspectZcashAddress(ADDRESS_TEST_VECTORS.mainnet.validShielded, "mainnet").poolType).toBe("ORCHARD");
    expect(inspectZcashAddress(ADDRESS_TEST_VECTORS.testnet.rejectedMixed).poolType).toBe("TRANSPARENT_REJECTED");
    expect(inspectZcashAddress(ADDRESS_TEST_VECTORS.mainnet.rejectedMixed).poolType).toBe("TRANSPARENT_REJECTED");
  });

  it("does not treat the unassigned typecode 0x04 as a shielded receiver", () => {
    const only04 = encodeUnifiedAddress("u", [{ typecode: 0x04, data: bytes(43, 7) }]);
    const result = inspectZcashAddress(only04);
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain("does not contain a supported shielded receiver");

    // Unknown items next to Orchard are ignored, as ZIP 316 requires
    const withUnknown = encodeUnifiedAddress("u", [
      { typecode: 0x03, data: bytes(43, 1) },
      { typecode: 0x04, data: bytes(10, 2) },
    ]);
    expect(inspectZcashAddress(withUnknown).poolType).toBe("ORCHARD");
  });

  it("rejects duplicate and out-of-order typecodes (ZIP 316 consumer rules)", () => {
    const duplicate = encodeUnifiedAddress("u", [
      { typecode: 0x03, data: bytes(43, 1) },
      { typecode: 0x03, data: bytes(43, 2) },
    ]);
    expect(inspectZcashAddress(duplicate).errorMessage).toContain("Duplicate typecode");

    const unordered = encodeUnifiedAddress("u", [
      { typecode: 0x03, data: bytes(43, 1) },
      { typecode: 0x02, data: bytes(43, 2) },
    ]);
    expect(inspectZcashAddress(unordered).errorMessage).toContain("ascending typecode order");
  });

  it("rejects unsupported MUST-understand metadata such as address expiry", () => {
    const withExpiry = encodeUnifiedAddress("u", [
      { typecode: 0x03, data: bytes(43, 1) },
      { typecode: 0xe0, data: bytes(4, 0) },
    ]);
    const result = inspectZcashAddress(withExpiry);
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toContain("MUST-understand");
  });
});

describe("ZIP 316 Unified Full Viewing Key validation (campaign trust anchor)", () => {
  const orchardFvk = { typecode: 0x03, data: bytes(96, 0x42) };

  it("accepts well-formed mainnet and testnet UFVKs and reports their network", () => {
    const main = inspectUnifiedViewingKey(encodeUnifiedAddress("uview", [orchardFvk]));
    expect(main.isValid).toBe(true);
    expect(main.network).toBe("mainnet");

    const test = inspectUnifiedViewingKey(encodeUnifiedAddress("uviewtest", [orchardFvk]), "testnet");
    expect(test.isValid).toBe(true);
    expect(test.network).toBe("testnet");
  });

  it("rejects placeholder strings, wrong networks, wrong item lengths and UIVKs", () => {
    expect(inspectUnifiedViewingKey("uview1testanchorufvk1234567890abcdef").isValid).toBe(false);
    expect(
      inspectUnifiedViewingKey(encodeUnifiedAddress("uview", [orchardFvk]), "testnet").errorMessage
    ).toContain("belongs to mainnet");
    expect(
      inspectUnifiedViewingKey(encodeUnifiedAddress("uview", [{ typecode: 0x03, data: bytes(43, 1) }])).errorMessage
    ).toContain("expected 96 bytes");
    expect(inspectUnifiedViewingKey("uivk1qqqqqqqq").errorMessage).toContain("incoming viewing key");
  });

  it("refuses seed phrases and spending keys", () => {
    const phrase = "abandon ability able about above absent absorb abstract absurd abuse access accident";
    expect(looksLikeSpendingSecret(phrase)).toBe(true);
    expect(inspectUnifiedViewingKey(phrase).errorMessage).toContain("seed phrase or spending key");
    expect(looksLikeSpendingSecret("secret-extended-key-main1qqqq")).toBe(true);
    expect(looksLikeSpendingSecret(encodeUnifiedAddress("uview", [orchardFvk]))).toBe(false);
  });
});
