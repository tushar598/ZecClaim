import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { POST as createCampaign } from "@/app/api/campaigns/route";
import { POST as validateClaim } from "@/app/api/claims/validate/route";
import { POST as vouchers } from "@/app/api/vouchers/route";
import { POST as importLuma } from "@/app/api/campaigns/[campaignId]/import-luma/route";
import { GET as proof } from "@/app/api/proof/[campaignId]/route";
import { memoryStore } from "@/lib/db/store";
import { getRepo } from "@/lib/db/repo";
import { resetRateLimit } from "@/lib/security/rateLimit";
import { encodeUnifiedAddress } from "@/lib/zcash/zip316";
import { estimateBatchFeeZat } from "@/lib/zcash/zip317";
import { cardPlanReserveZat, defaultSlotAmountZat } from "@/lib/campaign/budget";
import { ADDRESS_TEST_VECTORS } from "@/lib/demo/constants";

delete process.env.MONGODB_URI;

const req = (url: string, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${url}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (campaignId: string) => ({ params: Promise.resolve({ campaignId }) });
const ufvk = encodeUnifiedAddress("uviewtest", [{ typecode: 0x03, data: new Uint8Array(96).fill(7) }]);
const recipient = ADDRESS_TEST_VECTORS.testnet.validShielded;

function body(extra: Record<string, unknown>) {
  return {
    title: `Amounts ${Math.random()}`,
    network: "testnet",
    ufvk,
    fundingTxid: createHash("sha256").update(String(Math.random())).digest("hex"),
    totalFundedZat: 100_000_000,
    slotCount: 1,
    clawbackAddress: recipient,
    clawbackExpiryHeight: 4_700_000,
    ...extra,
  };
}

const card = (cardId: string, amountZec: number) => ({
  cardId,
  amountZec,
  feeBufferZat: 2000,
  claimToken: "https://example.invalid/card",
  ackHash: createHash("sha256").update(`ACK-${cardId}`).digest("hex"),
});

describe("Per-link and per-card amounts (route level)", () => {
  beforeEach(() => {
    memoryStore.clearAll();
    resetRateLimit();
  });

  it("anchors one amount per claim link and each link redeems its own amount", async () => {
    const amounts = [50_000_000, 25_000_000, 10_000_000];
    const res = await createCampaign(req("/api/campaigns", body({ lane: "ONLINE_BATCH", slotCount: 3, slotAmountsZat: amounts })));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.slotAmountZat).toBeNull();
    expect(json.tokens.map((t: { amountZat: number }) => t.amountZat)).toEqual(amounts);

    const slots = (await (await getRepo()).getSlots(json.campaignId)).sort((a, b) => a.slotIndex - b.slotIndex);
    expect(slots.map((s) => s.amountZat)).toEqual(amounts);

    const second = await (await validateClaim(req("/api/claims/validate", { token: json.tokens[1].token }))).json();
    expect(second.amountZat).toBe(25_000_000);
  });

  it("refuses per-link amounts that do not fit the pool with the batch fee", async () => {
    const res = await createCampaign(
      req("/api/campaigns", body({ lane: "ONLINE_BATCH", slotCount: 2, slotAmountsZat: [60_000_000, 40_000_000] }))
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/2 links totalling 1\.00000000 ZEC plus .* fees exceeds/);
    expect(estimateBatchFeeZat(2)).toBeGreaterThan(0);
  });

  it("validates the shape of the amount fields", async () => {
    const mismatch = await createCampaign(req("/api/campaigns", body({ lane: "ONLINE_BATCH", slotCount: 3, slotAmountsZat: [1_000, 2_000] })));
    expect(mismatch.status).toBe(400);
    const both = await createCampaign(
      req("/api/campaigns", body({ lane: "ONLINE_BATCH", slotCount: 1, slotAmountZat: 1_000, slotAmountsZat: [1_000] }))
    );
    expect(both.status).toBe(400);
    const planOnLinks = await createCampaign(req("/api/campaigns", body({ lane: "ONLINE_BATCH", cardPlanZat: [1_000_000] })));
    expect(planOnLinks.status).toBe(400);
  });

  it("holds gift-card imports to the anchored card plan", async () => {
    const res = await createCampaign(
      req("/api/campaigns", body({ lane: "OFFLINE_ZIP324", cardPlanZat: [50_000_000, 10_000_000, 10_000_000] }))
    );
    const created = await res.json();
    expect(res.status).toBe(201);
    expect(created.anchor.cardPlanZat).toEqual([50_000_000, 10_000_000, 10_000_000]);
    const admin = { "x-admin-secret": created.adminSecret as string };
    const campaignId = created.campaignId as string;

    // A card whose amount is not in the plan is refused, and nothing is registered.
    const wrong = await vouchers(req("/api/vouchers", { campaignId, cards: [card("C-1", 0.5), card("C-2", 0.2)] }, admin));
    expect(wrong.status).toBe(409);
    expect((await wrong.json()).error).toMatch(/C-2 \(0\.20000000 ZEC\) does not match the card plan/);
    expect(await (await getRepo()).getCards(campaignId)).toHaveLength(0);

    const ok = await vouchers(req("/api/vouchers", { campaignId, cards: [card("C-1", 0.5), card("C-2", 0.1)] }, admin));
    expect(ok.status).toBe(200);

    // The plan has one 0.1 ZEC card left, so a second extra 0.1 card is refused.
    const extra = await vouchers(req("/api/vouchers", { campaignId, cards: [card("C-3", 0.1), card("C-4", 0.1)] }, admin));
    expect(extra.status).toBe(409);
    expect((await extra.json()).remainingPlanZat).toEqual([10_000_000]);

    const page = await (await proof(req(`/api/proof/${campaignId}`), ctx(campaignId))).json();
    expect(page.cardPlan).toEqual({
      amountsZat: [50_000_000, 10_000_000, 10_000_000],
      totalZat: 70_000_000,
      registeredCount: 2,
      openZat: [10_000_000],
    });
  });

  it("refuses a card plan larger than the pool", async () => {
    const res = await createCampaign(req("/api/campaigns", body({ lane: "OFFLINE_ZIP324", cardPlanZat: [60_000_000, 40_000_000] })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/2 planned gift cards/);
  });

  it("splits Hybrid links over what the card plan leaves and keeps the plan reserved", async () => {
    const plan = [10_000_000, 5_000_000];
    const res = await createCampaign(req("/api/campaigns", body({ lane: "HYBRID", slotCount: 4, cardPlanZat: plan })));
    const created = await res.json();
    expect(res.status).toBe(201);
    const expected = defaultSlotAmountZat(100_000_000 - cardPlanReserveZat(plan), 4);
    expect(created.slotAmountZat).toBe(expected);
    // Without the plan the links would only split half of the pool.
    expect(expected).toBeGreaterThan(defaultSlotAmountZat(50_000_000, 4));

    // A recipient import with an explicit amount cannot spend the money reserved for the cards.
    const admin = { "x-admin-secret": created.adminSecret as string };
    const luma = await importLuma(
      req(`/api/campaigns/${created.campaignId}/import-luma`, { rows: [{ address: recipient, amountZat: 1_000_000 }] }, admin),
      ctx(created.campaignId)
    );
    expect(luma.status).toBe(409);
    expect((await luma.json()).error).toMatch(/reserved for planned gift cards/);
  });
});
