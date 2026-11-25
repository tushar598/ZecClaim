/**
 * Display formatting (pure, client-safe).
 */

const ZAT_PER_ZEC = 100_000_000;

/** Exact ZEC amount with trailing zeros trimmed (at least 2 decimals): 19998800 -> "0.199988". */
export function zecExact(zat: number): string {
  const fixed = (zat / ZAT_PER_ZEC).toFixed(8);
  const trimmed = fixed.replace(/0+$/, "");
  const [whole, frac = ""] = trimmed.split(".");
  return `${Number(whole).toLocaleString("en-US")}.${frac.padEnd(2, "0")}`;
}

/** Plain ZEC amount for inputs and CSV cells (no thousands separator): 150000000000 -> "1500". */
export function zecPlain(zat: number): string {
  return (zat / ZAT_PER_ZEC).toFixed(8).replace(/\.?0+$/, "");
}

/** ZEC string (from a form) -> zatoshi, or null when it is not a positive amount with <= 8 decimals. */
export function parseZecToZat(input: string): number | null {
  const v = input.trim();
  if (!/^\d+(\.\d{1,8})?$/.test(v) && !/^\.\d{1,8}$/.test(v)) return null;
  const [whole, frac = ""] = v.split(".");
  const zat = Number(whole || "0") * ZAT_PER_ZEC + Number(frac.padEnd(8, "0"));
  return Number.isSafeInteger(zat) && zat > 0 ? zat : null;
}

/** Public label for a link holder's payout report. */
export function payoutReportLabel(reason: string | null | undefined): string {
  return reason === "WRONG_AMOUNT" ? "Reported wrong amount" : "Reported not received";
}

/** "Fri, 1 Dec 2026, 18:00" in the viewer's locale and time zone. */
export function formatDateTime(ms: number | string | Date): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(ms: number | string | Date): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** "in 3 days" / "2 h ago" style relative time. */
export function relativeTime(ms: number, now = Date.now()): string {
  const diff = ms - now;
  const abs = Math.abs(diff);
  const units: [number, string][] = [
    [86_400_000, "day"],
    [3_600_000, "hour"],
    [60_000, "minute"],
  ];
  for (const [size, name] of units) {
    if (abs >= size || name === "minute") {
      const n = Math.max(1, Math.round(abs / size));
      const label = `${n} ${name}${n === 1 ? "" : "s"}`;
      return diff >= 0 ? `in ${label}` : `${label} ago`;
    }
  }
  return "now";
}

export function heightLabel(height: number | null | undefined): string {
  return typeof height === "number" ? `#${height.toLocaleString("en-US")}` : "unknown";
}

/** Value for <input type="datetime-local"> in the viewer's time zone. */
export function toDateTimeLocalValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
