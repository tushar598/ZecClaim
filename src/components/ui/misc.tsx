"use client";

import React, { useEffect, useState } from "react";
import { cn as clsx } from "@/lib/cn";
import { Check, Copy, X } from "lucide-react";

/** Metric tile: label over a large mono value (reference balance / stat tiles). */
export function StatTile({
  label,
  value,
  hint,
  tone = "ink",
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "ink" | "mint" | "rose" | "cyan" | "amber" | "violet" | "slate";
  className?: string;
}) {
  const tones = {
    ink: "text-ink",
    mint: "text-mint-deep",
    rose: "text-rose-fg",
    cyan: "text-cyan-fg",
    amber: "text-amber-fg",
    violet: "text-violet-fg",
    slate: "text-slate-fg",
  };
  return (
    <div className={clsx("neo-card-sm rounded-[14px] px-4 py-3.5", className)}>
      <p className="text-[11.5px] font-medium text-subtle">{label}</p>
      <p className={clsx("font-mono tabular-nums text-[20px] font-bold mt-1 leading-tight", tones[tone])}>{value}</p>
      {hint && <p className="text-[11px] text-subtle mt-1">{hint}</p>}
    </div>
  );
}

/** Icon tile used in lists and section headers. */
export function IconTile({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "mint" | "ink";
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "neo-icon-btn w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
        tone === "mint" ? "text-mint" : tone === "ink" ? "text-ink" : "text-muted",
        className
      )}
    >
      {children}
    </span>
  );
}

export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <button
      type="button"
      aria-label={`${label}`}
      title={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          // Clipboard unavailable (non-HTTPS or denied); leave state unchanged.
        }
      }}
      className={clsx(
        "neo-icon-btn w-8 h-8 rounded-lg inline-flex items-center justify-center text-muted hover:text-mint shrink-0",
        className
      )}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-mint" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

/** Labelled monospace value with a copy button (keys, txids, addresses). */
export function KeyValueRow({
  label,
  value,
  copy = true,
  wrap = false,
}: {
  label: React.ReactNode;
  value: string;
  copy?: boolean;
  wrap?: boolean;
}) {
  return (
    <div className="neo-inset-sm rounded-xl px-4 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] text-subtle">{label}</p>
        <p
          className={clsx(
            "font-mono tabular-nums text-[12px] font-semibold text-ink mt-0.5",
            wrap ? "break-all" : "truncate"
          )}
          title={value}
        >
          {value}
        </p>
      </div>
      {copy && <CopyButton value={value} label={`Copy ${typeof label === "string" ? label : "value"}`} />}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  maxWidth = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0F14]/45 backdrop-blur-[3px] p-4"
      onClick={onClose}
    >
      <div
        className={clsx("neo-shell w-full rounded-[20px] p-6 relative animate-fade-up", maxWidth)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            {icon && <IconTile tone="mint">{icon}</IconTile>}
            <div>
              <h3 className="text-[17px] font-bold text-ink">{title}</h3>
              {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="neo-icon-btn w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-ink"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Page heading block used at the top of every workspace view. */
export function PageHeading({
  eyebrow,
  title,
  description,
  badges,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 animate-fade-up">
      <div className="min-w-0">
        {(eyebrow || badges) && (
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {eyebrow && <span className="text-[12px] font-semibold tracking-[0.04em] text-mint-hover">{eyebrow}</span>}
            {badges}
          </div>
        )}
        <h1 className="text-[24px] sm:text-[26px] font-bold tracking-[-0.02em] text-ink leading-tight [text-wrap:balance]">
          {title}
        </h1>
        {description && <p className="text-[14px] text-muted mt-1.5 max-w-2xl leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5 shrink-0">{actions}</div>}
    </div>
  );
}
