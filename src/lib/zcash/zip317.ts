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

/**
 * Calculates exact ZIP 2009 transaction fee in zatoshi.
 */
export function calculateZip2009Fee(totalActions: number): number {
  const billableActions = Math.max(GRACE_ACTIONS_ZIP317, totalActions);
  return billableActions * MARGINAL_FEE_ZAT_ZIP2009;
}

/**
 * Chunks an array of recipient payments into batches of <= 300 actions.
 * Assuming 1 funding input and 1 change output (2 actions reserved for the funding wallet).
 */
export function chunkBatchPayouts(
  recipients: RecipientPayment[],
  maxActionsPerChunk: number = SAFE_CHUNK_ACTION_LIMIT
): PayoutChunk[] {
  if (recipients.length === 0) {
    return [];
  }

  // 1 input + 1 change note = 2 base actions
  const reservedActions = 2;
  const maxRecipientsPerChunk = Math.max(1, maxActionsPerChunk - reservedActions);

  const chunks: PayoutChunk[] = [];

  for (let i = 0; i < recipients.length; i += maxRecipientsPerChunk) {
    const slice = recipients.slice(i, i + maxRecipientsPerChunk);
    // Actions = max(inputs, outputs). With 1 input and (slice.length + 1) outputs:
    const actionsCount = slice.length + 1; // slice outputs + 1 change
    const feeZat = calculateZip2009Fee(actionsCount);
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
