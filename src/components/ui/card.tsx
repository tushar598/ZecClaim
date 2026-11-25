import React from "react";
import { cn as clsx } from "@/lib/cn";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** "raised" neomorphic panel (default) or "inset" well */
  tone?: "raised" | "inset";
}

export function Card({ className, tone = "raised", children, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        "relative rounded-[16px]",
        tone === "raised" ? "neo-card" : "neo-inset",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("px-5 sm:px-6 pt-5 pb-3 flex flex-col gap-1", className)} {...props}>
      {children}
    </div>
  );
}

export function CardEyebrow({ className, children, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={clsx("text-[11.5px] font-semibold tracking-[0.04em] text-mint-hover", className)} {...props}>
      {children}
    </span>
  );
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={clsx("text-[17px] font-bold tracking-[-0.015em] text-ink", className)} {...props}>
      {children}
    </h3>
  );
}

export function CardDescription({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={clsx("text-[13px] text-muted leading-relaxed", className)} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("px-5 sm:px-6 pb-6 text-[13px] text-ink-soft", className)} {...props}>
      {children}
    </div>
  );
}
