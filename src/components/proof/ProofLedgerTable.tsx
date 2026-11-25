import React from "react";
import { payoutReportLabel, zecExact } from "@/lib/format";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge, BadgeVariant } from "@/components/ui/badge";
import { CampaignProofData, ProofSlot, ProofVoucher } from "@/lib/proof/getProofData";
import { checkHeadline, shortTxid } from "@/lib/chain/describe";

const STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  UNCLAIMED: { label: "Unclaimed", variant: "default" },
  ACK_CONFIRMED: { label: "Confirmed", variant: "ack" },
  DISPUTED: { label: "Disputed", variant: "transparent" },
  CLAWED_BACK: { label: "Clawed back", variant: "clawback" },
  SUBMITTED: { label: "Address in", variant: "shielded" },
  LOCKED_FOR_BATCH: { label: "Exported, unpaid", variant: "warning" },
  BATCHED: { label: "Paid", variant: "chain" },
  PURGED: { label: "Address purged", variant: "purged" },
};

function cardEvidence(v: ProofVoucher): string {
  if (v.state === "CLAWED_BACK") return v.clawbackTxid ? `Clawback tx ${shortTxid(v.clawbackTxid)}` : "-";
  if (v.state !== "ACK_CONFIRMED") return "-";
  if (!v.sweepTxid) return "Memo code only";
  return `Sweep tx ${shortTxid(v.sweepTxid)}: ${checkHeadline(v.sweepCheck).label}`;
}

function slotEvidence(slot: ProofSlot): string {
  if (slot.payoutTxid) return `Run ${slot.batchRun ?? "?"} · payout tx ${shortTxid(slot.payoutTxid)}`;
  if (slot.batchRun) return `Run ${slot.batchRun} · no payout tx recorded`;
  return "-";
}

/**
 * Public ledger of every Lane 1 card and Lane 2 slot. Recipient addresses are never shown;
 * Lane 2 rows show only the receiver pool detected by ZIP 316 preflight.
 */
export function ProofLedgerTable({
  vouchers,
  slots,
  cardPlan = null,
}: {
  vouchers: ProofVoucher[];
  slots: ProofSlot[];
  cardPlan?: CampaignProofData["cardPlan"];
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-bold tracking-[-0.015em] text-ink">Ledger</h2>
          <p className="text-[12.5px] text-subtle mt-0.5">
            {vouchers.length} gift cards · {slots.length} claim slots. No recipient address is ever published here.
          </p>
          {cardPlan && (
            <p className="text-[12.5px] text-subtle mt-1">
              Card plan anchored with the campaign: {cardPlan.amountsZat.length} card{cardPlan.amountsZat.length === 1 ? "" : "s"} (
              <span className="font-mono text-ink-soft">{zecExact(cardPlan.totalZat)} ZEC</span>), {cardPlan.registeredCount} registered.
              {cardPlan.openZat.length > 0 && ` Open amounts still count as unallocated above.`}
            </p>
          )}
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Lane</TableHead>
            <TableHead className="text-right">Amount (ZEC)</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Evidence</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vouchers.map((v) => {
            const s = STATUS[v.state];
            return (
              <TableRow key={`v-${v.cardId}`}>
                <TableCell className="font-mono font-semibold text-ink">{v.cardId}</TableCell>
                <TableCell>{v.isSplitCustody ? "Lane 1 · DAO minted" : "Lane 1 · host minted"}</TableCell>
                <TableCell className="text-right font-mono tabular-nums font-semibold text-ink">
                  {zecExact(v.amountZat)}
                </TableCell>
                <TableCell>
                  <span className="flex flex-wrap gap-1.5">
                    <Badge variant={s.variant}>{s.label}</Badge>
                    {v.disputeReason && v.state !== "DISPUTED" && <Badge variant="transparent">Disputed</Badge>}
                  </span>
                </TableCell>
                <TableCell className="text-[11.5px] text-subtle">{cardEvidence(v)}</TableCell>
              </TableRow>
            );
          })}
          {slots.map((slot) => {
            const s = STATUS[slot.status];
            return (
              <TableRow key={`s-${slot.slotIndex}`}>
                <TableCell className="font-mono font-semibold text-ink">SLOT-{String(slot.slotIndex + 1).padStart(2, "0")}</TableCell>
                <TableCell>Lane 2 · claim link{slot.addressPoolType ? ` · ${slot.addressPoolType.toLowerCase()}` : ""}</TableCell>
                <TableCell className="text-right font-mono tabular-nums font-semibold text-ink">
                  {zecExact(slot.amountZat)}
                </TableCell>
                <TableCell>
                  <span className="flex flex-wrap gap-1.5">
                    <Badge variant={s.variant}>{s.label}</Badge>
                    {slot.status === "PURGED" && slot.payoutTxid && <Badge variant="chain">Paid</Badge>}
                    {slot.payoutReport && <Badge variant="transparent">{payoutReportLabel(slot.payoutReport)}</Badge>}
                  </span>
                </TableCell>
                <TableCell className="text-[11.5px] text-subtle">{slotEvidence(slot)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}
