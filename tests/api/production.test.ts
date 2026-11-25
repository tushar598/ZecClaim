import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { POST as createCampaign, GET as listCampaigns } from "@/app/api/campaigns/route";
import { POST as verify } from "@/app/api/campaigns/[campaignId]/verify/route";
import { POST as reissue } from "@/app/api/campaigns/[campaignId]/links/route";
import { POST as validateClaim } from "@/app/api/claims/validate/route";
import { POST as submitClaim } from "@/app/api/claims/route";
import { POST as batch } from "@/app/api/batch/route";
import { POST as payout } from "@/app/api/batch/payout/route";
import { GET as tipRoute } from "@/app/api/chain/tip/route";
import { memoryStore } from "@/lib/db/store";
import { resetRateLimit } from "@/lib/security/rateLimit";
import { encodeUnifiedAddress } from "@/lib/zcash/zip316";
import { heightForTime, timeForHeight, clawbackTimeProblem } from "@/lib/chain/blockTime";
import { ADDRESS_TEST_VECTORS } from "@/lib/demo/constants";
import { req, restoreChain, txid, useFakeChain } from "../helpers/fakeChain";

delete process.env.MONGODB_URI;

let seed = 40;
const nextUfvk = () => encodeUnifiedAddress("uviewtest", [{ typecode: 0x03, data: new Uint8Array(96).fill(seed++) }]);
const recipient = ADDRESS_TEST_VECTORS.testnet.validShielded;
const ctx = (campaignId: string) => ({ params: Promise.resolve({ campaignId }) });

const TIP = 50_000;
const TIP_TIME = 1_800_000_000; // unix seconds of the tip block
const FUNDED = txid(0xb1);
const FUNDED_2 = txid(0xb2);
const TRANSPARENT_ONLY = txid(0xb3);
const MEMPOOL = txid(0xb4);
const PAYOUT = txid(0xc1);

const body = (overrides: Record<string, unknown> = {}) => ({
  title: "Production rules",
  lane: "ONLINE_BATCH",
  network: "testnet",
  ufvk: nextUfvk(),
  fundingTxid: FUNDED,
  totalFundedZat: 10_000_000,
  slotCount: 2,
  clawbackAddress: recipient,
  clawbackAt: new Date((TIP_TIME + 7 * 24 * 3600) * 1000).toISOString(),
  ...overrides,
});

describe("Production rules (route level, fake lightwalletd)", () => {
  beforeEach(() => {
    memoryStore.clearAll();
    resetRateLimit();
    useFakeChain({
      tip: TIP,
      tipTime: TIP_TIME,
      txs: {
        [FUNDED]: { height: 49_000, shape: { orchardActions: 2 } },
        [FUNDED_2]: { height: 49_001, shape: { orchardActions: 2 } },
        [TRANSPARENT_ONLY]: { height: 49_002, shape: { transparentInputs: 1, transparentOutputs: 2 } },
        [MEMPOOL]: { height: 0 },
        [PAYOUT]: { height: TIP, shape: { orchardActions: 3 } }, // not before the anchor height
      },
    });
  });
  afterEach(() => restoreChain());

  it("refuses a funding transaction that is not on-chain (no anchoring made-up txids)", async () => {
    const res = await createCampaign(req("/api/campaigns", body({ fundingTxid: txid(0xdead) })));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/not found on testnet/);
  });

  it("refuses a funding transaction with no shielded outputs", async () => {
    const res = await createCampaign(req("/api/campaigns", body({ fundingTxid: TRANSPARENT_ONLY })));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/no shielded outputs/);
  });

  it("accepts a funding transaction still in the mempool", async () => {
    const res = await createCampaign(req("/api/campaigns", body({ fundingTxid: MEMPOOL })));
    expect(res.status).toBe(201);
    expect((await res.json()).fundingCheck.status).toBe("MEMPOOL");
  });

  it("refuses to anchor when the node is unreachable (503) instead of skipping the check", async () => {
    useFakeChain({ tip: TIP, txs: {}, unreachable: true });
    const res = await createCampaign(req("/api/campaigns", body()));
    expect(res.status).toBe(503);
  });

  it("refuses a funding transaction already used by another campaign", async () => {
    expect((await createCampaign(req("/api/campaigns", body()))).status).toBe(201);
    const again = await createCampaign(req("/api/campaigns", body()));
    expect(again.status).toBe(409);
    expect((await again.json()).error).toMatch(/already anchors another campaign/);
  });

  it("turns a clawback date into a block height from the tip block's timestamp", async () => {
    const at = new Date((TIP_TIME + 24 * 3600) * 1000);
    const res = await createCampaign(req("/api/campaigns", body({ clawbackAt: at.toISOString() })));
    const json = await res.json();
    expect(res.status).toBe(201);
    // 1 day of 25 s blocks = 3456 blocks after the tip
    expect(json.anchor.clawbackExpiryHeight).toBe(TIP + 3456);
    expect(json.anchor.clawbackAt).toBe(at.toISOString());
    const stored = await memoryStore.getCampaign(json.campaignId);
    expect(stored?.clawbackExpiryHeight).toBe(TIP + 3456);
  });

  it("refuses a clawback date less than an hour away or in the past", async () => {
    const soon = new Date((TIP_TIME + 10 * 60) * 1000).toISOString();
    const res = await createCampaign(req("/api/campaigns", body({ clawbackAt: soon })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/at least one hour/);
  });

  it("does not list campaigns publicly", async () => {
    const res = await listCampaigns(req("/api/campaigns"));
    expect(res.status).toBe(400);
  });

  it("verifies the organizer secret and rejects a wrong one", async () => {
    const created = await (await createCampaign(req("/api/campaigns", body()))).json();
    const ok = await verify(req(`/api/campaigns/${created.campaignId}/verify`, {}, { "x-admin-secret": created.adminSecret }), ctx(created.campaignId));
    expect(ok.status).toBe(200);
    const bad = await verify(req(`/api/campaigns/${created.campaignId}/verify`, {}, { "x-admin-secret": "sec_wrong" }), ctx(created.campaignId));
    expect(bad.status).toBe(403);
    const none = await verify(req(`/api/campaigns/${created.campaignId}/verify`, {}), ctx(created.campaignId));
    expect(none.status).toBe(401);
  });

  it("reissues unused claim links: new link works, old link is revoked, used links are untouched", async () => {
    const created = await (await createCampaign(req("/api/campaigns", body()))).json();
    const admin = { "x-admin-secret": created.adminSecret as string };
    const [first, second] = created.tokens as { token: string }[];
    expect((await submitClaim(req("/api/claims", { token: first.token, address: recipient }))).status).toBe(200);

    const res = await reissue(req(`/api/campaigns/${created.campaignId}/links`, {}, admin), ctx(created.campaignId));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.reissued).toBe(1);
    expect(json.tokens[0].slotIndex).toBe(1);

    expect((await validateClaim(req("/api/claims/validate", { token: second.token }))).status).toBe(404);
    const fresh = await validateClaim(req("/api/claims/validate", { token: json.tokens[0].token }));
    expect(fresh.status).toBe(200);
    expect((await fresh.json()).isClaimable).toBe(true);
    // The link that already received an address still resolves.
    expect((await validateClaim(req("/api/claims/validate", { token: first.token }))).status).toBe(200);

    const unauth = await reissue(req(`/api/campaigns/${created.campaignId}/links`, {}), ctx(created.campaignId));
    expect(unauth.status).toBe(401);
  });

  it("shows the link holder their progress up to the on-chain payout", async () => {
    const created = await (await createCampaign(req("/api/campaigns", body({ slotCount: 1 })))).json();
    const admin = { "x-admin-secret": created.adminSecret as string };
    const token = created.tokens[0].token as string;

    await submitClaim(req("/api/claims", { token, address: recipient }));
    let status = await (await validateClaim(req("/api/claims/validate", { token }))).json();
    expect(status.status).toBe("SUBMITTED");
    expect(status.addressHint).toMatch(/^utest1hfsg\.\.\./);
    expect(status.payout).toBeNull();

    await batch(req("/api/batch", { campaignId: created.campaignId }, admin));
    expect((await payout(req("/api/batch/payout", { campaignId: created.campaignId, batchRun: 1, txids: [PAYOUT] }, admin))).status).toBe(200);

    status = await (await validateClaim(req("/api/claims/validate", { token }))).json();
    expect(status.status).toBe("BATCHED");
    expect(status.payout).toMatchObject({ txid: PAYOUT, status: "MINED", height: TIP });
    const text = JSON.stringify(status);
    expect(text).not.toContain(recipient);
    expect(text).not.toContain("tokenHash");
  });

  it("reports the tip block time with the tip height", async () => {
    const res = await tipRoute(req("/api/chain/tip?network=testnet"));
    const json = await res.json();
    expect(json.height).toBe(TIP);
    expect(json.timeMs).toBe(TIP_TIME * 1000);
  });
});

describe("block time conversions", () => {
  const tip = { height: 1000, timeMs: 1_000_000_000 };

  it("maps dates to heights at 25 s per block and back", () => {
    expect(heightForTime(tip, tip.timeMs + 25_000 * 10)).toBe(1010);
    expect(heightForTime(tip, tip.timeMs + 1)).toBe(1001);
    expect(timeForHeight(tip, 1010)).toBe(tip.timeMs + 250_000);
  });

  it("bounds the clawback window", () => {
    expect(clawbackTimeProblem(tip, tip.timeMs + 30 * 60_000)).toMatch(/one hour/);
    expect(clawbackTimeProblem(tip, tip.timeMs + 400 * 24 * 3600_000)).toMatch(/one year/);
    expect(clawbackTimeProblem(tip, tip.timeMs + 2 * 3600_000)).toBeNull();
  });
});

describe("in-memory store", () => {
  it("is one shared instance per process (route modules must see the same data)", async () => {
    const again = (await import("@/lib/db/store")).memoryStore;
    expect(again).toBe(memoryStore);
    expect(globalThis.zecclaimMemoryStore).toBe(memoryStore);
  });
});
