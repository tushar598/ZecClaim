"use client";

import React from "react";
import { cn as clsx } from "@/lib/cn";

export interface TabItem<K extends string> {
  key: K;
  label: React.ReactNode;
}

/** Underline tab bar with the mint active indicator (reference "dock" tabs). */
export function UnderlineTabs<K extends string>({
  tabs,
  active,
  onChange,
  className,
  ariaLabel,
}: {
  tabs: TabItem<K>[];
  active: K;
  onChange: (key: K) => void;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={clsx("flex items-center gap-6 sm:gap-8 border-b border-line overflow-x-auto", className)}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={clsx(
              "relative pb-3.5 text-[13px] whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint rounded-t",
              isActive ? "font-semibold text-ink" : "font-medium text-subtle hover:text-ink-soft"
            )}
          >
            {tab.label}
            {isActive && (
              <span aria-hidden="true" className="absolute bottom-[-1px] left-0 right-0 h-[2.5px] rounded-full bg-mint" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Small segmented switch on an inset well (reference period / language switchers). */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { key: K; label: React.ReactNode }[];
  value: K;
  onChange: (key: K) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="neo-inset-sm p-0.5 rounded-lg inline-flex items-center">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={o.key === value}
          onClick={() => onChange(o.key)}
          className={clsx(
            "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all whitespace-nowrap",
            o.key === value ? "bg-surface text-ink shadow-[0_1px_3px_rgba(0,0,0,0.18)]" : "text-subtle hover:text-ink"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
