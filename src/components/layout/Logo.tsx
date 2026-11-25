import React from "react";

/** ZEC (charcoal chip) + CLAIM (mint) wordmark, after the reference EASY PAY lockup. */
export function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  const isSm = size === "sm";
  return (
    <span className="inline-flex items-center gap-2 select-none whitespace-nowrap shrink-0">
      <span
        className={`inline-flex items-center justify-center rounded-[5px] bg-chip font-extrabold tracking-[0.06em] text-chip-fg ${
          isSm ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[13px]"
        }`}
      >
        ZEC
      </span>
      <span className={`font-extrabold tracking-[0.05em] text-mint ${isSm ? "text-[14px]" : "text-[17px]"}`}>CLAIM</span>
    </span>
  );
}
