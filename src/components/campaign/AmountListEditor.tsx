"use client";

import React from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint, Input } from "@/components/ui/field";
import { parseZecToZat, zecExact } from "@/lib/format";

/** Splits pasted text (a spreadsheet column, a comma list) into separate amounts. */
function splitPasted(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((t) => t.trim().replace(",", "."))
    .filter(Boolean);
}

/**
 * One ZEC amount per row (claim link or gift card), in order. Pasting a column of amounts into
 * any row overwrites that row and the ones below it, adding rows as needed.
 */
export function AmountListEditor({
  values,
  onChange,
  itemLabel,
  max,
  idPrefix,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  /** "Link" or "Card": used in labels ("Link 3 amount") and the add button. */
  itemLabel: string;
  max: number;
  idPrefix: string;
}) {
  const totalZat = values.reduce((sum, v) => sum + (parseZecToZat(v) ?? 0), 0);
  const invalid = values.filter((v) => parseZecToZat(v) === null).length;
  const noun = itemLabel.toLowerCase();

  const setAt = (index: number, value: string) => onChange(values.map((v, i) => (i === index ? value : v)));

  const onPaste = (index: number) => (e: React.ClipboardEvent<HTMLInputElement>) => {
    const parts = splitPasted(e.clipboardData.getData("text"));
    if (parts.length < 2) return;
    e.preventDefault();
    // Like a spreadsheet: the pasted column overwrites this row and the ones below, adding rows as needed.
    const next = [...values];
    parts.forEach((part, k) => {
      next[index + k] = part;
    });
    onChange(next.slice(0, max));
  };

  return (
    <div className="space-y-2.5">
      <ol className="neo-inset-sm rounded-xl divide-y divide-line max-h-80 overflow-y-auto" aria-label={`${itemLabel} amounts`}>
        {values.map((value, i) => {
          const bad = value.trim() !== "" && parseZecToZat(value) === null;
          return (
            <li key={i} className="flex items-center gap-3 px-3 py-2">
              <label htmlFor={`${idPrefix}-${i}`} className="font-mono text-[11.5px] text-subtle w-16 shrink-0">
                {itemLabel} {i + 1}
              </label>
              <div className="relative flex-1 min-w-0">
                <Input
                  id={`${idPrefix}-${i}`}
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setAt(i, e.target.value.replace(",", ".").trim())}
                  onPaste={onPaste(i)}
                  placeholder="0.1"
                  className={`font-mono py-2 pr-12 ${bad ? "ring-1 ring-rose/60" : ""}`}
                  aria-invalid={bad}
                  autoComplete="off"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-faint pointer-events-none">ZEC</span>
              </div>
              <button
                type="button"
                onClick={() => onChange(values.filter((_, j) => j !== i))}
                disabled={values.length <= 1}
                aria-label={`Remove ${noun} ${i + 1}`}
                className="w-8 h-8 rounded-full neo-icon-btn flex items-center justify-center text-subtle hover:text-rose-fg disabled:opacity-35 disabled:pointer-events-none shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => onChange([...values, ""])} disabled={values.length >= max}>
          <Plus className="w-3.5 h-3.5" /> Add {noun}
        </Button>
        <p className="font-mono text-[12.5px] text-ink-soft" aria-live="polite">
          {values.length.toLocaleString("en-US")} {noun}
          {values.length === 1 ? "" : "s"} · {zecExact(totalZat)} ZEC
        </p>
      </div>
      <Hint className={invalid > 0 && values.some((v) => v.trim() !== "") ? "text-rose-fg mt-0" : "mt-0"}>
        {invalid > 0 && values.some((v) => v.trim() !== "")
          ? `${invalid} ${noun}${invalid === 1 ? " needs" : "s need"} a positive amount (up to 8 decimals).`
          : `Paste a column of amounts from a spreadsheet to fill several ${noun}s at once. Up to ${max.toLocaleString("en-US")}.`}
      </Hint>
    </div>
  );
}
