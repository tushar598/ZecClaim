import React from "react";
import { clsx } from "clsx";

export function Table({ className, children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto border border-slate-800 rounded-none">
      <table className={clsx("w-full text-left text-xs text-slate-300", className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={clsx("bg-slate-900 border-b border-slate-800 text-slate-400 font-mono uppercase", className)}
      {...props}
    >
      {children}
    </thead>
  );
}

export function TableRow({ className, children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={clsx("border-b border-slate-800/60 hover:bg-slate-900/50 transition-colors", className)} {...props}>
      {children}
    </tr>
  );
}

export function TableHead({ className, children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={clsx("px-4 py-3 font-medium", className)} {...props}>
      {children}
    </th>
  );
}

export function TableCell({ className, children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={clsx("px-4 py-3 font-mono", className)} {...props}>
      {children}
    </td>
  );
}
