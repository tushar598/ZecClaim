"use client";

import type { CampaignLane, ZcashNetwork } from "@/types";

/**
 * Browser-side organizer state. Nothing here is sent anywhere.
 *
 * - "My campaigns": campaigns created or opened in this browser, so the organizer can find
 *   them again (there is deliberately no public campaign directory).
 * - Organizer secrets: kept for this tab only (sessionStorage) unless the organizer chooses
 *   "remember on this device" (localStorage). The server only has a peppered hash.
 *
 * Every storage access is wrapped: private windows and blocked storage must not break pages.
 */

export interface RememberedCampaign {
  campaignId: string;
  title: string;
  network: ZcashNetwork;
  lane: CampaignLane;
  savedAt: string;
  isDemo?: boolean;
}

const CAMPAIGNS_KEY = "zecclaim_campaigns";
const secretKey = (id: string) => `zecclaim_secret_${id}`;
export const CAMPAIGNS_EVENT = "zecclaim:campaigns";

function read<T>(storage: () => Storage, key: string, fallback: T): T {
  try {
    const raw = storage().getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function listRememberedCampaigns(): RememberedCampaign[] {
  const list = read<RememberedCampaign[]>(() => localStorage, CAMPAIGNS_KEY, []);
  return Array.isArray(list) ? list.filter((c) => c && typeof c.campaignId === "string") : [];
}

export function rememberCampaign(c: Omit<RememberedCampaign, "savedAt">) {
  try {
    const rest = listRememberedCampaigns().filter((x) => x.campaignId !== c.campaignId);
    const next = [{ ...c, savedAt: new Date().toISOString() }, ...rest].slice(0, 50);
    localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CAMPAIGNS_EVENT));
  } catch {
    // Storage unavailable: the campaign still works through its links.
  }
}

export function forgetCampaign(campaignId: string) {
  try {
    const next = listRememberedCampaigns().filter((x) => x.campaignId !== campaignId);
    localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(next));
    clearSecret(campaignId);
    window.dispatchEvent(new Event(CAMPAIGNS_EVENT));
  } catch {
    // ignore
  }
}

export function saveSecret(campaignId: string, secret: string, remember: boolean) {
  try {
    sessionStorage.setItem(secretKey(campaignId), secret);
    if (remember) localStorage.setItem(secretKey(campaignId), secret);
    else localStorage.removeItem(secretKey(campaignId));
  } catch {
    // ignore
  }
}

export function loadSecret(campaignId: string): { secret: string; remembered: boolean } | null {
  try {
    const remembered = localStorage.getItem(secretKey(campaignId));
    if (remembered) return { secret: remembered, remembered: true };
    const session = sessionStorage.getItem(secretKey(campaignId));
    return session ? { secret: session, remembered: false } : null;
  } catch {
    return null;
  }
}

export function clearSecret(campaignId: string) {
  try {
    localStorage.removeItem(secretKey(campaignId));
    sessionStorage.removeItem(secretKey(campaignId));
  } catch {
    // ignore
  }
}

/** Saves text as a file download (links backup, scripts). */
export function downloadText(filename: string, text: string, type = "text/plain") {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
