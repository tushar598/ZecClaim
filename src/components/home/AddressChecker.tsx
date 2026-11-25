"use client";

import React, { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ScanSearch } from "lucide-react";
import { inspectZcashAddress } from "@/lib/zcash/zip316";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/misc";
import { ADDRESS_TEST_VECTORS } from "@/lib/demo/constants";

/**
 * Paste any Zcash address and see whether ZecClaim would accept it. Runs the same ZIP 316
 * decoder as the claim API, entirely in the browser. The network is read from the address.
 */
export function AddressChecker() {
  const [address, setAddress] = useState("");
  const inspection = useMemo(() => (address ? inspectZcashAddress(address) : null), [address]);
  const vectors = ADDRESS_TEST_VECTORS.testnet;

  return (
    <section id="check" aria-label="Address checker" className="neo-card rounded-[18px] px-5 sm:px-7 py-6 scroll-mt-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <IconTile tone="mint">
            <ScanSearch className="w-5 h-5" />
          </IconTile>
          <div>
            <h2 className="text-[17px] font-bold tracking-[-0.015em] text-ink">Will my address be accepted?</h2>
            <p className="text-[12.5px] text-subtle">The same ZIP 316 check claim links run. In your browser; nothing is sent.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11.5px] font-medium" aria-label="Example addresses">
          <span className="text-subtle">Examples:</span>
          <button type="button" className="text-mint-hover hover:text-mint-deep" onClick={() => setAddress(vectors.validShielded)}>
            Shielded
          </button>
          <button type="button" className="text-ink-soft hover:text-ink" onClick={() => setAddress(vectors.rejectedTransparent)}>
            Transparent
          </button>
          <button type="button" className="text-ink-soft hover:text-ink" onClick={() => setAddress(vectors.rejectedMixed)}>
            Mixed UA
          </button>
        </div>
      </div>

      <label htmlFor="overview-address" className="sr-only">
        Zcash address
      </label>
      <input
        id="overview-address"
        type="text"
        spellCheck={false}
        autoComplete="off"
        value={address}
        onChange={(e) => setAddress(e.target.value.trim())}
        placeholder="Paste a u1... (mainnet) or utest1... (testnet) address"
        className="mt-5 w-full bg-transparent border-b-2 border-line focus:border-mint py-2.5 font-mono text-[13px] font-medium text-ink placeholder:text-faint focus:outline-none transition-colors"
      />

      {inspection && (
        <div
          role="status"
          aria-live="polite"
          className={`mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg px-3.5 py-3 text-[12.5px] font-medium ${
            inspection.isValid
              ? inspection.warningMessage
                ? "bg-amber/14 text-amber-fg"
                : "bg-mint/12 text-mint-deep"
              : "bg-rose/10 text-rose-fg"
          }`}
        >
          <span className="flex items-start gap-2">
            {inspection.isValid ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-px" />}
            <span>
              {inspection.isValid
                ? inspection.warningMessage ||
                  `Accepted: shielded Unified Address with an Orchard receiver${inspection.network ? ` (${inspection.network})` : ""}.`
                : inspection.errorMessage}
            </span>
          </span>
          {inspection.receivers.length > 0 && (
            <span className="flex flex-wrap gap-1.5 shrink-0">
              {inspection.receivers.map((r, i) => (
                <Badge
                  key={i}
                  variant={r.typecode <= 1 ? "transparent" : r.typecode === 2 ? "sapling" : r.typecode === 3 ? "shielded" : "default"}
                >
                  {r.typeName}
                </Badge>
              ))}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
