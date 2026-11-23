import React from "react";
import { clsx } from "clsx";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    const baseClasses =
      "inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50 disabled:pointer-events-none rounded-none";

    const variantClasses = {
      primary: "bg-amber-500 text-slate-950 hover:bg-amber-400 font-semibold shadow-sm",
      secondary: "bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700",
      danger: "bg-rose-950/40 text-rose-300 hover:bg-rose-900/50 border border-rose-800",
      outline: "border border-slate-700 text-slate-300 hover:border-slate-500 bg-transparent",
    };

    const sizeClasses = {
      sm: "h-8 px-3 text-xs",
      md: "h-10 px-4 text-sm",
      lg: "h-12 px-6 text-base",
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
