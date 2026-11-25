"use client";

import React from "react";
import { ClipboardList, Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { downloadText } from "@/lib/client/organizer";
import { cardPlanReserveZat, groupAmounts, matchCardsToPlan, MIN_CARD_SWEEP_BUFFER_ZAT } from "@/lib/campaign/budget";
import { zecExact, zecPlain } from "@/lib/format";

/** One row per planned card, for the minting wallet. Amounts only: there is no key in a plan. */
export function cardPlanCsv(planZat: number[]): string {
  return [
    "card_number,amount_zec,sweep_fee_buffer_zat",
    ...planZat.map((amountZat, i) => `${i + 1},${zecPlain(amountZat)},${MIN_CARD_SWEEP_BUFFER_ZAT}`),
  ].join("\n");
}

/**
 * The gift-card amounts anchored with the campaign. ZecClaim never mints cards: the organizer
 * (or the DAO) mints exactly these in Vizor or Zodl, and the CSV import is checked against them.
 * With `registered`, each amount shows how many imported cards already match it.
 */
export function CardPlanCard({
  campaignId,
  planZat,
  registered,
}: {
  campaignId: string;
  planZat: number[];
  registered?: { cardId: string; amountZat: number }[];
}) {
  const groups = groupAmounts(planZat);
  const match = registered ? matchCardsToPlan(planZat, registered) : null;
  const open = match ? new Map(groupAmounts(match.remainingZat).map((g) => [g.amountZat, g.count])) : null;
  const fundZat = cardPlanReserveZat(planZat);
  const done = match !== null && match.remainingZat.length === 0;

  return (
    <Card className="print:hidden">
      <CardHeader className="sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl neo-icon-btn flex items-center justify-center text-mint shrink-0">
            <ClipboardList className="w-5 h-5" />
          </span>
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Card plan: {planZat.length} card{planZat.length === 1 ? "" : "s"}
              {match && <Badge variant={done ? "ack" : "default"}>{`${match.matchedCount} of ${planZat.length} registered`}</Badge>}
            </CardTitle>
            <CardDescription>
              Mint exactly these cards in Vizor or Zodl, then import their CSV. A card whose amount is not open in the plan is refused.
              Fund the cards with <span className="font-mono text-ink">{zecExact(fundZat)} ZEC</span> (amounts plus{" "}
              {zecExact(MIN_CARD_SWEEP_BUFFER_ZAT)} ZEC sweep buffer each).
            </CardDescription>
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          onClick={() => downloadText(`zecclaim-${campaignId}-card-plan.csv`, cardPlanCsv(planZat), "text/csv")}
        >
          <Download className="w-3.5 h-3.5" /> Plan CSV
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="neo-inset-sm rounded-xl divide-y divide-line max-h-64 overflow-y-auto">
          {groups.map((g) => {
            const left = open ? open.get(g.amountZat) ?? 0 : null;
            return (
              <li key={g.amountZat} className="flex items-center justify-between gap-3 px-3.5 py-2 text-[12.5px]">
                <span className="font-mono font-semibold text-ink">
                  {g.count} x {zecExact(g.amountZat)} ZEC
                </span>
                {left !== null && (
                  <span className={left === 0 ? "text-mint-deep font-semibold" : "text-subtle"}>
                    {left === 0 ? "All registered" : `${g.count - left} registered, ${left} to import`}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
