import { estimateBatchFeeZat } from "@/lib/zcash/zip317";

/**
 * Campaign budget accounting (pure, no I/O).
 *
 * Every zatoshi of a campaign's declared funding should be accounted for by exactly one of:
 * Lane 1 card value + sweep buffer, Lane 2 slot value, the estimated Lane 2 batch fee, or the
 * unallocated remainder. A negative remainder means the organizer promised more than the
 * funding transaction can pay, so the payout transaction would fail.
 */

export interface BudgetVoucher {
  amountZat: number;
  feeBufferZat: number;
  state: string;
}

export interface BudgetSlot {
  amountZat: number;
  status: string;
  payoutTxid?: string;
  /** The link holder reported the recorded payout as not received (or a different amount). */
  payoutReport?: string;
}

export interface BudgetSummary {
  totalFundedZat: number;
  voucherAllocatedZat: number;
  slotAllocatedZat: number;
  batchFeeReserveZat: number;
  /** Planned gift cards not registered yet: their amounts plus the minimum sweep buffer each. */
  plannedCardReserveZat: number;
  allocatedZat: number;
  remainingZat: number;
  isOverAllocated: boolean;
}

export function summarizeBudget(input: {
  totalFundedZat: number;
  vouchers: BudgetVoucher[];
  slots: BudgetSlot[];
  /** Card-plan amounts still waiting for a registered card (see `matchCardsToPlan`). */
  plannedCardsZat?: number[];
}): BudgetSummary {
  const voucherAllocatedZat = input.vouchers.reduce((sum, v) => sum + v.amountZat + v.feeBufferZat, 0);
  const slotAllocatedZat = input.slots.reduce((sum, s) => sum + s.amountZat, 0);
  const batchFeeReserveZat = estimateBatchFeeZat(input.slots.length);
  const plannedCardReserveZat = cardPlanReserveZat(input.plannedCardsZat ?? []);
  const allocatedZat = voucherAllocatedZat + slotAllocatedZat + batchFeeReserveZat + plannedCardReserveZat;
  const remainingZat = input.totalFundedZat - allocatedZat;
  return {
    totalFundedZat: input.totalFundedZat,
    voucherAllocatedZat,
    slotAllocatedZat,
    batchFeeReserveZat,
    plannedCardReserveZat,
    allocatedZat,
    remainingZat,
    isOverAllocated: remainingZat < 0,
  };
}

/**
 * Default per-slot amount when creating claim links: the share of `budgetZat` left after
 * reserving the batch fee for `slotCount` recipients. Returns 0 if the budget cannot cover fees.
 */
export function defaultSlotAmountZat(budgetZat: number, slotCount: number): number {
  if (slotCount <= 0) return 0;
  const spendable = budgetZat - estimateBatchFeeZat(slotCount);
  return spendable > 0 ? Math.floor(spendable / slotCount) : 0;
}

/**
 * Budget share given to Lane 2 claim links when the organizer does not set a per-link amount.
 * HYBRID campaigns keep half of the funding free for Lane 1 gift cards, or, when the organizer
 * planned the cards, exactly what the card plan reserves.
 */
export function laneTwoBudgetZat(lane: string, totalFundedZat: number, cardPlanReservedZat = 0): number {
  if (lane !== "HYBRID") return totalFundedZat;
  return cardPlanReservedZat > 0 ? totalFundedZat - cardPlanReservedZat : Math.floor(totalFundedZat / 2);
}

/**
 * Gift-card plans (Lane 1 / Hybrid).
 *
 * ZecClaim never mints a card: Vizor or Zodl does, and each card is its own key. The organizer
 * can instead anchor the amounts they intend to mint (one entry per card). The plan reserves its
 * value in the budget, every imported card must take one open plan entry of the same amount,
 * and the proof portal publishes how much of the plan is registered.
 */
export const MIN_CARD_SWEEP_BUFFER_ZAT = 2_000; // ZIP 317 grace actions x ZIP 2009 marginal fee
export const MAX_PLANNED_CARDS = 1_000;

/** What a plan reserves: each card's amount plus the minimum sweep buffer it is funded with. */
export function cardPlanReserveZat(planZat: number[]): number {
  return planZat.reduce((sum, amountZat) => sum + amountZat + MIN_CARD_SWEEP_BUFFER_ZAT, 0);
}

/**
 * Default per-card amount when splitting `budgetZat` evenly across `cardCount` cards, after each
 * card's sweep buffer. Returns 0 if the budget cannot cover the buffers.
 */
export function defaultCardAmountZat(budgetZat: number, cardCount: number): number {
  if (cardCount <= 0) return 0;
  const spendable = budgetZat - cardCount * MIN_CARD_SWEEP_BUFFER_ZAT;
  return spendable > 0 ? Math.floor(spendable / cardCount) : 0;
}

export interface CardPlanMatch {
  /** Plan entries no card has taken yet. */
  remainingZat: number[];
  /** Cards (in input order) whose amount has no open plan entry left. */
  unplanned: { cardId: string; amountZat: number }[];
  /** Cards that took a plan entry. */
  matchedCount: number;
}

/**
 * Matches cards to plan entries by exact amount, in order. Card IDs are whatever the minting
 * wallet assigned, so only the amounts are compared.
 */
export function matchCardsToPlan(planZat: number[], cards: { cardId: string; amountZat: number }[]): CardPlanMatch {
  const open = new Map<number, number>();
  for (const amountZat of planZat) open.set(amountZat, (open.get(amountZat) ?? 0) + 1);
  const unplanned: CardPlanMatch["unplanned"] = [];
  let matchedCount = 0;
  for (const card of cards) {
    const left = open.get(card.amountZat) ?? 0;
    if (left > 0) {
      open.set(card.amountZat, left - 1);
      matchedCount++;
    } else {
      unplanned.push({ cardId: card.cardId, amountZat: card.amountZat });
    }
  }
  // Whatever is still open, in plan order.
  const remainingZat: number[] = [];
  for (const amountZat of planZat) {
    const left = open.get(amountZat) ?? 0;
    if (left > 0) {
      remainingZat.push(amountZat);
      open.set(amountZat, left - 1);
    }
  }
  return { remainingZat, unplanned, matchedCount };
}

/** Amounts grouped for display, largest first: [0.5, 0.1, 0.1] -> [{0.5 x1}, {0.1 x2}]. */
export function groupAmounts(amountsZat: number[]): { amountZat: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const a of amountsZat) counts.set(a, (counts.get(a) ?? 0) + 1);
  return Array.from(counts, ([amountZat, count]) => ({ amountZat, count })).sort((a, b) => b.amountZat - a.amountZat);
}

export function formatZec(zat: number, decimals = 4): string {
  return (zat / 100_000_000).toFixed(decimals);
}

/**
 * Public reconciliation ledger for the proof portal.
 *
 * Every zatoshi of declared funding lands in exactly one bucket, so the buckets always sum
 * to the funding. The meaningful signal is `unallocatedZat`: negative means over-allocated.
 *
 * "Distributed" means: Lane 1, the recipient confirmed the card with its memo code; Lane 2, a
 * payout transaction was recorded for the slot's batch and found on-chain, and the link holder has
 * not reported it as missing. Exported but unpaid slots, reported payouts and disputed cards are
 * "awaiting". Amounts come from ZecClaim records; the chain check
 * confirms the payout transaction exists and its shape, not the amounts inside it.
 */
export interface LedgerVoucher extends BudgetVoucher {
  disputeReason?: string;
}

export interface CampaignLedger {
  totalFundedZat: number;
  distributedZat: number; // L1 ACK_CONFIRMED + L2 slots with a recorded payout tx
  inFlightZat: number; // L1 DISPUTED + L2 SUBMITTED / LOCKED_FOR_BATCH (no payout tx yet) + L2 payouts reported missing
  unclaimedZat: number; // L1 UNCLAIMED + L2 UNCLAIMED (+ slots scrubbed without a payout)
  clawedBackZat: number; // L1 CLAWED_BACK (value + its sweep buffer)
  feesAndBuffersZat: number; // L1 sweep buffers (non-clawed) + L2 batch fee reserve
  unallocatedZat: number; // remainder; negative = over-allocated
  counts: {
    distributed: number;
    inFlight: number;
    unclaimed: number;
    clawedBack: number;
    ackConfirmed: number;
    disputed: number;
  };
}

export function computeLedger(input: {
  totalFundedZat: number;
  vouchers: LedgerVoucher[];
  slots: BudgetSlot[];
}): CampaignLedger {
  let distributedZat = 0;
  let inFlightZat = 0;
  let unclaimedZat = 0;
  let clawedBackZat = 0;
  let buffersZat = 0;
  const counts = { distributed: 0, inFlight: 0, unclaimed: 0, clawedBack: 0, ackConfirmed: 0, disputed: 0 };

  for (const v of input.vouchers) {
    if (v.state === "CLAWED_BACK") {
      clawedBackZat += v.amountZat + v.feeBufferZat;
      counts.clawedBack++;
      continue;
    }
    buffersZat += v.feeBufferZat;
    if (v.state === "ACK_CONFIRMED") {
      distributedZat += v.amountZat;
      counts.distributed++;
      counts.ackConfirmed++;
    } else if (v.state === "DISPUTED") {
      inFlightZat += v.amountZat;
      counts.inFlight++;
    } else {
      unclaimedZat += v.amountZat;
      counts.unclaimed++;
    }
    if (v.state === "DISPUTED" || v.disputeReason) counts.disputed++;
  }

  for (const s of input.slots) {
    if (s.payoutTxid && s.payoutReport) {
      // The only party who can see the payout says it did not arrive as recorded.
      inFlightZat += s.amountZat;
      counts.inFlight++;
      counts.disputed++;
    } else if (s.payoutTxid) {
      distributedZat += s.amountZat;
      counts.distributed++;
    } else if (s.status === "SUBMITTED" || s.status === "LOCKED_FOR_BATCH" || s.status === "BATCHED") {
      inFlightZat += s.amountZat;
      counts.inFlight++;
    } else {
      unclaimedZat += s.amountZat;
      counts.unclaimed++;
    }
  }

  const feesAndBuffersZat = buffersZat + estimateBatchFeeZat(input.slots.length);
  const unallocatedZat =
    input.totalFundedZat - distributedZat - inFlightZat - unclaimedZat - clawedBackZat - feesAndBuffersZat;

  return {
    totalFundedZat: input.totalFundedZat,
    distributedZat,
    inFlightZat,
    unclaimedZat,
    clawedBackZat,
    feesAndBuffersZat,
    unallocatedZat,
    counts,
  };
}
