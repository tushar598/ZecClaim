"use client";

import React from "react";
import { Hint, Input, Label } from "@/components/ui/field";
import { Segmented } from "@/components/ui/tabs";
import { AmountListEditor } from "@/components/campaign/AmountListEditor";
import type { AmountMode } from "@/lib/campaign/amountPlan";
import { parseZecToZat, zecExact, zecPlain } from "@/lib/format";

export interface AmountFieldsState {
  mode: AmountMode;
  count: string;
  fixedZec: string;
  custom: string[];
}

/**
 * Amount choice for a list of items (claim links or gift cards): split the budget evenly, the
 * same amount on each, or one amount per item. `amountsZat` is the resolved plan (null while
 * incomplete) and drives the "each gets" preview and the prefill when switching to custom.
 */
export function AmountSpecFields({
  idPrefix,
  item,
  countLabel,
  max,
  state,
  onChange,
  amountsZat,
  splitNote,
}: {
  idPrefix: string;
  /** Singular noun: "link" or "card". */
  item: string;
  countLabel: string;
  max: number;
  state: AmountFieldsState;
  onChange: (next: AmountFieldsState) => void;
  amountsZat: number[] | null;
  /** Shown under the split preview, e.g. what the split is taken from. */
  splitNote?: string;
}) {
  const Item = item[0].toUpperCase() + item.slice(1);
  const count = Number.parseInt(state.count, 10);
  const countValid = Number.isInteger(count) && count >= 1 && count <= max;
  const fixedBad = state.fixedZec.length > 0 && parseZecToZat(state.fixedZec) === null;

  const setMode = (mode: AmountMode) => {
    if (mode === state.mode) return;
    if (mode === "custom") {
      // Start the list from what the current mode resolves to, so switching never loses the setup.
      const seed =
        state.custom.length > 0
          ? state.custom
          : amountsZat && amountsZat.length > 0
            ? amountsZat.map(zecPlain)
            : Array.from({ length: countValid ? Math.min(count, max) : 1 }, () => "");
      onChange({ ...state, mode, custom: seed });
      return;
    }
    // Leaving custom keeps the number of rows as the count.
    onChange({ ...state, mode, count: state.mode === "custom" && state.custom.length > 0 ? String(state.custom.length) : state.count });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Amount per {item}</Label>
        <Segmented
          ariaLabel={`Amount per ${item}`}
          value={state.mode}
          onChange={setMode}
          options={[
            { key: "split", label: "Split evenly" },
            { key: "fixed", label: "Fixed amount" },
            { key: "custom", label: `Custom per ${item}` },
          ]}
        />
      </div>

      {state.mode === "custom" ? (
        <AmountListEditor
          idPrefix={`${idPrefix}-amount`}
          itemLabel={Item}
          max={max}
          values={state.custom}
          onChange={(custom) => onChange({ ...state, custom })}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor={`${idPrefix}-count`}>{countLabel}</Label>
            <Input
              id={`${idPrefix}-count`}
              type="number"
              inputMode="numeric"
              min={1}
              max={max}
              value={state.count}
              onChange={(e) => onChange({ ...state, count: e.target.value })}
              className="font-mono"
              aria-invalid={!countValid}
            />
            {!countValid && <Hint className="text-rose-fg">Between 1 and {max.toLocaleString("en-US")}.</Hint>}
          </div>
          {state.mode === "fixed" ? (
            <div>
              <Label htmlFor={`${idPrefix}-fixed`}>ZEC per {item}</Label>
              <Input
                id={`${idPrefix}-fixed`}
                inputMode="decimal"
                value={state.fixedZec}
                onChange={(e) => onChange({ ...state, fixedZec: e.target.value.replace(",", ".").trim() })}
                placeholder="0.1"
                className="font-mono"
                aria-invalid={fixedBad}
              />
              {fixedBad && <Hint className="text-rose-fg">A positive amount, up to 8 decimals.</Hint>}
            </div>
          ) : (
            <div>
              <Label>Each {item} gets</Label>
              <p className="font-mono text-[13px] font-semibold text-ink mt-2.5">
                {amountsZat && amountsZat.length > 0 ? `${zecExact(amountsZat[0])} ZEC` : "-"}
              </p>
              {splitNote && <Hint>{splitNote}</Hint>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
