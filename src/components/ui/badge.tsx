import React from "react";
import { clsx } from "clsx";

export type BadgeVariant =
  | "shielded"
  | "transparent"
  | "sapling"
  | "nullifier"
  | "ack"
  | "clawback"
  | "purged"
  | "default";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = "default", children, ...props }: BadgeProps) {
  const baseClasses =
    "inline-flex items-center px-2 py-0.5 text-xs font-mono font-medium rounded-none border";

  const variantClasses = {
    shielded: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    transparent: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    sapling: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    nullifier: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
    ack: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    clawback: "bg-slate-500/10 text-slate-400 border-slate-600/40",
    purged: "bg-violet-500/10 text-violet-400 border-violet-500/30",
    default: "bg-slate-800 text-slate-300 border-slate-700",
  };

  return (
    <span className={clsx(baseClasses, variantClasses[variant], className)} {...props}>
      {children}
    </span>
  );
}
