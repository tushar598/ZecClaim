import React from "react";
import { Badge } from "@/components/ui/badge";

export interface ScrubAttestationCardProps {
  executedAt: string;
  purgedCount: number;
  setHash: string;
}

export function ScrubAttestationCard({
  executedAt,
  purgedCount,
  setHash,
}: ScrubAttestationCardProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 p-5 rounded-none font-mono">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
        <div className="flex items-center space-x-2">
          <Badge variant="purged">PII SCRUB ATTESTATION</Badge>
          <span className="text-xs text-slate-400">Immutable Proof of Deletion</span>
        </div>
        <span className="text-xs text-slate-500">{new Date(executedAt).toUTCString()}</span>
      </div>

      <div className="grid grid-cols-2 gap-4 text-xs mb-3">
        <div className="bg-slate-950 p-2.5 border border-slate-800">
          <div className="text-slate-500 text-[10px] uppercase">Addresses Purged</div>
          <div className="text-white font-bold text-sm">{purgedCount} addresses</div>
        </div>
        <div className="bg-slate-950 p-2.5 border border-slate-800">
          <div className="text-slate-500 text-[10px] uppercase">Audit Status</div>
          <div className="text-emerald-400 font-bold text-sm">Purge Hash Committed</div>
        </div>
      </div>

      <div className="bg-slate-950 p-2.5 border border-slate-800">
        <div className="text-slate-500 text-[10px] uppercase mb-1">
          SHA-256 Purged Recipient Set Hash
        </div>
        <div className="text-amber-400 text-xs break-all">{setHash}</div>
      </div>
    </div>
  );
}
