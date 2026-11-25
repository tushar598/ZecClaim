import React from "react";
import { cn as clsx } from "@/lib/cn";

export function Label({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={clsx("block text-[11.5px] font-semibold text-subtle mb-1.5", className)} {...props}>
      {children}
    </label>
  );
}

export function Hint({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={clsx("text-[11.5px] text-subtle mt-1.5 leading-relaxed", className)} {...props}>
      {children}
    </p>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={clsx("neo-field", className)} {...props} />
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={clsx("neo-field leading-relaxed", className)} {...props} />
  )
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={clsx("neo-field cursor-pointer", className)} {...props}>
      {children}
    </select>
  )
);
Select.displayName = "Select";

/** Inline status banner (success / error / warning / info). */
export function Notice({
  tone = "info",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: "success" | "error" | "warning" | "info" }) {
  const tones = {
    success: "bg-mint/12 text-mint-deep",
    error: "bg-rose/10 text-rose-fg",
    warning: "bg-amber/14 text-amber-fg",
    info: "neo-inset-sm text-ink-soft",
  };
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={clsx("rounded-[10px] px-3.5 py-2.5 text-[12.5px] font-medium leading-relaxed", tones[tone], className)}
      {...props}
    >
      {children}
    </div>
  );
}
