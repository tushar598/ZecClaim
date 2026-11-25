/**
 * Block height <-> wall-clock time conversions (pure, client-safe).
 *
 * NU7 targets 25-second blocks (ZIP 259). Organizers pick a clawback *date*; the server turns it
 * into a block height from the live chain tip and the tip block's own timestamp, so the estimate
 * does not depend on the visitor's clock. Heights are what the chain enforces; dates are always
 * shown as estimates.
 */

/** ZIP 259 NU7 target block spacing. */
export const BLOCK_SPACING_SECONDS = 25;

/** Earliest clawback the form and API accept: one hour after the tip (144 blocks). */
export const MIN_CLAWBACK_LEAD_MS = 60 * 60 * 1000;

/** Latest clawback accepted: one year ahead. */
export const MAX_CLAWBACK_LEAD_MS = 366 * 24 * 60 * 60 * 1000;

export interface TipReference {
  height: number;
  /** Tip block timestamp in milliseconds (falls back to "now" when the node does not report it). */
  timeMs: number;
}

/** First block height expected to be mined at or after `targetMs`. */
export function heightForTime(tip: TipReference, targetMs: number): number {
  const blocks = Math.ceil((targetMs - tip.timeMs) / (BLOCK_SPACING_SECONDS * 1000));
  return tip.height + Math.max(1, blocks);
}

/** Estimated wall-clock time (ms) at which `height` will be (or was) mined. */
export function timeForHeight(tip: TipReference, height: number): number {
  return tip.timeMs + (height - tip.height) * BLOCK_SPACING_SECONDS * 1000;
}

/** "about 3 days", "about 5 h", "about 40 min" for a number of blocks. */
export function blocksToDuration(blocks: number): string {
  return msToDuration(Math.max(0, blocks) * BLOCK_SPACING_SECONDS * 1000);
}

export function msToDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 120) return `about ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `about ${hours} h`;
  return `about ${Math.round(hours / 24)} days`;
}

/** Validates a requested clawback time against the tip. Returns an error message or null. */
export function clawbackTimeProblem(tip: TipReference, targetMs: number): string | null {
  if (!Number.isFinite(targetMs)) return "Pick a valid clawback date and time.";
  const lead = targetMs - tip.timeMs;
  if (lead < MIN_CLAWBACK_LEAD_MS) return "The clawback must be at least one hour in the future.";
  if (lead > MAX_CLAWBACK_LEAD_MS) return "The clawback must be within one year.";
  return null;
}
