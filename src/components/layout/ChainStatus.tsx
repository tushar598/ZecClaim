"use client";

import React from "react";
import { clsx } from "clsx";
import { useChainTip } from "@/lib/client/hooks";
import type { ZcashNetwork } from "@/types";

/**
 * Live chain height per network, read through our own API from lightwalletd. The dot is green
 * only when the node actually answered; nothing here is decorative.
 */
function Row({ network }: { network: ZcashNetwork }) {
  const tip = useChainTip(network, 60_000);
  const ok = tip.height !== null;
  return (
    <div className="flex items-center justify-between gap-3 text-[11.5px]" title={tip.note ?? undefined}>
      <span className="flex items-center gap-2 text-subtle">
        <span
          className={clsx(
            "w-1.5 h-1.5 rounded-full",
            tip.loading ? "bg-faint" : ok ? "bg-mint" : "bg-amber"
          )}
          aria-hidden="true"
        />
        {network === "testnet" ? "Testnet" : "Mainnet"}
      </span>
      <span className="font-mono tabular-nums text-ink-soft">
        {tip.loading ? "..." : ok ? `#${(tip.height as number).toLocaleString("en-US")}` : "offline"}
      </span>
    </div>
  );
}

export function ChainStatus({ className }: { className?: string }) {
  return (
    <div className={clsx("space-y-1.5", className)} aria-label="Live chain heights">
      <Row network="testnet" />
      <Row network="mainnet" />
    </div>
  );
}
