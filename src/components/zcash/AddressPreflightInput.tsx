"use client";

import React, { useState } from "react";
import { inspectZcashAddress } from "@/lib/zcash/zip316";
import { Badge } from "@/components/ui/badge";

export interface AddressPreflightInputProps {
  value: string;
  onChange: (address: string, isValidShielded: boolean) => void;
  disabled?: boolean;
}

export function AddressPreflightInput({
  value,
  onChange,
  disabled = false,
}: AddressPreflightInputProps) {
  const [touched, setTouched] = useState(false);
  const result = inspectZcashAddress(value);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    setTouched(true);
    const inspection = inspectZcashAddress(val);
    onChange(val, inspection.isValid && inspection.isShielded);
  };

  return (
    <div className="flex flex-col space-y-2">
      <label className="text-xs font-mono uppercase tracking-wider text-slate-400">
        Recipient Shielded Zcash Address (ZIP 316)
      </label>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={handleInputChange}
          placeholder="Paste your shielded Unified Address (u1... or utest1...)"
          disabled={disabled}
          className="w-full bg-slate-950 border border-slate-700 px-3 py-2 text-sm font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500 rounded-none"
        />
      </div>

      {touched && value && (
        <div className="flex flex-col space-y-1.5 pt-1">
          {result.poolType === "TRANSPARENT_REJECTED" && (
            <div className="p-2.5 bg-rose-950/30 border border-rose-900 text-rose-300 text-xs">
              <div className="flex items-center space-x-2 mb-1">
                <Badge variant="transparent">REJECTED TRANSPARENT</Badge>
                <span className="font-semibold">Privacy Violation Blocked</span>
              </div>
              <p>{result.errorMessage}</p>
            </div>
          )}

          {result.poolType === "SAPLING" && (
            <div className="p-2.5 bg-amber-950/30 border border-amber-900 text-amber-300 text-xs">
              <div className="flex items-center space-x-2 mb-1">
                <Badge variant="sapling">LEGACY SAPLING</Badge>
                <span className="font-semibold">Upgrade Recommended</span>
              </div>
              <p>{result.warningMessage}</p>
            </div>
          )}

          {result.poolType === "ORCHARD" && (
            <div className="p-2.5 bg-emerald-950/30 border border-emerald-900 text-emerald-300 text-xs flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Badge variant="shielded">VERIFIED SHIELDED</Badge>
                <span>Modern Orchard Receiver Validated</span>
              </div>
              <span className="font-mono text-emerald-400 text-xs">ZIP 316 Compliant</span>
            </div>
          )}

          {result.poolType === "INVALID" && (
            <div className="p-2 bg-slate-900 border border-slate-800 text-slate-400 text-xs">
              {result.errorMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
