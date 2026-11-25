import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { POST as createCampaign } from "@/app/api/campaigns/route";
import { GET as getCampaign } from "@/app/api/campaigns/[campaignId]/route";
import { POST as validateClaim } from "@/app/api/claims/validate/route";
import { POST as submitClaim } from "@/app/api/claims/route";
import { POST as vouchers } from "@/app/api/vouchers/route";
import { POST as demoReset } from "@/app/api/demo/reset/route";
import { POST as scrub } from "@/app/api/scrub/route";
import { POST as batch } from "@/app/api/batch/route";
import { POST as payout } from "@/app/api/batch/payout/route";
import { POST as importLuma } from "@/app/api/campaigns/[campaignId]/import-luma/route";
import { memoryStore } from "@/lib/db/store";
import { resetRateLimit } from "@/lib/security/rateLimit";
import { encodeUnifiedAddress } from "@/lib/zcash/zip316";
import { estimateBatchFeeZat } from "@/lib/zcash/zip317";
import {
  ADDRESS_TEST_VECTORS,
  DEMO_ACK_CODES,
  DEMO_ADMIN_SECRET,
  DEMO_CAMPAIGN_ID,
  DEMO_CLAIM_TOKENS,
} from "@/lib/demo/constants";

delete process.env.MONGODB_URI;

const req = (url: string, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${url}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const ctx = (campaignId: string) => ({ params: Promise.resolve({ campaignId }) });
const demoAdmin = { "x-admin-secret": DEMO_ADMIN_SECRET };
const testnetUfvk = encodeUnifiedAddress("uviewtest", [{ typecode: 0x03, data: new Uint8Array(96).fill(9) }]);
const recipient = ADDRESS_TEST_VECTORS.testnet.validShielded;

async function createRealCampaign(lane: "OFFLINE_ZIP324" | "ONLINE_BATCH" | "HYBRID", slotCount = 2, funded = 50_000_000) {
  const res = await createCampaign(
    req("/api/campaigns", {
      title: `Real ${lane} ${Math.random()}`,
      lane,
      network: "testnet",
      ufvk: testnetUfvk,
      fundingTxid: createHash("sha256").update(String(Math.random())).digest("hex"),
      totalFundedZat: funded,
      slotCount,
      clawbackAddress: recipient,
      clawbackExpiryHeight: 4_700_000,
    })
  );
  const json = await res.json();
  expect(res.status).toBe(201);
  return json as { campaignId: string; adminSecret: string; slotAmountZat: number; tokens: { token: string }[] };
}

describe("Security and integrity hardening (route level)", () => {
  beforeEach(() => {
    memoryStore.clearAll();
    resetRateLimit();
  });

  it("resolves the documented demo claim link token", async () => {
    const res = await validateClaim(req("/api/claims/validate", { token: DEMO_CLAIM_TOKENS.slot2 }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.isClaimable).toBe(true);
    expect(json.campaignId).toBe(DEMO_CAMPAIGN_ID);
  });

  it("never exposes ACK hashes, admin hashes, token hashes or addresses publicly", async () => {
    const res = await getCampaign(req(`/api/campaigns/${DEMO_CAMPAIGN_ID}`), ctx(DEMO_CAMPAIGN_ID));
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain("ackCodeHash");
    expect(text).not.toContain("adminSecretHash");
    expect(text).not.toContain("tokenHash");
    // The clawback address is public by design; recipient addresses in slots are not.
    const json = JSON.parse(text);
    expect(JSON.stringify(json.slots)).not.toContain(recipient);
    expect(json.slots.list.every((s: Record<string, unknown>) => !("recipientAddress" in s))).toBe(true);
  });

  it("has no spend-simulation path: a card only changes state through its memo code", async () => {
    const { campaignId, adminSecret } = await createRealCampaign("OFFLINE_ZIP324");
    await vouchers(
      req(
        "/api/vouchers",
        {
          campaignId,
          cards: [{ cardId: "CARD-01", amountZec: 0.01, feeBufferZat: 2000, claimToken: "https://x.example/c", ackHash: "a".repeat(64) }],
        },
        { "x-admin-secret": adminSecret }
      )
    );
    const res = await vouchers(
      req("/api/vouchers", { campaignId, cardId: "CARD-01", simulateCardSweep: true }, { "x-admin-secret": adminSecret })
    );
    expect(res.status).toBe(400);
    const card = await memoryStore.getVoucherCard(campaignId, "CARD-01");
    expect(card?.state).toBe("UNCLAIMED");
  });

  it("lets the real recipient confirm a card a stranger disputed, keeping the dispute on record", async () => {
    const dispute = await vouchers(
      req("/api/vouchers", { campaignId: DEMO_CAMPAIGN_ID, cardId: "CARD-02", details: "griefing attempt" })
    );
    expect(dispute.status).toBe(200);

    const ack = await vouchers(
      req("/api/vouchers", { campaignId: DEMO_CAMPAIGN_ID, cardId: "CARD-02", ackCode: DEMO_ACK_CODES["CARD-02"] })
    );
    expect(ack.status).toBe(200);
    const card = await memoryStore.getVoucherCard(DEMO_CAMPAIGN_ID, "CARD-02");
    expect(card?.state).toBe("ACK_CONFIRMED");
    expect(card?.disputeReason).toBe("griefing attempt");
  });

  it("does not reset rate limits through the public demo reset endpoint", async () => {
    const ip = { "x-forwarded-for": "203.0.113.7" };
    for (let i = 0; i < 20; i++) {
      await vouchers(req("/api/vouchers", { campaignId: DEMO_CAMPAIGN_ID, cardId: `CARD-0${(i % 5) + 1}`, ackCode: `ACK-GUESS${i}` }, ip));
    }
    await demoReset(req("/api/demo/reset", {}));
    const after = await vouchers(req("/api/vouchers", { campaignId: DEMO_CAMPAIGN_ID, cardId: "CARD-03", ackCode: "ACK-GUESSX" }, ip));
    expect(after.status).toBe(429);
  });

  it("limits ACK guesses per card even across different IPs", async () => {
    let limited = 0;
    for (let i = 0; i < 12; i++) {
      const res = await vouchers(
        req("/api/vouchers", { campaignId: DEMO_CAMPAIGN_ID, cardId: "CARD-02", ackCode: `ACK-WRONG${i}` }, { "x-forwarded-for": `198.51.100.${i}` })
      );
      if (res.status === 429) limited++;
    }
    expect(limited).toBeGreaterThan(0);
  });

  it("refuses to scrub unpaid recipients unless forced, and leaves unclaimed links alone", async () => {
    const blocked = await scrub(req("/api/scrub", { campaignId: DEMO_CAMPAIGN_ID }, demoAdmin));
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).code).toBe("UNPAID_RECIPIENTS");

    // Exporting is not paying: still blocked until a payout txid is recorded.
    await batch(req("/api/batch", { campaignId: DEMO_CAMPAIGN_ID }, demoAdmin));
    expect((await scrub(req("/api/scrub", { campaignId: DEMO_CAMPAIGN_ID }, demoAdmin))).status).toBe(409);
    const recorded = await payout(req("/api/batch/payout", { campaignId: DEMO_CAMPAIGN_ID, batchRun: 2, txids: ["ab".repeat(32)] }, demoAdmin));
    expect(recorded.status).toBe(200);

    const ok = await scrub(req("/api/scrub", { campaignId: DEMO_CAMPAIGN_ID }, demoAdmin));
    const json = await ok.json();
    expect(ok.status).toBe(200);
    expect(json.addressesPurgedCount).toBe(1);

    const slots = await memoryStore.getClaimSlotsByCampaign(DEMO_CAMPAIGN_ID);
    expect(slots.filter((s) => s.status === "UNCLAIMED").length).toBe(3);
    expect(slots.some((s) => s.recipientAddress === recipient)).toBe(false);
  });

  it("re-exports only the latest batch run and never re-includes an earlier run", async () => {
    // The demo already has a paid run 1, so the next run is 2.
    const first = await (await batch(req("/api/batch", { campaignId: DEMO_CAMPAIGN_ID }, demoAdmin))).json();
    expect(first.batchRun).toBe(2);
    expect(first.totalRecipients).toBe(1);
    expect(first.isReexport).toBe(false);

    const again = await (await batch(req("/api/batch", { campaignId: DEMO_CAMPAIGN_ID }, demoAdmin))).json();
    expect(again.success).toBe(true);
    expect(again.isReexport).toBe(true);
    expect(again.batchRun).toBe(2);
    expect(again.zingoScript).toBe(first.zingoScript);

    const claim = await submitClaim(req("/api/claims", { token: DEMO_CLAIM_TOKENS.slot4, address: recipient }));
    expect(claim.status).toBe(200);
    const second = await (await batch(req("/api/batch", { campaignId: DEMO_CAMPAIGN_ID }, demoAdmin))).json();
    expect(second.batchRun).toBe(3);
    expect(second.totalRecipients).toBe(1);
  });

  it("reserves ZIP 2009 batch fees when splitting the campaign budget into claim links", async () => {
    const { slotAmountZat } = await createRealCampaign("ONLINE_BATCH", 5, 100_000_000);
    expect(slotAmountZat * 5 + estimateBatchFeeZat(5)).toBeLessThanOrEqual(100_000_000);
  });

  it("rejects duplicate voucher card IDs instead of resetting their state", async () => {
    const res = await vouchers(
      req(
        "/api/vouchers",
        {
          campaignId: DEMO_CAMPAIGN_ID,
          cards: [{ cardId: "CARD-01", amountZec: 0.01, feeBufferZat: 2000, claimToken: "https://x.example/c", ackHash: "a".repeat(64) }],
        },
        demoAdmin
      )
    );
    expect(res.status).toBe(409);
    const card = await memoryStore.getVoucherCard(DEMO_CAMPAIGN_ID, "CARD-01");
    expect(card?.state).toBe("ACK_CONFIRMED");
  });

  it("rejects voucher and Luma imports that over-allocate the funding", async () => {
    const overVouchers = await vouchers(
      req(
        "/api/vouchers",
        {
          campaignId: DEMO_CAMPAIGN_ID,
          cards: [{ cardId: "CARD-99", amountZec: 5, feeBufferZat: 2000, claimToken: "https://x.example/c", ackHash: "a".repeat(64) }],
        },
        demoAdmin
      )
    );
    expect(overVouchers.status).toBe(409);

    const { campaignId, adminSecret } = await createRealCampaign("ONLINE_BATCH", 2, 10_000_000);
    const overLuma = await importLuma(
      req(`/api/campaigns/${campaignId}/import-luma`, { rows: [{ address: recipient }] }, { "x-admin-secret": adminSecret }),
      ctx(campaignId)
    );
    expect(overLuma.status).toBe(409);
  });
});
