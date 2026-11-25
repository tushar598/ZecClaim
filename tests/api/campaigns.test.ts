import { describe, it, expect } from "vitest";
import { CreateCampaignSchema } from "@/lib/validators";
import { computeCampaignId } from "@/lib/security/tokens";
import { encodeUnifiedAddress } from "@/lib/zcash/zip316";
import { memoryStore } from "@/lib/db/store";
import { CampaignRecord } from "@/types";

describe("Campaign Creation & Trust Anchor Logic", () => {
  // Generate a cryptographically valid shielded Orchard Unified Address
  const validShieldedClawback = encodeUnifiedAddress("u", [
    { typecode: 0x03, data: new Uint8Array(43).fill(0xaa) },
  ]);
  // Structurally valid mainnet UFVK (one Orchard FVK item)
  const validUfvk = encodeUnifiedAddress("uview", [
    { typecode: 0x03, data: new Uint8Array(96).fill(0x42) },
  ]);

  it("validates valid campaign payload successfully", () => {
    const payload = {
      title: "Zcash India Meetup #4",
      description: "Community shielded onboarding",
      lane: "HYBRID",
      ufvk: validUfvk,
      fundingTxid: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      totalFundedZat: 50_000_000,
      slotCount: 20,
      clawbackAddress: validShieldedClawback,
      clawbackExpiryHeight: 3_300_000,
    };

    const parsed = CreateCampaignSchema.parse(payload);
    expect(parsed.title).toBe("Zcash India Meetup #4");
    expect(parsed.slotCount).toBe(20);
    expect(parsed.network).toBe("mainnet");
  });

  it("rejects a placeholder UFVK that is not a ZIP 316 viewing key", () => {
    const payload = {
      title: "Typo Campaign",
      lane: "ONLINE_BATCH",
      ufvk: "uview1testanchorufvk1234567890abcdef",
      fundingTxid: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      totalFundedZat: 50_000_000,
      slotCount: 2,
      clawbackAddress: validShieldedClawback,
      clawbackExpiryHeight: 3_300_000,
    };
    expect(() => CreateCampaignSchema.parse(payload)).toThrow(/Unified Full Viewing Key/);
  });

  it("rejects a non-hex funding txid", () => {
    const payload = {
      title: "Bad Txid Campaign",
      lane: "ONLINE_BATCH",
      ufvk: validUfvk,
      fundingTxid: "z".repeat(64),
      totalFundedZat: 50_000_000,
      slotCount: 2,
      clawbackAddress: validShieldedClawback,
      clawbackExpiryHeight: 3_300_000,
    };
    expect(() => CreateCampaignSchema.parse(payload)).toThrow(/hex/);
  });

  it("hard-rejects transparent clawback address (t1...)", () => {
    const payload = {
      title: "Invalid Campaign",
      lane: "ONLINE_BATCH",
      ufvk: validUfvk,
      fundingTxid: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      totalFundedZat: 50_000_000,
      slotCount: 20,
      clawbackAddress: "t1VpNsFMy4zdqQeWbYwB4iK8T6P6p",
      clawbackExpiryHeight: 3_300_000,
    };

    expect(() => CreateCampaignSchema.parse(payload)).toThrow();
  });

  it("hard-rejects any secret key fragment (#key=) in title or inputs", () => {
    const payload = {
      title: "Meetup #key=secretspendingkey",
      lane: "HYBRID",
      ufvk: validUfvk,
      fundingTxid: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      totalFundedZat: 50_000_000,
      slotCount: 20,
      clawbackAddress: validShieldedClawback,
      clawbackExpiryHeight: 3_300_000,
    };

    expect(() => CreateCampaignSchema.parse(payload)).toThrow(/secret/i);
  });

  it("computes deterministic campaignId and persists in memory store", async () => {
    const ufvk = "uview1campaignanchorforunittestingdeterminism";
    const fundingTxid = "11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff";
    const campaignId = computeCampaignId(ufvk, fundingTxid);

    const record: CampaignRecord = {
      campaignId,
      title: "Unit Test Campaign",
      lane: "ONLINE_BATCH",
      network: "mainnet",
      ufvk,
      fundingTxid,
      totalFundedZat: 10_000_000,
      slotCount: 5,
      clawbackAddress: validShieldedClawback,
      clawbackExpiryHeight: 3_250_000,
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await memoryStore.saveCampaign(record);
    const retrieved = await memoryStore.getCampaign(campaignId);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.campaignId).toBe(campaignId);
    expect(retrieved?.title).toBe("Unit Test Campaign");
  });

  it("retrieves pre-seeded demo campaign from memory store", async () => {
    const demo = await memoryStore.getCampaign("demo-nu7-campaign");
    expect(demo).not.toBeNull();
    expect(demo?.title).toBe("ZecClaim NU7 Mumbai Meetup Sandbox");
    expect(demo?.status).toBe("ACTIVE");
  });
});
