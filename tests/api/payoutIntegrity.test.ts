import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { POST as createCampaign } from "@/app/api/campaigns/route";
import { POST as submitClaim } from "@/app/api/claims/route";
import { POST as validateClaim } from "@/app/api/claims/validate/route";
import { POST as reportPayout } from "@/app/api/claims/report/route";
import { POST as batch } from "@/app/api/batch/route";
import { POST as payout } from "@/app/api/batch/payout/route";
import { GET as proof } from "@/app/api/proof/[campaignId]/route";
import { memoryStore } from "@/lib/db/store";
import { getRepo } from "@/lib/db/repo";
import { resetRateLimit } from "@/lib/security/rateLimit";
import { encodeUnifiedAddress } from "@/lib/zcash/zip316";
import { ADDRESS_TEST_VECTORS } from "@/lib/demo/constants";
import { req, restoreChain, txid, useFakeChain } from "../helpers/fakeChain";

delete process.env.MONGODB_URI;

const recipient = ADDRESS_TEST_VECTORS.testnet.validShielded;
// Distinct from the recipient: the clawback address is public by design, so a leak could hide behind it.
const clawback = encodeUnifiedAddress("utest", [{ typecode: 0x03, data: new Uint8Array(43).fill(11) }]);
const ctx = (campaignId: string) => ({ params: Promise.resolve({ campaignId }) });
let seed = 90;
const nextUfvk = () => encodeUnifiedAddress("uviewtest", [{ typecode: 0x03, data: new Uint8Array(96).fill(seed++) }]);

const TIP = 20_000;
const FUNDING_A = txid(0xfa);
const FUNDING_B = txid(0xfb);
const PAYOUT = txid(0xd1); // mined after both campaigns were anchored
const OLD_TX = txid(0xd2); // a real shielded transaction from before the campaign existed

/** One-link campaign whose recipient already submitted an address and was exported (run 1). */
async function exportedCampaign(fundingTxid: string) {
  const res = await createCampaign(
    req("/api/campaigns", {
      title: `Integrity ${Math.random()}`,
      lane: "ONLINE_BATCH",
      network: "testnet",
      ufvk: nextUfvk(),
      fundingTxid,
      totalFundedZat: 10_000_000,
      slotCount: 1,
      clawbackAddress: clawback,
      clawbackExpiryHeight: TIP + 50_000,
    })
  );
  expect(res.status).toBe(201);
  const created = await res.json();
  const admin = { "x-admin-secret": created.adminSecret as string };
  const token = created.tokens[0].token as string;
  expect((await submitClaim(req("/api/claims", { token, address: recipient }))).status).toBe(200);
  expect((await batch(req("/api/batch", { campaignId: created.campaignId }, admin))).status).toBe(200);
  return { campaignId: created.campaignId as string, admin, token };
}

const record = (campaignId: string, admin: Record<string, string>, txids: string[]) =>
  payout(req("/api/batch/payout", { campaignId, batchRun: 1, txids }, admin));

describe("Payout integrity: anchor height, one campaign per payout, recipient reports", () => {
  beforeEach(() => {
    memoryStore.clearAll();
    resetRateLimit();
    useFakeChain({
      tip: TIP,
      txs: {
        [FUNDING_A]: { height: 19_000, shape: { orchardActions: 2 } },
        [FUNDING_B]: { height: 19_001, shape: { orchardActions: 2 } },
        [PAYOUT]: { height: TIP, shape: { orchardActions: 2 } },
        [OLD_TX]: { height: 18_000, shape: { orchardActions: 4 } },
      },
    });
  });
  afterEach(() => restoreChain());

  it("refuses a payout mined before the campaign was anchored", async () => {
    const { campaignId, admin } = await exportedCampaign(FUNDING_A);
    const res = await record(campaignId, admin, [OLD_TX]);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/mined at height 18000, before this campaign was anchored \(height 20000\)/);
    const slots = await (await getRepo()).getSlots(campaignId);
    expect(slots[0].status).toBe("LOCKED_FOR_BATCH");
    expect(slots[0].payoutTxid).toBeUndefined();
  });

  it("refuses a transaction another campaign already recorded as its payout or its funding", async () => {
    const a = await exportedCampaign(FUNDING_A);
    const b = await exportedCampaign(FUNDING_B);
    expect((await record(a.campaignId, a.admin, [PAYOUT])).status).toBe(200);

    const reusedPayout = await record(b.campaignId, b.admin, [PAYOUT]);
    expect(reusedPayout.status).toBe(409);
    const error = (await reusedPayout.json()).error as string;
    expect(error).toMatch(/already recorded as the payout of another campaign/);
    expect(error).not.toContain(a.campaignId);

    const otherFunding = await record(b.campaignId, b.admin, [FUNDING_A]);
    expect(otherFunding.status).toBe(409);
    expect((await otherFunding.json()).error).toMatch(/funding transaction of a campaign/);
  });

  it("lets the link holder publicly report a recorded payout that never arrived", async () => {
    const { campaignId, admin, token } = await exportedCampaign(FUNDING_A);

    // Nothing to report before a payout is recorded; bad tokens and free text are refused.
    expect((await reportPayout(req("/api/claims/report", { token, reason: "NOT_RECEIVED" }))).status).toBe(409);
    expect((await reportPayout(req("/api/claims/report", { token: "claim_tok_" + "0".repeat(64), reason: "NOT_RECEIVED" }))).status).toBe(404);
    expect((await reportPayout(req("/api/claims/report", { token, reason: "NOT_RECEIVED", details: recipient }))).status).toBe(400);
    expect((await reportPayout(req("/api/claims/report", { token, reason: "SOMETHING_ELSE" }))).status).toBe(400);

    expect((await record(campaignId, admin, [PAYOUT])).status).toBe(200);
    let page = await (await proof(req(`/api/proof/${campaignId}`), ctx(campaignId))).json();
    expect(page.ledger.distributedZat).toBeGreaterThan(0);

    const reported = await reportPayout(req("/api/claims/report", { token, reason: "NOT_RECEIVED" }));
    expect(reported.status).toBe(200);
    expect((await reportPayout(req("/api/claims/report", { token, reason: "WRONG_AMOUNT" }))).status).toBe(409);

    const status = await (await validateClaim(req("/api/claims/validate", { token }))).json();
    expect(status.payoutReport).toBe("NOT_RECEIVED");

    page = await (await proof(req(`/api/proof/${campaignId}`), ctx(campaignId))).json();
    expect(page.slots[0].payoutReport).toBe("NOT_RECEIVED");
    // The reported amount leaves "distributed" for "awaiting".
    expect(page.ledger.distributedZat).toBe(0);
    expect(page.ledger.inFlightZat).toBe(page.slots[0].amountZat);
    expect(page.ledger.counts.disputed).toBe(1);
    expect(page.auditEvents.some((e: { eventType: string; details: { kind?: string } }) => e.eventType === "DISPUTE_FLAGGED" && e.details.kind === "PAYOUT_REPORT")).toBe(true);
    expect(JSON.stringify(page)).not.toContain(recipient);
  });
});
