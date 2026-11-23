import React from "react";
import { Badge } from "@/components/ui/badge";

export interface QrSlipCardProps {
  cardId: string;
  amountZec: number;
  qrPayload: string;
  walletGuidance?: string;
}

export function QrSlipCard({
  cardId,
  amountZec,
  qrPayload,
  walletGuidance = "Scan with Vizor >= 0.0.57 or Zodl >= 3.16 | ~50s / 2 confirmations",
}: QrSlipCardProps) {
  return (
    <div className="border border-slate-700 bg-slate-900 p-4 rounded-none flex flex-col items-center justify-between text-center relative group">
      <div className="w-full flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
        <span className="font-mono font-bold text-amber-500 text-sm">{cardId}</span>
        <Badge variant="shielded">{amountZec.toFixed(4)} ZEC</Badge>
      </div>

      {/* QR Canvas Placeholder */}
      <div className="w-36 h-36 bg-white p-2 flex items-center justify-center border border-slate-700 mb-3">
        <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center p-2 text-center">
          <span className="text-[10px] font-mono text-amber-400">ZIP 324 QR</span>
          <span className="text-[8px] font-mono text-slate-500 break-all truncate max-w-[120px]">
            {qrPayload.slice(0, 16)}...
          </span>
        </div>
      </div>

      <div className="w-full text-left pt-2 border-t border-slate-800 text-[10px] font-mono text-slate-400">
        <div>{walletGuidance}</div>
        <div className="text-slate-600 text-[9px] mt-0.5">Secret ACK code inside note encrypted memo</div>
      </div>
    </div>
  );
}
