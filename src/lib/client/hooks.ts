"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ZcashNetwork } from "@/types";
import { CAMPAIGNS_EVENT, listRememberedCampaigns, RememberedCampaign } from "@/lib/client/organizer";

export interface LiveTip {
  height: number | null;
  timeMs: number | null;
  note: string | null;
  loading: boolean;
  /** Local time when this reading was fetched. */
  fetchedAt: number | null;
}

/** Live chain tip from our API (lightwalletd), refreshed every `intervalMs` while the tab is visible. */
export function useChainTip(network: ZcashNetwork | undefined | null, intervalMs = 30_000): LiveTip {
  const [tip, setTip] = useState<LiveTip>({ height: null, timeMs: null, note: null, loading: true, fetchedAt: null });

  useEffect(() => {
    if (!network) return;
    let cancelled = false;
    const load = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const res = await fetch(`/api/chain/tip?network=${network}`, { cache: "no-store" });
        const j = await res.json();
        if (cancelled) return;
        setTip({
          height: typeof j.height === "number" ? j.height : null,
          timeMs: typeof j.timeMs === "number" ? j.timeMs : null,
          note: j.note ?? (res.ok ? null : j.error ?? "Unavailable"),
          loading: false,
          fetchedAt: Date.now(),
        });
      } catch {
        if (!cancelled) setTip((t) => ({ ...t, loading: false, note: "Network error" }));
      }
    };
    setTip({ height: null, timeMs: null, note: null, loading: true, fetchedAt: null });
    load();
    const id = setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [network, intervalMs]);

  return tip;
}

/** Calls `fn` now and every `intervalMs` while the tab is visible; returns a manual trigger. */
export function usePolling(fn: () => Promise<void> | void, intervalMs: number, enabled = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState === "visible") void ref.current();
    };
    const id = setInterval(tick, intervalMs);
    const onVisible = () => document.visibilityState === "visible" && void ref.current();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, enabled]);
  return useCallback(() => ref.current(), []);
}

/** Campaigns remembered in this browser, kept in sync across components and tabs. */
export function useRememberedCampaigns(): RememberedCampaign[] | null {
  const [list, setList] = useState<RememberedCampaign[] | null>(null);
  useEffect(() => {
    const load = () => setList(listRememberedCampaigns());
    load();
    window.addEventListener(CAMPAIGNS_EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(CAMPAIGNS_EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, []);
  return list;
}
