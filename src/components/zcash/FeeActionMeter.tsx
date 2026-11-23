import React from "react";
import { calculateZip2009Fee, SAFE_CHUNK_ACTION_LIMIT, NU7_BLOCK_ACTION_LIMIT } from "@/lib/zcash/zip317";

export interface FeeActionMeterProps {
  totalRecipients: number;
  totalActions: number;
}

export function FeeActionMeter({ totalRecipients, totalActions }: FeeActionMeterProps) {
  const feeZat = calculateZip2009Fee(totalActions);
  const feeZec = (feeZat / 100_000_000).toFixed(8);
  const percentOfSafeCap = Math.min(100, Math.round((totalActions / SAFE_CHUNK_ACTION_LIMIT) * 100));

  return (
    <div className="bg-slate-900 border border-slate-800 p-4 rounded-none">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono uppercase text-slate-400">
          NU7 Action Load &amp; Marginal Fee
        </span>
        <span className="text-xs font-mono text-amber-400">
          {totalActions} / {SAFE_CHUNK_ACTION_LIMIT} Actions (Cap: {NU7_BLOCK_ACTION_LIMIT})
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-950 h-2 border border-slate-800 overflow-hidden mb-3">
        <div
          className="bg-amber-500 h-full transition-all duration-300"
          style={{ width: `${percentOfSafeCap}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs font-mono pt-1">
        <div className="bg-slate-950 p-2 border border-slate-800">
          <div className="text-slate-500 text-[10px] uppercase">Recipients</div>
          <div className="text-slate-200 font-bold text-sm">{totalRecipients}</div>
        </div>
        <div className="bg-slate-950 p-2 border border-slate-800">
          <div className="text-slate-500 text-[10px] uppercase">ZIP 2009 Fee</div>
          <div className="text-slate-200 font-bold text-sm">{feeZat.toLocaleString()} zat</div>
        </div>
        <div className="bg-slate-950 p-2 border border-slate-800">
          <div className="text-slate-500 text-[10px] uppercase">Fee in ZEC</div>
          <div className="text-amber-400 font-bold text-sm">{feeZec} ZEC</div>
        </div>
      </div>
    </div>
  );
}
