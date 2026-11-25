import React from "react";
import { cn as clsx } from "@/lib/cn";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * primary: signature mint-outlined neomorphic CTA (fills mint on hover)
   * solid: filled mint, for the single most important action on a screen
   * secondary: raised neutral neomorphic button
   * outline: flat bordered button for low-emphasis actions
   * danger: rose-outlined destructive action
   * ghost: text-only
   */
  variant?: "primary" | "solid" | "secondary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    const baseClasses =
      "inline-flex items-center justify-center font-semibold tracking-[-0.01em] whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-45 disabled:pointer-events-none cursor-pointer";

    const variantClasses = {
      primary: "neo-btn-mint",
      solid:
        "bg-mint text-white shadow-[0_10px_22px_rgba(20,195,154,0.32)] hover:bg-mint-hover transition-colors",
      secondary: "neo-btn text-ink",
      outline:
        "bg-transparent border border-line text-ink-soft hover:border-mint hover:text-mint-hover transition-colors",
      danger: "neo-btn-danger",
      ghost: "bg-transparent text-muted hover:text-ink hover:bg-ink/[0.05] transition-colors",
    };

    const sizeClasses = {
      sm: "h-8 px-3.5 text-xs gap-1.5 rounded-[9px]",
      md: "h-10 px-5 text-[13px] gap-2 rounded-[10px]",
      lg: "h-12 px-8 text-[14px] gap-2 rounded-[10px]",
    };

    return (
      <button
        ref={ref}
        className={clsx(baseClasses, variantClasses[variant], sizeClasses[size], className)}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

/** Anchor styled as a Button (for navigation). */
export function ButtonLink({
  className,
  variant = "primary",
  size = "md",
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & Pick<ButtonProps, "variant" | "size">) {
  const variantClasses = {
    primary: "neo-btn-mint",
    solid: "bg-mint text-white shadow-[0_10px_22px_rgba(20,195,154,0.32)] hover:bg-mint-hover transition-colors",
    secondary: "neo-btn text-ink",
    outline:
      "bg-transparent border border-line text-ink-soft hover:border-mint hover:text-mint-hover transition-colors",
    danger: "neo-btn-danger",
    ghost: "bg-transparent text-muted hover:text-ink hover:bg-ink/[0.05] transition-colors",
  };
  const sizeClasses = {
    sm: "h-8 px-3.5 text-xs gap-1.5 rounded-[9px]",
    md: "h-10 px-5 text-[13px] gap-2 rounded-[10px]",
    lg: "h-12 px-8 text-[14px] gap-2 rounded-[10px]",
  };
  return (
    <a
      className={clsx(
        "inline-flex items-center justify-center font-semibold tracking-[-0.01em] whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  );
}
