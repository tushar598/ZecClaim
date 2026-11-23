import React from "react";
import { clsx } from "clsx";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  amberAccent?: boolean;
}

export function Card({ className, amberAccent = false, children, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        "bg-slate-900 border border-slate-800 p-6 rounded-none relative",
        amberAccent && "border-t-2 border-t-amber-500",
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
    <div className={clsx("mb-4 flex flex-col space-y-1", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={clsx("text-lg font-bold tracking-tight text-white", className)} {...props}>
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
    <p className={clsx("text-xs text-slate-400 leading-normal", className)} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("text-sm text-slate-300", className)} {...props}>
      {children}
    </div>
  );
}
