import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as vouchersPost } from "@/app/api/vouchers/route";
import { POST as resetPost } from "@/app/api/demo/reset/route";
import { memoryStore } from "@/lib/db/store";
import { DEMO_ACK_CODES } from "@/lib/security/tokens";
import { resetRateLimit } from "@/lib/security/rateLimit";

describe("Phase 5 Hardening & Sandbox Verification", () => {
  const campaignId = "demo-nu7-campaign";

  beforeEach(() => {
    memoryStore.clearAll();
    resetRateLimit();
  });

  it("POST /api/demo/reset restores clean demo fixtures", async () => {
    // 1. Mutate CARD-03 state
    await memoryStore.updateVoucherCard(campaignId, "CARD-03", {
      state: "DISPUTED",
      disputeReason: "Test corruption",
    });

    const mutated = await memoryStore.getVoucherCard(campaignId, "CARD-03");
    expect(mutated?.state).toBe("DISPUTED");

    // 2. Invoke reset
    const req = new NextRequest("http://localhost:3000/api/demo/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId }),
    });

    const res = await resetPost(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    // 3. Verify CARD-03 restored to UNCLAIMED
    const restored = await memoryStore.getVoucherCard(campaignId, "CARD-03");
    expect(restored?.state).toBe("UNCLAIMED");
  });

  it("POST /api/demo/reset rejects reset for non-demo campaigns", async () => {
    const realCampaignId = "real-production-campaign-123";
    await memoryStore.saveCampaign({
      campaignId: realCampaignId,
      title: "Real Production Campaign",
      lane: "OFFLINE_ZIP324",
      network: "mainnet",
      ufvk: "uview1realproductionanchor9876543210zyxwvutsrqponmlkjihgfedcba",
      fundingTxid: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      totalFundedZat: 100_000_000,
      slotCount: 5,
      clawbackAddress: "u1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
      clawbackExpiryHeight: 3_500_000,
      isDemo: false,
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = new NextRequest("http://localhost:3000/api/demo/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: realCampaignId }),
    });

    const res = await resetPost(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/Only demo sandbox campaigns can be reset/i);
  });

  it("keeps a confirmed card confirmed when it is later disputed, and records the dispute", async () => {
    // CARD-01 is pre-seeded as ACK_CONFIRMED
    const req = new NextRequest("http://localhost:3000/api/vouchers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId,
        cardId: "CARD-01",
        details: "Attempting dispute on already confirmed receipt",
      }),
    });

    const res = await vouchersPost(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.state).toBe("ACK_CONFIRMED");
    const card = await memoryStore.getVoucherCard(campaignId, "CARD-01");
    expect(card?.disputeReason).toMatch(/already confirmed receipt/);
  });

  it("verifies the 8-character ACK code (ACK-9M3X8W1V) on unclaimed CARD-02", async () => {
    const valid8CharAck = DEMO_ACK_CODES["CARD-02"];
    expect(valid8CharAck).toBe("ACK-9M3X8W1V");

    const req = new NextRequest("http://localhost:3000/api/vouchers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId,
        cardId: "CARD-02",
        ackCode: valid8CharAck,
      }),
    });

    const res = await vouchersPost(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.state).toBe("ACK_CONFIRMED");

    const card = await memoryStore.getVoucherCard(campaignId, "CARD-02");
    expect(card?.state).toBe("ACK_CONFIRMED");
  });

  it("triggers rate limit on rapid repeated ACK submissions", async () => {
    const testIp = "192.168.1.100";

    // Issue 20 requests (within limit)
    for (let i = 0; i < 20; i++) {
      const req = new NextRequest("http://localhost:3000/api/vouchers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": testIp,
        },
        body: JSON.stringify({
          campaignId,
          cardId: "CARD-03",
          ackCode: "ACK-WRONG-CODE",
        }),
      });
      await vouchersPost(req);
    }

    // 21st request should be rate limited (429)
    const rateLimitedReq = new NextRequest("http://localhost:3000/api/vouchers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": testIp,
      },
      body: JSON.stringify({
        campaignId,
        cardId: "CARD-03",
        ackCode: "ACK-WRONG-CODE",
      }),
    });

    const res = await vouchersPost(rateLimitedReq);
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toMatch(/Too many ACK attempts/i);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});
