import { describe, it, expect } from "vitest";
import {
  computeLedger,
  summarizeBudget,
  defaultSlotAmountZat,
  cardPlanReserveZat,
  defaultCardAmountZat,
  groupAmounts,
  laneTwoBudgetZat,
  matchCardsToPlan,
  MIN_CARD_SWEEP_BUFFER_ZAT,
} from "@/lib/campaign/budget";
import { estimateBatchFeeZat } from "@/lib/zcash/zip317";
import { buildDemoFixtures } from "@/lib/demo/fixtures";

describe("Campaign budget and public ledger", () => {
  it("ledger buckets always sum to the declared funding", () => {
    const { campaign, vouchers, claimSlots } = buildDemoFixtures();
    const l = computeLedger({ totalFundedZat: campaign.totalFundedZat, vouchers, slots: claimSlots });
    const sum = l.distributedZat + l.inFlightZat + l.unclaimedZat + l.clawedBackZat + l.feesAndBuffersZat + l.unallocatedZat;
    expect(sum).toBe(campaign.totalFundedZat);
    expect(l.unallocatedZat).toBeGreaterThanOrEqual(0);
    // Disputed cards stay in the equation instead of vanishing
    expect(l.counts.disputed).toBe(1);
  });

  it("flags over-allocation as a negative remainder", () => {
    const s = summarizeBudget({
      totalFundedZat: 1_000_000,
      vouchers: [{ amountZat: 900_000, feeBufferZat: 2000, state: "UNCLAIMED" }],
      slots: [{ amountZat: 200_000, status: "UNCLAIMED" }],
    });
    expect(s.isOverAllocated).toBe(true);
  });

  it("default slot amount leaves room for the batch fee", () => {
    for (const [budget, n] of [[100_000_000, 5], [10_000_000, 299], [123_456_789, 600]] as const) {
      const per = defaultSlotAmountZat(budget, n);
      expect(per).toBeGreaterThan(0);
      expect(per * n + estimateBatchFeeZat(n)).toBeLessThanOrEqual(budget);
    }
    // A budget below the minimum fee yields 0, which callers treat as "cannot fund these links".
    expect(defaultSlotAmountZat(7, 1)).toBe(0);
  });
});

describe("Gift-card plans", () => {
  it("reserves each planned card's amount plus the minimum sweep buffer", () => {
    expect(cardPlanReserveZat([10_000_000, 5_000_000])).toBe(15_000_000 + 2 * MIN_CARD_SWEEP_BUFFER_ZAT);
    const s = summarizeBudget({ totalFundedZat: 20_000_000, vouchers: [], slots: [], plannedCardsZat: [10_000_000, 5_000_000] });
    expect(s.plannedCardReserveZat).toBe(15_004_000);
    expect(s.remainingZat).toBe(20_000_000 - 15_004_000);
    expect(summarizeBudget({ totalFundedZat: 15_003_999, vouchers: [], slots: [], plannedCardsZat: [10_000_000, 5_000_000] }).isOverAllocated).toBe(true);
  });

  it("splits a card budget evenly after the sweep buffers", () => {
    const per = defaultCardAmountZat(10_000_000, 3);
    expect(per * 3 + 3 * MIN_CARD_SWEEP_BUFFER_ZAT).toBeLessThanOrEqual(10_000_000);
    expect(defaultCardAmountZat(5_999, 3)).toBe(0);
  });

  it("matches cards to the plan by amount, whatever their IDs", () => {
    const plan = [50_000_000, 10_000_000, 10_000_000];
    const m = matchCardsToPlan(plan, [
      { cardId: "X-1", amountZat: 10_000_000 },
      { cardId: "X-2", amountZat: 20_000_000 },
      { cardId: "X-3", amountZat: 10_000_000 },
      { cardId: "X-4", amountZat: 10_000_000 },
    ]);
    expect(m.matchedCount).toBe(2);
    expect(m.unplanned.map((c) => c.cardId)).toEqual(["X-2", "X-4"]);
    expect(m.remainingZat).toEqual([50_000_000]);
    expect(groupAmounts([10, 50, 10])).toEqual([
      { amountZat: 50, count: 1 },
      { amountZat: 10, count: 2 },
    ]);
  });

  it("gives Hybrid links what the card plan leaves, or half without a plan", () => {
    expect(laneTwoBudgetZat("HYBRID", 100)).toBe(50);
    expect(laneTwoBudgetZat("HYBRID", 100, 30)).toBe(70);
    expect(laneTwoBudgetZat("ONLINE_BATCH", 100, 30)).toBe(100);
  });
});
