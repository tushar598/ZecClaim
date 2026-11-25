import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "crypto";
import { POST as createCampaign } from "@/app/api/campaigns/route";
import { POST as vouchers } from "@/app/api/vouchers/route";
import { GET as proof } from "@/app/api/proof/[campaignId]/route";
import { memoryStore } from "@/lib/db/store";
import { resetRateLimit } from "@/lib/security/rateLimit";
import { encodeUnifiedAddress } from "@/lib/zcash/zip316";
import { ADDRESS_TEST_VECTORS, DEMO_ACK_CODES, DEMO_ADMIN_SECRET, DEMO_CAMPAIGN_ID } from "@/lib/demo/constants";
import { req, restoreChain, txid, useFakeChain } from "../helpers/fakeChain";

delete process.env.MONGODB_URI;

const ufvk = encodeUnifiedAddress("uviewtest", [{ typecode: 0x03, data: new Uint8Array(96).fill(4) }]);
const recipient = ADDRESS_TEST_VECTORS.testnet.validShielded;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const ctx = (campaignId: string) => ({ params: Promise.resolve({ campaignId }) });

const FUNDING = txid(0xf00d);
const ANCHOR = 1_000;

/** Lane 1 campaign anchored at height 1000 on the fake chain, with two cards. */
async function lane1Campaign(expiry = 2_000) {
  const res = await createCampaign(
    req("/api/campaigns", {
      title: `Meetup ${Math.random()}`,
      lane: "OFFLINE_ZIP324",
      network: "testnet",
      ufvk,
      fundingTxid: FUNDING,
      totalFundedZat: 10_000_000,
      slotCount: 1,
      clawbackAddress: recipient,
      clawbackExpiryHeight: expiry,
    })
  );
  const created = await res.json();
  expect(res.status).toBe(201);
  const admin = { "x-admin-secret": created.adminSecret as string };
  const imported = await vouchers(
    req(
      "/api/vouchers",
      {
        campaignId: created.campaignId,
        cards: ["CARD-A", "CARD-B"].map((cardId) => ({
          cardId,
          amountZec: 0.01,
          feeBufferZat: 2000,
          claimToken: "https://example.invalid/card",
          ackHash: sha(`ACK-${cardId}`),
        })),
      },
      admin
    )
  );
  expect(imported.status).toBe(200);
  return { campaignId: created.campaignId as string, admin, created };
}

describe("Lane 1 gift cards (route level, fake lightwalletd)", () => {
  beforeEach(() => {
    memoryStore.clearAll();
    resetRateLimit();
    useFakeChain({
      tip: ANCHOR,
      txs: {
        [FUNDING]: { height: 990, shape: { ironwoodActions: 2 } },
        [txid(77)]: { height: 995, shape: { orchardActions: 2 } },
        [txid(0x5eef)]: { height: 1_005, shape: { ironwoodActions: 2 } },
        [txid(0x01d)]: { height: 900, shape: { ironwoodActions: 2 } },
        [txid(0xc1a)]: { height: 2_100, shape: { ironwoodActions: 2 } },
      },
    });
  });
  afterEach(() => restoreChain());

  it("anchors the campaign with the funding tx found on-chain and the tip as anchor height", async () => {
    const { campaignId } = await lane1Campaign();
    const campaign = await memoryStore.getCampaign(campaignId);
    expect(campaign?.fundingCheck?.status).toBe("MINED");
    expect(campaign?.fundingCheck?.height).toBe(990);
    expect(campaign?.anchorHeight).toBe(ANCHOR);
  });

  it("refuses an expiry height that has already passed on-chain", async () => {
    const res = await createCampaign(
      req("/api/campaigns", {
        title: "Late expiry",
        lane: "OFFLINE_ZIP324",
        network: "testnet",
        ufvk,
        fundingTxid: txid(77),
        totalFundedZat: 10_000_000,
        slotCount: 1,
        clawbackAddress: recipient,
        clawbackExpiryHeight: 999,
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/already passed/);
  });

  it("confirms an unclaimed card with its memo code (no simulated spend needed)", async () => {
    const { campaignId } = await lane1Campaign();
    const wrong = await vouchers(req("/api/vouchers", { campaignId, cardId: "CARD-A", ackCode: "ACK-WRONG" }));
    expect(wrong.status).toBe(403);
    const ok = await vouchers(req("/api/vouchers", { campaignId, cardId: "CARD-A", ackCode: "ACK-CARD-A" }));
    expect(ok.status).toBe(200);
    expect((await memoryStore.getVoucherCard(campaignId, "CARD-A"))?.state).toBe("ACK_CONFIRMED");
  });

  it("checks an optional sweep txid on-chain: unknown, pre-anchor and reused txids are refused", async () => {
    const { campaignId } = await lane1Campaign();
    const unknown = await vouchers(req("/api/vouchers", { campaignId, cardId: "CARD-A", ackCode: "ACK-CARD-A", sweepTxid: txid(0xbad) }));
    expect(unknown.status).toBe(422);
    const early = await vouchers(req("/api/vouchers", { campaignId, cardId: "CARD-A", ackCode: "ACK-CARD-A", sweepTxid: txid(0x01d) }));
    expect(early.status).toBe(422);
    expect((await early.json()).error).toMatch(/before this campaign was anchored/);

    const good = await vouchers(req("/api/vouchers", { campaignId, cardId: "CARD-A", ackCode: "ACK-CARD-A", sweepTxid: txid(0x5eef) }));
    const json = await good.json();
    expect(good.status).toBe(200);
    expect(json.sweepCheck.status).toBe("MINED");
    const card = await memoryStore.getVoucherCard(campaignId, "CARD-A");
    expect(card?.sweepTxid).toBe(txid(0x5eef));
    expect(card?.sweepCheck?.height).toBe(1_005);

    const reused = await vouchers(req("/api/vouchers", { campaignId, cardId: "CARD-B", ackCode: "ACK-CARD-B", sweepTxid: txid(0x5eef) }));
    expect(reused.status).toBe(409);
  });

  it("records disputes publicly, including on a card that was already confirmed", async () => {
    const { campaignId } = await lane1Campaign();
    await vouchers(req("/api/vouchers", { campaignId, cardId: "CARD-A", ackCode: "ACK-CARD-A" }));
    const onConfirmed = await vouchers(req("/api/vouchers", { campaignId, cardId: "CARD-A", details: "My slip was photographed and emptied" }));
    expect(onConfirmed.status).toBe(200);
    const a = await memoryStore.getVoucherCard(campaignId, "CARD-A");
    expect(a?.state).toBe("ACK_CONFIRMED");
    expect(a?.disputeReason).toMatch(/photographed/);

    const second = await vouchers(req("/api/vouchers", { campaignId, cardId: "CARD-A", details: "again" + "!".repeat(5) }));
    expect(second.status).toBe(409);

    const b = await vouchers(req("/api/vouchers", { campaignId, cardId: "CARD-B", details: "Wallet said already swept" }));
    expect(b.status).toBe(200);
    expect((await memoryStore.getVoucherCard(campaignId, "CARD-B"))?.state).toBe("DISPUTED");

    const page = await (await proof(req(`/api/proof/${campaignId}`), ctx(campaignId))).json();
    expect(page.vouchers.filter((v: { disputeReason: string | null }) => v.disputeReason).length).toBe(2);
  });

  it("opens clawback only after the expiry height and only with an on-chain clawback tx", async () => {
    const { campaignId, admin } = await lane1Campaign(1_500);
    const early = await vouchers(req("/api/vouchers", { campaignId, txid: txid(0xc1a) }, admin));
    expect(early.status).toBe(409);
    expect((await early.json()).error).toMatch(/Clawback opens at height 1500/);

    useFakeChain({ tip: 2_200, txs: { [txid(0xc1a)]: { height: 2_100, shape: { ironwoodActions: 2 } } } });
    const missing = await vouchers(req("/api/vouchers", { campaignId, txid: txid(0xdead) }, admin));
    expect(missing.status).toBe(422);

    const ok = await vouchers(req("/api/vouchers", { campaignId, txid: txid(0xc1a) }, admin));
    const json = await ok.json();
    expect(ok.status).toBe(200);
    expect(json.clawedBackCount).toBe(2);
    expect((await memoryStore.getVoucherCard(campaignId, "CARD-A"))?.clawbackTxid).toBe(txid(0xc1a));

    const late = await vouchers(req("/api/vouchers", { campaignId, cardId: "CARD-A", ackCode: "ACK-CARD-A" }));
    expect(late.status).toBe(409);
  });

  it("refuses clawback when the chain height cannot be checked (fails closed)", async () => {
    const { campaignId, admin } = await lane1Campaign();
    useFakeChain({ tip: 0, txs: {}, unreachable: true });
    const res = await vouchers(req("/api/vouchers", { campaignId, txid: txid(0xc1a) }, admin));
    expect(res.status).toBe(503);
  });

  it("labels demo clawbacks as simulated instead of checking the chain", async () => {
    const res = await vouchers(req("/api/vouchers", { campaignId: DEMO_CAMPAIGN_ID, txid: txid(1) }, { "x-admin-secret": DEMO_ADMIN_SECRET }));
    expect(res.status).toBe(200);
    const events = await memoryStore.getAuditEventsByCampaign(DEMO_CAMPAIGN_ID);
    expect(events.find((e) => e.eventType === "CLAWBACK_RECONCILED")?.details.simulated).toBe(true);
  });

  it("walks the documented demo path: confirm CARD-03 with its memo code, dispute CARD-05", async () => {
    const ack = await vouchers(req("/api/vouchers", { campaignId: DEMO_CAMPAIGN_ID, cardId: "CARD-03", ackCode: DEMO_ACK_CODES["CARD-03"] }));
    expect(ack.status).toBe(200);
    const dispute = await vouchers(req("/api/vouchers", { campaignId: DEMO_CAMPAIGN_ID, cardId: "CARD-05", details: "Already swept when scanned" }));
    expect(dispute.status).toBe(200);
  });
});
