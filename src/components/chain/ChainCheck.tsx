import React from "react";
import type { ChainTxCheck } from "@/types";
import { Badge, BadgeVariant } from "@/components/ui/badge";
import { checkHeadline, shapeSummary } from "@/lib/chain/describe";

const TONE_VARIANT: Record<string, BadgeVariant> = { ok: "chain", warn: "warning", bad: "transparent", neutral: "default" };

function shortLabel(check: ChainTxCheck | null | undefined): string {
  if (!check) return "Not checked";
  switch (check.status) {
    case "MINED":
      return "On-chain";
    case "MEMPOOL":
      return "Mempool";
    case "NOT_FOUND":
      return "Not on chain";
    case "UNREACHABLE":
      return "Unchecked";
    default:
      return check.note?.startsWith("Demo fixture") ? "Demo fixture" : "Not checked";
  }
}

/** Compact status chip for a stored chain check. */
export function ChainCheckBadge({ check }: { check: ChainTxCheck | null | undefined }) {
  const { tone } = checkHeadline(check);
  return <Badge variant={TONE_VARIANT[tone]}>{shortLabel(check)}</Badge>;
}

/** One-line plain statement of what the node reported, plus the transaction shape when known. */
export function ChainCheckText({ check }: { check: ChainTxCheck | null | undefined }) {
  const { label } = checkHeadline(check);
  const shape = shapeSummary(check?.shape);
  const note = check?.status === "SKIPPED" ? check.note : null;
  return (
    <span className="text-[12px] text-muted leading-relaxed">
      {note ?? label}
      {shape ? <span className="text-subtle">. {shape[0].toUpperCase() + shape.slice(1)}.</span> : null}
      {check?.endpoint && check.status !== "SKIPPED" ? (
        <span className="text-subtle"> Checked via {check.endpoint}.</span>
      ) : null}
    </span>
  );
}
