import { RecipientPayment, PayoutChunk } from "@/types";
import { buildZip321Uri } from "./zip321";

/**
 * Pure TypeScript ZIP 317 & ZIP 2009 Fee Calculator & Batch Chunker
 * Standards:
 * - ZIP 259: 330 actions per block cap (NU7)
 * - ZIP 2009: 1,000 zatoshi marginal fee per action
 * - ZIP 317: 2 grace actions minimum
 *
 * Safe Chunk Cap: <= 300 actions per transaction
 */

export const NU7_BLOCK_ACTION_LIMIT = 330;
export const SAFE_CHUNK_ACTION_LIMIT = 300;
export const MARGINAL_FEE_ZAT_ZIP2009 = 1000;
export const GRACE_ACTIONS_ZIP317 = 2;
export const MINIMUM_SWEEP_FEE_ZAT = 2000;

/**
 * Calculates exact ZIP 2009 transaction fee in zatoshi.
 * Supports configurable fee margin / transition buffer for older wallet compatibility.
 */
export function calculateZip2009Fee(totalActions: number, feeMarginZat: number = 0): number {
  const billableActions = Math.max(GRACE_ACTIONS_ZIP317, totalActions);
  return billableActions * MARGINAL_FEE_ZAT_ZIP2009 + feeMarginZat;
}

/**
 * Estimates the total ZIP 2009 fee for paying `recipientCount` recipients with the same
 * chunking rules as chunkBatchPayouts (each chunk: recipients + 1 change action).
 * Lets budgets reserve fees before any address is known.
 */
export function estimateBatchFeeZat(
  recipientCount: number,
  maxActionsPerChunk: number = SAFE_CHUNK_ACTION_LIMIT,
  reservedActions: number = 2
): number {
  if (recipientCount <= 0) return 0;
  const perChunk = Math.max(1, maxActionsPerChunk - reservedActions);
  let fee = 0;
  for (let remaining = recipientCount; remaining > 0; remaining -= perChunk) {
    const inChunk = Math.min(perChunk, remaining);
    fee += calculateZip2009Fee(inChunk + (reservedActions > 0 ? 1 : 0));
  }
  return fee;
}

/** Number of transactions (chunks) needed for `recipientCount` recipients. */
export function countBatchChunks(recipientCount: number, maxActionsPerChunk = SAFE_CHUNK_ACTION_LIMIT, reservedActions = 2): number {
  if (recipientCount <= 0) return 0;
  return Math.ceil(recipientCount / Math.max(1, maxActionsPerChunk - reservedActions));
}

/**
 * Chunks an array of recipient payments into batches of <= 300 actions.
 * Assuming funding inputs and change output (default 2 actions reserved for the funding wallet).
 */
export function chunkBatchPayouts(
  recipients: RecipientPayment[],
  maxActionsPerChunk: number = SAFE_CHUNK_ACTION_LIMIT,
  reservedActions: number = 2,
  feeMarginZat: number = 0
): PayoutChunk[] {
  if (maxActionsPerChunk > NU7_BLOCK_ACTION_LIMIT) {
    throw new Error(
      `maxActionsPerChunk (${maxActionsPerChunk}) cannot exceed NU7 block limit (${NU7_BLOCK_ACTION_LIMIT} actions)`
    );
  }

  if (recipients.length === 0) {
    return [];
  }

  const maxRecipientsPerChunk = Math.max(1, maxActionsPerChunk - reservedActions);
  const chunks: PayoutChunk[] = [];

  for (let i = 0; i < recipients.length; i += maxRecipientsPerChunk) {
    const slice = recipients.slice(i, i + maxRecipientsPerChunk);
    // Actions = max(inputs, outputs). With reserved actions and (slice.length + 1) outputs:
    const actionsCount = slice.length + (reservedActions > 0 ? 1 : 0);
    const feeZat = calculateZip2009Fee(actionsCount, feeMarginZat);
    const uri = buildZip321Uri(slice);

    chunks.push({
      batchIndex: chunks.length,
      recipients: slice,
      actionsCount,
      estimatedFeeZat: feeZat,
      zip321Uri: uri,
    });
  }

  return chunks;
}
