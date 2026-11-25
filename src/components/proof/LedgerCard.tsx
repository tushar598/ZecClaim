import React from "react";
import { zecExact } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { CampaignLedger } from "@/lib/campaign/budget";

const zec = (zat: number) => zecExact(zat);

/**
 * Funding reconciliation. Every zatoshi of declared funding is placed in exactly one bucket,
 * so the bar always fills to 100%; the meaningful signal is the remainder (negative means the
 * organizer promised more than they funded).
 */
export function LedgerCard({ ledger, isDemo }: { ledger: CampaignLedger; isDemo: boolean }) {
  const buckets = [
    { key: "distributed", label: "Distributed", hint: "confirmed cards and slots with a payout tx not reported missing", zat: ledger.distributedZat, color: "bg-mint" },
    { key: "inFlight", label: "Awaiting", hint: "addresses not paid yet, payouts reported missing and disputed cards", zat: ledger.inFlightZat, color: "bg-amber" },
    { key: "unclaimed", label: "Unclaimed", hint: "open links and unconfirmed cards", zat: ledger.unclaimedZat, color: "bg-slate/60" },
    { key: "clawedBack", label: "Clawed back", hint: "returned to the clawback address", zat: ledger.clawedBackZat, color: "bg-violet" },
    { key: "fees", label: "Fees and buffers", hint: "ZIP 2009 batch fees and sweep buffers", zat: ledger.feesAndBuffersZat, color: "bg-cyan" },
    { key: "unallocated", label: "Unallocated", hint: "funded but not assigned", zat: Math.max(0, ledger.unallocatedZat), color: "bg-line" },
  ];
  const total = Math.max(1, ledger.totalFundedZat);
  const over = ledger.unallocatedZat < 0;

  return (
    <section className="neo-card rounded-[18px] p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-bold tracking-[-0.015em] text-ink">Where the funding sits</h2>
          <p className="text-[12.5px] text-subtle mt-0.5">
            Computed from ZecClaim records{isDemo ? " (demo fixtures)" : ""}. Online payouts count as distributed only
            once their transaction is recorded and found on-chain, and not while the recipient reports it missing; gift
            cards once their recipient confirms.
          </p>
        </div>
        {over ? (
          <Badge variant="transparent">Over-allocated by {zec(-ledger.unallocatedZat)} ZEC</Badge>
        ) : ledger.unallocatedZat === 0 ? (
          <Badge variant="shielded">Fully allocated</Badge>
        ) : (
          <Badge variant="default">{zec(ledger.unallocatedZat)} ZEC unallocated</Badge>
        )}
      </div>

      <div className="neo-inset-sm rounded-full h-3.5 p-[3px] flex overflow-hidden" role="img" aria-label="Funding allocation bar">
        {buckets
          .filter((b) => b.zat > 0)
          .map((b) => (
            <span
              key={b.key}
              title={`${b.label}: ${zec(b.zat)} ZEC`}
              className={`${b.color} h-full first:rounded-l-full last:rounded-r-full`}
              style={{ width: `${(b.zat / total) * 100}%` }}
            />
          ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {buckets.map((b) => (
          <div key={b.key} className="neo-card-sm rounded-[14px] px-4 py-3.5">
            <p className="text-[11.5px] font-medium text-subtle flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${b.color}`} /> {b.label}
            </p>
            <p className="font-mono tabular-nums text-[18px] font-bold mt-1 text-ink">
              {b.key === "unallocated" && over ? `-${zec(-ledger.unallocatedZat)}` : zec(b.zat)}
            </p>
            <p className="text-[11px] text-subtle mt-0.5">{b.hint}</p>
          </div>
        ))}
      </div>

      <p className="font-mono text-[11.5px] text-subtle break-words">
        {zec(ledger.totalFundedZat)} funded = {zec(ledger.distributedZat)} + {zec(ledger.inFlightZat)} +{" "}
        {zec(ledger.unclaimedZat)} + {zec(ledger.clawedBackZat)} + {zec(ledger.feesAndBuffersZat)} +{" "}
        {zec(ledger.unallocatedZat)} ZEC
      </p>
    </section>
  );
}
