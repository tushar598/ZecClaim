import { describe, it, expect } from "vitest";
import { planCampaignAmounts, type AmountSpec } from "@/lib/campaign/amountPlan";
import { cardPlanReserveZat, defaultSlotAmountZat, laneTwoBudgetZat, summarizeBudget } from "@/lib/campaign/budget";

const split = (count: number): AmountSpec => ({ mode: "split", count, fixedZat: null, customZat: [] });
const fixed = (count: number, fixedZat: number): AmountSpec => ({ mode: "fixed", count, fixedZat, customZat: [] });
const custom = (customZat: (number | null)[]): AmountSpec => ({ mode: "custom", count: null, fixedZat: null, customZat });

const fits = (total: number, links: number[], cards: number[]) =>
  !summarizeBudget({
    totalFundedZat: total,
    vouchers: [],
    slots: links.map((amountZat) => ({ amountZat, status: "UNCLAIMED" })),
    plannedCardsZat: cards,
  }).isOverAllocated;

describe("Campaign amount plan (form preview)", () => {
  it("keeps per-link custom amounts in order and rejects incomplete rows", () => {
    const plan = planCampaignAmounts({ lane: "ONLINE_BATCH", totalFundedZat: 100_000_000, links: custom([50_000_000, 25_000_000, 10_000_000]), cards: null });
    expect(plan.linksZat).toEqual([50_000_000, 25_000_000, 10_000_000]);
    expect(plan.cardsZat).toEqual([]);
    expect(planCampaignAmounts({ lane: "ONLINE_BATCH", totalFundedZat: 100_000_000, links: custom([50_000_000, null]), cards: null }).linksZat).toBeNull();
  });

  it("splits links exactly like the server when the cards are planned", () => {
    const total = 100_000_000;
    const cards = [20_000_000, 10_000_000];
    const plan = planCampaignAmounts({ lane: "HYBRID", totalFundedZat: total, links: split(4), cards: custom(cards) });
    // The server's rule for a split with a card plan:
    const serverPer = defaultSlotAmountZat(laneTwoBudgetZat("HYBRID", total, cardPlanReserveZat(cards)), 4);
    expect(plan.linksZat).toEqual([serverPer, serverPer, serverPer, serverPer]);
    expect(fits(total, plan.linksZat ?? [], cards)).toBe(true);
  });

  it("fits every Hybrid combination inside the pool", () => {
    const total = 123_456_789;
    const specs: [AmountSpec, AmountSpec][] = [
      [split(7), split(11)],
      [fixed(5, 5_000_000), split(9)],
      [split(3), fixed(4, 8_000_000)],
      [custom([30_000_000, 1_000_000]), custom([2_000_000, 3_000_000, 4_000_000])],
    ];
    for (const [links, cards] of specs) {
      const plan = planCampaignAmounts({ lane: "HYBRID", totalFundedZat: total, links, cards });
      expect(plan.linksZat).not.toBeNull();
      expect(plan.cardsZat).not.toBeNull();
      expect(fits(total, plan.linksZat ?? [], plan.cardsZat ?? [])).toBe(true);
    }
  });

  it("splits gift cards over the whole pool in a Lane 1 campaign", () => {
    const plan = planCampaignAmounts({ lane: "OFFLINE_ZIP324", totalFundedZat: 10_000_000, links: split(5), cards: split(4) });
    expect(plan.linksZat).toEqual([]);
    expect(plan.cardsZat).toHaveLength(4);
    expect(fits(10_000_000, [], plan.cardsZat ?? [])).toBe(true);
  });

  it("returns null when a split cannot be funded", () => {
    expect(planCampaignAmounts({ lane: "ONLINE_BATCH", totalFundedZat: 1_000, links: split(5), cards: null }).linksZat).toBeNull();
    expect(planCampaignAmounts({ lane: "OFFLINE_ZIP324", totalFundedZat: 5_000, links: split(1), cards: split(3) }).cardsZat).toBeNull();
  });
});
