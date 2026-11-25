"use client";

import React, { useState } from "react";
import { AlertCircle, CheckCircle2, TriangleAlert } from "lucide-react";
import { inspectZcashAddress } from "@/lib/zcash/zip316";
import { Badge } from "@/components/ui/badge";

export interface AddressPreflightInputProps {
  value: string;
  onChange: (address: string, isValidShielded: boolean) => void;
  disabled?: boolean;
  expectedNetwork?: "testnet" | "mainnet";
}

/**
 * Live ZIP 316 preflight. Runs the exact decoder the API uses, on every keystroke, in the browser.
 */
export function AddressPreflightInput({
  value,
  onChange,
  disabled = false,
  expectedNetwork,
}: AddressPreflightInputProps) {
  const [touched, setTouched] = useState(false);
  const result = inspectZcashAddress(value, expectedNetwork);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    setTouched(true);
    const inspection = inspectZcashAddress(val, expectedNetwork);
    onChange(val, inspection.isValid && inspection.isShielded);
  };

  const placeholderText =
    expectedNetwork === "mainnet"
      ? "u1... shielded Unified Address"
      : expectedNetwork === "testnet"
      ? "utest1... shielded Unified Address"
      : "u1... or utest1...";

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="recipient-address" className="text-[11.5px] font-semibold text-subtle">
        Your shielded address
      </label>
      <input
        id="recipient-address"
        type="text"
        value={value}
        spellCheck={false}
        autoComplete="off"
        onChange={handleInputChange}
        placeholder={placeholderText}
        disabled={disabled}
        aria-invalid={touched && value ? !result.isValid : undefined}
        className="neo-field font-mono text-[12.5px] py-3"
      />

      {touched && value && (
        <div role="status" aria-live="polite" className="pt-1">
          {result.poolType === "TRANSPARENT_REJECTED" && (
            <div className="rounded-[10px] bg-rose/10 text-rose-fg px-3.5 py-3 text-[12.5px] space-y-1">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Transparent receiver blocked</span>
                <Badge variant="transparent">Rejected</Badge>
              </div>
              <p className="leading-relaxed">{result.errorMessage}</p>
            </div>
          )}

          {result.poolType === "SAPLING" && (
            <div className="rounded-[10px] bg-amber/14 text-amber-fg px-3.5 py-3 text-[12.5px] space-y-1">
              <div className="flex items-center gap-2 font-semibold">
                <TriangleAlert className="w-4 h-4 shrink-0" />
                <span>Legacy Sapling address</span>
                <Badge variant="sapling">Accepted</Badge>
              </div>
              <p className="leading-relaxed">{result.warningMessage}</p>
            </div>
          )}

          {result.poolType === "ORCHARD" && (
            <div className="rounded-[10px] bg-mint/12 text-mint-deep px-3.5 py-2.5 text-[12.5px] flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Verified shielded Unified Address (Orchard / Ironwood)
              </span>
              <span className="font-mono text-[11px]">ZIP 316</span>
            </div>
          )}

          {result.poolType === "INVALID" && (
            <div className="rounded-[10px] neo-inset-sm text-ink-soft px-3.5 py-2.5 text-[12.5px] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-px text-subtle" />
              <span>{result.errorMessage}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
