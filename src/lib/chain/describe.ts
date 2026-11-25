import type { ChainTxCheck, CompactTxShape } from "@/types";

/**
 * Client-safe helpers that turn a stored `ChainTxCheck` into plain statements.
 * They only ever restate what the node reported; nothing here infers amounts or recipients.
 */

/** Outputs that can carry a shielded payment: Sapling outputs plus Orchard / Ironwood actions. */
export function shieldedOutputCapacity(shape: CompactTxShape): number {
  return shape.saplingOutputs + shape.orchardActions + shape.ironwoodActions;
}

export function isFullyShielded(shape: CompactTxShape): boolean {
  return shape.transparentInputs === 0 && shape.transparentOutputs === 0;
}

export type CheckTone = "ok" | "warn" | "bad" | "neutral";

export function checkHeadline(check: ChainTxCheck | null | undefined): { label: string; tone: CheckTone } {
  if (!check) return { label: "Not checked", tone: "neutral" };
  switch (check.status) {
    case "MINED":
      return {
        label: `Mined at height ${check.height?.toLocaleString("en-US")} (${check.confirmations} confirmation${check.confirmations === 1 ? "" : "s"})`,
        tone: "ok",
      };
    case "MEMPOOL":
      return { label: "In the mempool, not mined yet", tone: "warn" };
    case "NOT_FOUND":
      return { label: check.note || `Not found on ${check.network}`, tone: "bad" };
    case "UNREACHABLE":
      return { label: "Not checked: lightwalletd unreachable", tone: "warn" };
    default:
      return { label: "Not checked", tone: "neutral" };
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function shapeSummary(shape: CompactTxShape | null | undefined): string | null {
  if (!shape) return null;
  const shielded: string[] = [];
  if (shape.ironwoodActions) shielded.push(plural(shape.ironwoodActions, "Ironwood action"));
  if (shape.orchardActions) shielded.push(plural(shape.orchardActions, "Orchard action"));
  if (shape.saplingOutputs) shielded.push(plural(shape.saplingOutputs, "Sapling output"));
  if (shape.saplingSpends) shielded.push(plural(shape.saplingSpends, "Sapling spend"));
  const transparent = isFullyShielded(shape)
    ? "no transparent inputs or outputs"
    : `${plural(shape.transparentInputs, "transparent input")}, ${plural(shape.transparentOutputs, "transparent output")}`;
  return [shielded.length ? shielded.join(", ") : "no shielded outputs", transparent].join("; ");
}

/**
 * Problems with a payout transaction recorded for a chunk of `recipients` shielded payments.
 * Empty list = consistent with the export (it cannot prove the amounts or addresses).
 */
export function payoutProblems(check: ChainTxCheck, recipients: number): string[] {
  const problems: string[] = [];
  if (check.status === "NOT_FOUND") problems.push(`Transaction not found on ${check.network}`);
  if (!check.shape) return problems;
  const capacity = shieldedOutputCapacity(check.shape);
  if (capacity < recipients) {
    problems.push(`Has room for ${plural(capacity, "shielded output")} but the chunk pays ${plural(recipients, "recipient")}`);
  }
  if (check.shape.transparentOutputs > 0) problems.push(`Creates ${plural(check.shape.transparentOutputs, "transparent output")}`);
  if (check.shape.transparentInputs > 0) problems.push(`Spends ${plural(check.shape.transparentInputs, "transparent input")} (publicly linkable funding)`);
  return problems;
}

export function shortTxid(txid: string): string {
  return txid.length > 20 ? `${txid.slice(0, 10)}...${txid.slice(-8)}` : txid;
}
