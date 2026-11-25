import React from "react";
import { cn as clsx } from "@/lib/cn";

/**
 * Status chips. Semantic mapping (docs/DESIGN_SYSTEM.md):
 * shielded = Verified Shielded, transparent = Rejected / dispute, sapling = warning / testnet,
 * chain = on-chain evidence (txid found by lightwalletd), ack = ACK Confirmed, clawback = Clawed Back, purged = PII Purged.
 */
export type BadgeVariant =
  | "shielded"
  | "transparent"
  | "sapling"
  | "warning"
  | "chain"
  | "ack"
  | "clawback"
  | "purged"
  | "default";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  shielded: "bg-mint/12 text-mint-deep border-mint/30",
  transparent: "bg-rose/10 text-rose-fg border-rose/25",
  sapling: "bg-amber/14 text-amber-fg border-amber/35",
  warning: "bg-amber/14 text-amber-fg border-amber/35",
  chain: "bg-cyan/12 text-cyan-fg border-cyan/30",
  ack: "bg-mint text-white border-mint",
  clawback: "bg-slate/12 text-slate-fg border-slate/25",
  purged: "bg-violet/12 text-violet-fg border-violet/25",
  default: "bg-neutral/12 text-neutral-fg border-neutral/25",
};

export function Badge({ className, variant = "default", children, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 px-2 py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.04em] rounded-md border leading-none whitespace-nowrap",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
