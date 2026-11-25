import { estimateBatchFeeZat } from "@/lib/zcash/zip317";
import {
  cardPlanReserveZat,
  defaultCardAmountZat,
  defaultSlotAmountZat,
  laneTwoBudgetZat,
  MAX_PLANNED_CARDS,
} from "@/lib/campaign/budget";
import type { CampaignLane } from "@/types";

/**
 * Turns the campaign form's amount choices into exact zatoshi amounts (pure, client-safe).
 *
 * Claim links and planned gift cards each pick one mode:
 * - `split`: the share of their budget left after fees (links: ZIP 2009 batch fee; cards: the
 *   minimum sweep buffer per card), divided evenly.
 * - `fixed`: the same amount on every item.
 * - `custom`: one amount per item, in order.
 *
 * In a HYBRID campaign both draw on one pool. When both split, the cards take the upper half and
 * the links split what the card plan leaves, which is exactly what the server does for a split
 * (`laneTwoBudgetZat`), so the form preview and the anchored amounts always agree. When only one
 * side splits, it splits whatever the other side leaves.
 */
export type AmountMode = "split" | "fixed" | "custom";

export const MAX_CLAIM_LINKS = 5_000;

export interface AmountSpec {
  mode: AmountMode;
  /** split / fixed: number of items (null when the field is not a valid count). */
  count: number | null;
  /** fixed: amount per item. */
  fixedZat: number | null;
  /** custom: one entry per item, null where the row is not a valid amount. */
  customZat: (number | null)[];
}

export interface CampaignAmountPlan {
  /** Claim-link amounts; [] when the lane has no links, null while incomplete or unaffordable. */
  linksZat: number[] | null;
  /** Planned card amounts; [] without a card plan, null while incomplete or unaffordable. */
  cardsZat: number[] | null;
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

function validCount(count: number | null, max: number): count is number {
  return count !== null && Number.isInteger(count) && count >= 1 && count <= max;
}

/** Amounts for `fixed` and `custom`; null for `split` (it depends on the budget). */
function explicitAmounts(spec: AmountSpec, max: number): number[] | null {
  if (spec.mode === "custom") {
    const rows = spec.customZat;
    return rows.length >= 1 && rows.length <= max && rows.every((z): z is number => z !== null && z > 0) ? rows : null;
  }
  if (spec.mode === "fixed") {
    return validCount(spec.count, max) && spec.fixedZat !== null && spec.fixedZat > 0
      ? Array.from({ length: spec.count }, () => spec.fixedZat as number)
      : null;
  }
  return null;
}

function split(count: number | null, max: number, perItem: (count: number) => number): number[] | null {
  if (!validCount(count, max)) return null;
  const per = perItem(count);
  return per > 0 ? Array.from({ length: count }, () => per) : null;
}

export function planCampaignAmounts(input: {
  lane: CampaignLane;
  totalFundedZat: number;
  links: AmountSpec;
  /** null: no card plan (amounts come from the CSV at import). */
  cards: AmountSpec | null;
}): CampaignAmountPlan {
  const { lane, totalFundedZat: total, links, cards } = input;
  const hasLinks = lane !== "OFFLINE_ZIP324";
  const planCards = lane !== "ONLINE_BATCH" && cards !== null;

  const splitCards = (budgetZat: number) =>
    split(cards?.count ?? null, MAX_PLANNED_CARDS, (n) => defaultCardAmountZat(budgetZat, n));
  const splitLinks = (budgetZat: number) =>
    split(links.count, MAX_CLAIM_LINKS, (n) => defaultSlotAmountZat(budgetZat, n));

  let cardsZat: number[] | null = planCards ? null : [];
  let linksZat: number[] | null = hasLinks ? null : [];

  if (planCards && cards.mode !== "split") cardsZat = explicitAmounts(cards, MAX_PLANNED_CARDS);
  if (planCards && cards.mode === "split" && (!hasLinks || links.mode === "split")) {
    cardsZat = splitCards(hasLinks ? total - Math.floor(total / 2) : total);
  }

  if (hasLinks) {
    if (links.mode !== "split") linksZat = explicitAmounts(links, MAX_CLAIM_LINKS);
    else if (!planCards) linksZat = splitLinks(laneTwoBudgetZat(lane, total));
    else if (cardsZat) linksZat = splitLinks(laneTwoBudgetZat(lane, total, cardPlanReserveZat(cardsZat)));
  }

  if (planCards && cards.mode === "split" && hasLinks && links.mode !== "split") {
    cardsZat = linksZat ? splitCards(total - sum(linksZat) - estimateBatchFeeZat(linksZat.length)) : null;
  }

  return { linksZat, cardsZat };
}
