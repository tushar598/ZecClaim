import React from "react";
import { zecExact } from "@/lib/format";
import { SAFE_CHUNK_ACTION_LIMIT, NU7_BLOCK_ACTION_LIMIT } from "@/lib/zcash/zip317";

export interface FeeActionMeterProps {
  totalRecipients: number;
  totalActions: number;
  totalFeeZat: number;
  transactions: number;
}

/** Action load of the largest transaction against the 300-action cap, plus the total ZIP 2009 fee. */
export function FeeActionMeter({ totalRecipients, totalActions, totalFeeZat, transactions }: FeeActionMeterProps) {
  const perTx = transactions > 0 ? Math.ceil(totalActions / transactions) : 0;
  const pct = Math.min(100, Math.round((perTx / SAFE_CHUNK_ACTION_LIMIT) * 100));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[12px]">
        <span className="font-semibold text-ink">Actions per transaction</span>
        <span className="font-mono text-subtle">
          {perTx} / {SAFE_CHUNK_ACTION_LIMIT} (NU7 block budget {NU7_BLOCK_ACTION_LIMIT})
        </span>
      </div>
      <div className="neo-inset-sm rounded-full h-3 p-[3px]">
        <div className="bg-mint h-full rounded-full transition-all duration-300" style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          ["Recipients", String(totalRecipients)],
          ["Transactions", String(transactions)],
          ["ZIP 2009 fee", `${zecExact(totalFeeZat)} ZEC`],
        ].map(([label, value]) => (
          <div key={label} className="neo-card-sm rounded-xl px-3.5 py-2.5">
            <p className="text-[11px] text-subtle">{label}</p>
            <p className="font-mono text-[14px] font-bold text-ink mt-0.5">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
