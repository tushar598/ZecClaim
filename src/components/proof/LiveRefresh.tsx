"use client";

import React, { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Link2, RefreshCw } from "lucide-react";

/**
 * Re-renders the (server) proof portal every minute while the tab is visible, so new claims,
 * payouts and confirmations show up without a reload. Also copies the page link for sharing.
 */
export function LiveRefresh({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [updated, setUpdated] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setUpdated(Date.now());
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      startTransition(() => router.refresh());
      setUpdated(Date.now());
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-[11.5px] text-subtle hidden sm:inline" aria-live="polite">
        {updated ? `Live · ${new Date(updated).toLocaleTimeString()}` : "Live"}
      </span>
      <button
        type="button"
        onClick={() => {
          startTransition(() => router.refresh());
          setUpdated(Date.now());
        }}
        className="neo-icon-btn w-8 h-8 rounded-lg inline-flex items-center justify-center text-muted hover:text-mint"
        aria-label="Refresh now"
        title="Refresh now"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${pending ? "animate-spin" : ""}`} />
      </button>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(window.location.href.split("?")[0]);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            // Clipboard unavailable.
          }
        }}
        className="neo-btn h-8 px-3 rounded-[9px] inline-flex items-center gap-1.5 text-xs font-semibold text-ink"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-mint" /> : <Link2 className="w-3.5 h-3.5" />}
        {copied ? "Copied" : "Copy link"}
      </button>
    </span>
  );
}
