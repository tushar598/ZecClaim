import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { POST as createCampaign } from "@/app/api/campaigns/route";
import { GET as getCampaign } from "@/app/api/campaigns/[campaignId]/route";
import { POST as listAddresses } from "@/app/api/campaigns/[campaignId]/addresses/route";
import { POST as submitClaim } from "@/app/api/claims/route";
import { POST as batch } from "@/app/api/batch/route";
import { POST as payout } from "@/app/api/batch/payout/route";
import { POST as scrub } from "@/app/api/scrub/route";
import { GET as proof } from "@/app/api/proof/[campaignId]/route";
import { memoryStore } from "@/lib/db/store";
import { resetRateLimit } from "@/lib/security/rateLimit";
import { encodeUnifiedAddress } from "@/lib/zcash/zip316";
import { ADDRESS_TEST_VECTORS, DEMO_ADMIN_SECRET, DEMO_CAMPAIGN_ID } from "@/lib/demo/constants";
import { req, restoreChain, txid, useFakeChain } from "../helpers/fakeChain";

delete process.env.MONGODB_URI;

let ufvkSeed = 1;
/** Fresh UFVK per campaign: the campaign ID is derived from (UFVK, funding txid). */
const nextUfvk = () => encodeUnifiedAddress("uviewtest", [{ typecode: 0x03, data: new Uint8Array(96).fill(ufvkSeed++) }]);
const recipient = ADDRESS_TEST_VECTORS.testnet.validShielded;
const ctx = (campaignId: string) => ({ params: Promise.resolve({ campaignId }) });

const FUNDING = txid(0xf0);
/** Each campaign needs its own funding transaction; these are all mined on the fake chain. */
const FUNDINGS = Array.from({ length: 12 }, (_, i) => txid(0xf00 + i));
let fundingIndex = 0;
const GOOD_PAYOUT = txid(0xa1); // 3 Ironwood actions, fully shielded
const SMALL_PAYOUT = txid(0xa2); // 1 Ironwood action: cannot hold 2 recipients
const LEAKY_PAYOUT = txid(0xa3); // transparent output

async function lane2Campaign(slots = 2, publishUfvk = false) {
  const ufvk = nextUfvk();
  const res = await createCampaign(
    req("/api/campaigns", {
      title: `Bounty ${Math.random()}`,
      lane: "ONLINE_BATCH",
      network: "testnet",
      ufvk,
      fundingTxid: FUNDINGS[fundingIndex++ % FUNDINGS.length],
      totalFundedZat: 20_000_000,
      slotCount: slots,
      clawbackAddress: recipient,
      clawbackExpiryHeight: 50_000,
      publishUfvk,
    })
  );
  expect(res.status).toBe(201);
  const created = await res.json();
  return { ...created, ufvk, fundingTxid: created.anchor.fundingTxid, admin: { "x-admin-secret": created.adminSecret as string } } as {
    campaignId: string;
    ufvk: string;
    fundingTxid: string;
    admin: Record<string, string>;
    tokens: { token: string }[];
  };
}

async function claimAll(tokens: { token: string }[]) {
  for (const t of tokens) {
    const res = await submitClaim(req("/api/claims", { token: t.token, address: recipient }));
    expect(res.status).toBe(200);
  }
}

describe("Lane 2 payouts (route level, fake lightwalletd)", () => {
  beforeEach(() => {
    memoryStore.clearAll();
    resetRateLimit();
    useFakeChain({
      tip: 10_000,
      txs: {
        [FUNDING]: { height: 9_000, shape: { ironwoodActions: 2 } },
        ...Object.fromEntries(FUNDINGS.map((t) => [t, { height: 9_000, shape: { ironwoodActions: 2 } }])),
        // Payouts are mined at or after the anchor height (the tip when the campaign was created).
        [GOOD_PAYOUT]: { height: 10_000, shape: { ironwoodActions: 3, feeZat: 3000 } },
        [SMALL_PAYOUT]: { height: 10_000, shape: { ironwoodActions: 1 } },
        [LEAKY_PAYOUT]: { height: 10_000, shape: { ironwoodActions: 3, transparentOutputs: 1 } },
      },
    });
  });
  afterEach(() => restoreChain());

  it("claim -> export -> record payout on-chain -> scrub, with the ledger counting only paid slots", async () => {
    const { campaignId, admin, tokens } = await lane2Campaign(2);
    await claimAll(tokens);

    const exported = await (await batch(req("/api/batch", { campaignId }, admin))).json();
    expect(exported.batchRun).toBe(1);
    expect(exported.totalChunks).toBe(1);

    // Exported is not paid: the scrub still refuses.
    const blocked = await scrub(req("/api/scrub", { campaignId }, admin));
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({ code: "UNPAID_RECIPIENTS", exportedUnpaidCount: 2 });

    let ledger = (await (await proof(req(`/api/proof/${campaignId}`), ctx(campaignId))).json()).ledger;
    expect(ledger.counts.distributed).toBe(0);

    const missing = await payout(req("/api/batch/payout", { campaignId, batchRun: 1, txids: [txid(0xbeef)] }, admin));
    expect(missing.status).toBe(422);

    const paid = await payout(req("/api/batch/payout", { campaignId, batchRun: 1, txids: [GOOD_PAYOUT] }, admin));
    const paidJson = await paid.json();
    expect(paid.status).toBe(200);
    expect(paidJson.problems).toEqual([]);
    expect(paidJson.paidRecipients).toBe(2);

    const page = await (await proof(req(`/api/proof/${campaignId}`), ctx(campaignId))).json();
    ledger = page.ledger;
    expect(ledger.counts.distributed).toBe(2);
    expect(page.payouts[0]).toMatchObject({ txid: GOOD_PAYOUT, recipients: 2 });
    expect(page.payouts[0].check.status).toBe("MINED");
    expect(page.addressesStored).toBe(2);

    const done = await scrub(req("/api/scrub", { campaignId }, admin));
    expect(done.status).toBe(200);
    expect((await done.json()).addressesPurgedCount).toBe(2);
    const after = await (await proof(req(`/api/proof/${campaignId}`), ctx(campaignId))).json();
    expect(after.addressesStored).toBe(0);
    expect(after.ledger.counts.distributed).toBe(2); // payoutTxid survives the scrub
    expect(after.slots.every((s: { payoutTxid: string | null }) => s.payoutTxid === GOOD_PAYOUT)).toBe(true);
  });

  it("shows stored addresses to the organizer only, until the scrub", async () => {
    const { campaignId, admin, tokens } = await lane2Campaign(2);
    const addressesOf = async (headers: Record<string, string>) =>
      listAddresses(req(`/api/campaigns/${campaignId}/addresses`, {}, headers), ctx(campaignId));

    await submitClaim(req("/api/claims", { token: tokens[1].token, address: recipient }));

    expect((await addressesOf({})).status).toBe(401);
    expect((await addressesOf({ "x-admin-secret": "sec_wrong" })).status).toBeGreaterThanOrEqual(401);

    const listed = await (await addressesOf(admin)).json();
    expect(listed.addresses).toEqual([{ slotIndex: 1, address: recipient, poolType: expect.any(String) }]);

    // The public campaign data polled by the console never carries the address.
    const pub = await (await getCampaign(req(`/api/campaigns/${campaignId}`), ctx(campaignId))).json();
    expect(JSON.stringify(pub.slots)).not.toContain(recipient);

    await scrub(req("/api/scrub", { campaignId, force: true }, admin));
    expect((await (await addressesOf(admin)).json()).addresses).toEqual([]);
  });

  it("flags payouts that cannot hold every recipient or leak to transparent outputs", async () => {
    const one = await lane2Campaign(2);
    await claimAll(one.tokens);
    await batch(req("/api/batch", { campaignId: one.campaignId }, one.admin));
    const small = await (await payout(req("/api/batch/payout", { campaignId: one.campaignId, batchRun: 1, txids: [SMALL_PAYOUT] }, one.admin))).json();
    expect(small.problems.join(" ")).toMatch(/room for 1 shielded output/);

    const two = await lane2Campaign(2);
    await claimAll(two.tokens);
    await batch(req("/api/batch", { campaignId: two.campaignId }, two.admin));
    const leaky = await (await payout(req("/api/batch/payout", { campaignId: two.campaignId, batchRun: 1, txids: [LEAKY_PAYOUT] }, two.admin))).json();
    expect(leaky.problems.join(" ")).toMatch(/transparent output/);
  });

  it("refuses double recording, wrong txid counts, the funding txid, and re-exporting a paid run", async () => {
    const created = await lane2Campaign(2);
    const { campaignId, admin, tokens } = created;
    await claimAll(tokens);
    await batch(req("/api/batch", { campaignId }, admin));

    const tooMany = await payout(req("/api/batch/payout", { campaignId, batchRun: 1, txids: [GOOD_PAYOUT, SMALL_PAYOUT] }, admin));
    expect(tooMany.status).toBe(400);
    const funding = await payout(req("/api/batch/payout", { campaignId, batchRun: 1, txids: [created.fundingTxid] }, admin));
    expect(funding.status).toBe(409);

    expect((await payout(req("/api/batch/payout", { campaignId, batchRun: 1, txids: [GOOD_PAYOUT] }, admin))).status).toBe(200);
    const again = await payout(req("/api/batch/payout", { campaignId, batchRun: 1, txids: [SMALL_PAYOUT] }, admin));
    expect(again.status).toBe(409);

    const reexport = await batch(req("/api/batch", { campaignId }, admin));
    expect(reexport.status).toBe(400);
    expect((await reexport.json()).error).toMatch(/already has a recorded payout/);
  });

  it("refuses to record a payout while the node is unreachable (real campaigns)", async () => {
    const { campaignId, admin, tokens } = await lane2Campaign(1);
    await claimAll(tokens);
    await batch(req("/api/batch", { campaignId }, admin));
    useFakeChain({ tip: 0, txs: {}, unreachable: true });
    const res = await payout(req("/api/batch/payout", { campaignId, batchRun: 1, txids: [GOOD_PAYOUT] }, admin));
    expect(res.status).toBe(503);
    expect((await memoryStore.getClaimSlotsByCampaign(campaignId)).every((s) => !s.payoutTxid)).toBe(true);
  });

  it("never puts a recipient address on the proof portal, at any stage", async () => {
    // A clawback address distinct from the recipient, so a leak cannot hide behind the (public) clawback address.
    const clawback = encodeUnifiedAddress("utest", [{ typecode: 0x03, data: new Uint8Array(43).fill(7) }]);
    expect(clawback).not.toBe(recipient);
    const created = await (
      await createCampaign(
        req("/api/campaigns", {
          title: "Proof privacy check",
          lane: "ONLINE_BATCH",
          network: "testnet",
          ufvk: nextUfvk(),
          fundingTxid: FUNDINGS[fundingIndex++ % FUNDINGS.length],
          totalFundedZat: 20_000_000,
          slotCount: 1,
          clawbackAddress: clawback,
          clawbackExpiryHeight: 50_000,
        })
      )
    ).json();
    const campaignId = created.campaignId as string;
    const admin = { "x-admin-secret": created.adminSecret as string };
    const proofText = async () => (await proof(req(`/api/proof/${campaignId}`), ctx(campaignId))).text();

    expect((await submitClaim(req("/api/claims", { token: created.tokens[0].token, address: recipient }))).status).toBe(200);
    const submitted = await proofText();
    expect(submitted).toContain(clawback);
    expect(submitted).not.toContain(recipient);

    await batch(req("/api/batch", { campaignId }, admin));
    expect(await proofText()).not.toContain(recipient);

    expect((await payout(req("/api/batch/payout", { campaignId, batchRun: 1, txids: [GOOD_PAYOUT] }, admin))).status).toBe(200);
    const paid = await proofText();
    expect(paid).not.toContain(recipient);
    expect(JSON.parse(paid).addressesStored).toBe(1);
  });

  it("publishes only the UFVK fingerprint unless the organizer opts in", async () => {
    const hidden = await lane2Campaign(1, false);
    const hiddenBody = await (await getCampaign(req(`/api/campaigns/${hidden.campaignId}`), ctx(hidden.campaignId))).text();
    expect(hiddenBody).not.toContain(hidden.ufvk);
    const hiddenProof = await (await proof(req(`/api/proof/${hidden.campaignId}`), ctx(hidden.campaignId))).json();
    expect(hiddenProof.ufvk.published).toBeNull();
    expect(hiddenProof.ufvk.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(hiddenProof.ufvk.items).toEqual(["Orchard FVK"]);

    const shown = await lane2Campaign(1, true);
    const shownProof = await (await proof(req(`/api/proof/${shown.campaignId}`), ctx(shown.campaignId))).json();
    expect(shownProof.ufvk.published).toBe(shown.ufvk);
  });

  it("demo: a payout recorded in the sandbox is checked against the (fake) chain like any other", async () => {
    const admin = { "x-admin-secret": DEMO_ADMIN_SECRET };
    await batch(req("/api/batch", { campaignId: DEMO_CAMPAIGN_ID }, admin));
    const res = await payout(req("/api/batch/payout", { campaignId: DEMO_CAMPAIGN_ID, batchRun: 2, txids: [GOOD_PAYOUT] }, admin));
    expect(res.status).toBe(200);
    expect((await res.json()).payouts[0].check.status).toBe("MINED");
  });
});
