"use client";

import React from "react";
import { clsx } from "clsx";
import { Check } from "lucide-react";

/** Large selectable cards (radio group semantics). */
export function RadioCards<K extends string>({
  name,
  value,
  onChange,
  options,
  className,
}: {
  name: string;
  value: K;
  onChange: (key: K) => void;
  options: { key: K; title: string; body: string; icon?: React.ComponentType<{ className?: string }> }[];
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={name} className={clsx("grid gap-3", className)}>
      {options.map((o) => {
        const selected = o.key === value;
        const Icon = o.icon;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.key)}
            className={clsx(
              "relative text-left rounded-[14px] px-4 py-3.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint",
              selected ? "neo-card-sm ring-[1.5px] ring-mint" : "neo-inset-sm hover:ring-1 hover:ring-line"
            )}
          >
            <span className="flex items-start gap-3">
              {Icon && (
                <span className={clsx("mt-0.5 shrink-0", selected ? "text-mint" : "text-faint")}>
                  <Icon className="w-[18px] h-[18px]" />
                </span>
              )}
              <span className="min-w-0">
                <span className={clsx("block text-[13px] font-semibold", selected ? "text-ink" : "text-ink-soft")}>{o.title}</span>
                <span className="block text-[11.5px] text-subtle leading-relaxed mt-0.5">{o.body}</span>
              </span>
            </span>
            {selected && (
              <span className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-mint text-white flex items-center justify-center">
                <Check className="w-2.5 h-2.5" strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Row of pill buttons, one selected. */
export function ChipGroup<K extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: K;
  onChange: (key: K) => void;
  options: { key: K; label: string }[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.key)}
            className={clsx(
              "h-8 px-3.5 rounded-full text-[12px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint",
              selected ? "bg-mint text-white shadow-[0_6px_14px_rgba(20,195,154,0.28)]" : "neo-btn text-ink-soft"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Checkbox with a title and supporting text, on an inset well. */
export function CheckRow({
  checked,
  onChange,
  title,
  children,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: React.ReactNode;
  children?: React.ReactNode;
  id: string;
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 neo-inset-sm rounded-xl px-4 py-3 cursor-pointer">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 accent-[rgb(20,195,154)] shrink-0"
      />
      <span className="text-[12.5px] text-ink-soft leading-relaxed">
        <strong className="text-ink font-semibold">{title}</strong>
        {children ? <> {children}</> : null}
      </span>
    </label>
  );
}

/** Numbered form section with a title and description. */
export function FormSection({
  step,
  title,
  description,
  children,
  aside,
}: {
  step: number;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="neo-card rounded-[18px] p-5 sm:p-6 space-y-5" aria-labelledby={`section-${step}`}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="w-7 h-7 rounded-lg neo-inset-sm flex items-center justify-center shrink-0 font-mono text-[12px] font-bold text-mint">
            {step}
          </span>
          <div>
            <h2 id={`section-${step}`} className="text-[15.5px] font-bold tracking-[-0.01em] text-ink">
              {title}
            </h2>
            {description && <p className="text-[12.5px] text-muted leading-relaxed mt-0.5">{description}</p>}
          </div>
        </div>
        {aside && <div className="shrink-0 pl-10 sm:pl-0">{aside}</div>}
      </div>
      {children}
    </section>
  );
}
