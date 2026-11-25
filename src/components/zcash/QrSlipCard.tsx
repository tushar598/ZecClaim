"use client";

import React from "react";
import { zecExact } from "@/lib/format";
import { LocalQrCode } from "./LocalQrCode";
import { Badge } from "@/components/ui/badge";

export interface QrSlipCardProps {
  cardId: string;
  amountZec: number;
  feeBufferZat: number;
  secretUri: string;
  isSplitCustody?: boolean;
  /** Sample slips (demo fixtures) carry a watermark so they can never be mistaken for real cards. */
  isSample?: boolean;
  className?: string;
}

/**
 * Printable gift-card slip. The QR encodes the bearer URI, which only ever exists in this
 * browser's memory. Print styles force black on white regardless of theme.
 */
export function QrSlipCard({
  cardId,
  amountZec,
  feeBufferZat,
  secretUri,
  isSplitCustody = false,
  isSample = false,
  className = "",
}: QrSlipCardProps) {
  return (
    <div
      className={`neo-card rounded-[16px] p-5 flex flex-col justify-between relative overflow-hidden min-h-[330px] print:shadow-none print:bg-white print:text-black print:border print:border-black print:rounded-none print:break-inside-avoid ${className}`}
    >
      {isSample && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-[30px] font-extrabold tracking-[0.2em] text-rose/25 -rotate-[24deg] select-none print:text-black/20"
        >
          SAMPLE
        </span>
      )}

      <div className="flex items-center justify-between pb-3 border-b border-line print:border-black">
        <span className="text-[12px] font-extrabold tracking-[0.05em] text-ink print:text-black">
          ZEC<span className="text-mint print:text-black">CLAIM</span>
        </span>
        <div className="flex items-center gap-1.5">
          <Badge variant={isSplitCustody ? "shielded" : "default"} className="print:bg-transparent print:text-black print:border-black">
            {isSplitCustody ? "DAO minted" : "Host minted"}
          </Badge>
          <span className="font-mono text-[12px] font-bold text-ink print:text-black">{cardId}</span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 my-4">
        <div className="bg-white p-2 rounded-xl">
          <LocalQrCode value={secretUri} size={150} title={`Zcash gift card ${cardId}`} />
        </div>
        <div className="text-center">
          <p className="font-mono tabular-nums text-[22px] font-bold text-ink print:text-black">{zecExact(Math.round(amountZec * 100_000_000))} ZEC</p>
          <p className="text-[11px] text-subtle print:text-black">
            plus {zecExact(feeBufferZat)} ZEC sweep fee buffer
          </p>
        </div>
      </div>

      <div className="pt-3 border-t border-line print:border-black space-y-1 text-[11px] text-muted print:text-black">
        <p>
          Scan with <strong className="text-ink print:text-black">Vizor 0.0.57+</strong> or{" "}
          <strong className="text-ink print:text-black">Zodl 3.16+</strong>. Arrives in about 50 s (2 blocks).
        </p>
        <p>Your confirmation code is in the memo. Enter it at the receipt page.</p>
      </div>
    </div>
  );
}
