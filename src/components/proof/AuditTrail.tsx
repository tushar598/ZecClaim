import React from "react";
import {
  Anchor,
  BadgeCheck,
  Eraser,
  Flag,
  KeyRound,
  Layers,
  Link2,
  RotateCcw,
  Send,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProofAuditEvent } from "@/lib/proof/getProofData";
import { AuditEventType } from "@/types";

const META: Record<AuditEventType, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  CAMPAIGN_ANCHORED: { icon: Anchor, label: "Anchored" },
  FUNDING_CHECKED: { icon: Link2, label: "Chain" },
  SLOT_CLAIMED: { icon: UserCheck, label: "Claim" },
  ACK_VERIFIED: { icon: BadgeCheck, label: "ACK" },
  DISPUTE_FLAGGED: { icon: Flag, label: "Dispute" },
  BATCH_LOCKED: { icon: Layers, label: "Batch" },
  PAYOUT_RECORDED: { icon: Send, label: "Payout" },
  PII_SCRUBBED: { icon: Eraser, label: "Scrub" },
  CLAWBACK_RECONCILED: { icon: RotateCcw, label: "Clawback" },
  LINKS_REISSUED: { icon: KeyRound, label: "Links" },
};

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const count = (v: unknown, word: string) => `${str(v)} ${word}${Number(v) === 1 ? "" : "s"}`;
const POOL: Record<string, string> = { ORCHARD: "an Orchard", IRONWOOD: "an Ironwood", SAPLING: "a Sapling" };

function describe(e: ProofAuditEvent): string {
  const d = e.details;
  switch (e.eventType) {
    case "CAMPAIGN_ANCHORED":
      return d.kind === "VOUCHERS_IMPORTED"
        ? `${str(d.cardsImportedCount)} gift cards registered`
        : "Campaign registered with its viewing key and funding txid";
    case "SLOT_CLAIMED":
      return d.importedVia
        ? `${count(d.validShieldedCount, "recipient")} imported, ${str(d.rejectedCount)} rejected by preflight`
        : `Slot ${Number(d.slotIndex ?? 0) + 1} claimed with ${POOL[str(d.addressPoolType)] ?? "a shielded"} address`;
    case "FUNDING_CHECKED":
      return `Funding transaction checked on-chain: ${str(d.status).toLowerCase().replace("_", " ")}`;
    case "ACK_VERIFIED": {
      const evidence = d.sweepEvidence === "MINED" ? " with an on-chain sweep tx" : "";
      return d.afterDispute
        ? `${str(d.cardId)} receipt confirmed after a dispute${evidence}`
        : `${str(d.cardId)} receipt confirmed${evidence}`;
    }
    case "DISPUTE_FLAGGED":
      if (d.kind === "PAYOUT_REPORT") {
        return `Claim link ${Number(d.slotIndex) + 1}: recipient reports ${d.reason === "WRONG_AMOUNT" ? "a different amount" : "nothing received"} for payout ${str(d.payoutTxid).slice(0, 10)}...`;
      }
      return `${str(d.cardId)} reported already empty: ${str(d.reason)}`;
    case "PAYOUT_RECORDED": {
      const problems = Array.isArray(d.problems) ? d.problems.length : 0;
      return `Batch run ${str(d.batchRun)} paid: ${count(d.recipients, "recipient")} in ${Array.isArray(d.txids) ? d.txids.length : 1} tx${problems ? `, ${problems} problem(s) flagged` : ""}`;
    }
    case "BATCH_LOCKED":
      return `Batch run ${str(d.batchRun || 1)} exported: ${count(d.totalRecipients, "recipient")}, ${str(d.totalChunks)} tx, ${str(d.totalFeeZat)} zat fee`;
    case "PII_SCRUBBED":
      return `${str(d.addressesPurgedCount)} recipient ${Number(d.addressesPurgedCount) === 1 ? "address" : "addresses"} purged`;
    case "CLAWBACK_RECONCILED":
      return `${count(d.cardsClawedBackCount, "unclaimed card")} clawed back${d.simulated ? "" : " (expiry and txid checked on-chain)"}`;
    case "LINKS_REISSUED":
      return `${count(d.reissuedCount, "unused claim link")} reissued by the organizer (old links revoked)`;
    default:
      return e.eventType;
  }
}

export function AuditTrail({ events }: { events: ProofAuditEvent[] }) {
  return (
    <section className="neo-card rounded-[18px] px-6 py-5">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-line">
        <h2 className="text-[17px] font-bold tracking-[-0.015em] text-ink">Audit trail</h2>
        <span className="text-[11.5px] text-subtle">{events.length} most recent events</span>
      </div>
      <ul className="divide-y divide-line">
        {events.map((e, i) => {
          const meta = META[e.eventType];
          const Icon = meta.icon;
          return (
            <li key={i} className="py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-8 h-8 rounded-lg neo-icon-btn flex items-center justify-center shrink-0 text-mint">
                  <Icon className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-ink truncate">{describe(e)}</p>
                  <p className="text-[11.5px] text-subtle font-mono truncate">
                    {new Date(e.timestamp).toISOString().replace("T", " ").slice(0, 16)} UTC
                    {e.blockHeight ? ` · block #${e.blockHeight.toLocaleString("en-US")}` : ""}
                  </p>
                </div>
              </div>
              <span className="flex items-center gap-1.5 shrink-0">
                {e.details.simulated === true && <Badge variant="warning">Simulated</Badge>}
                <Badge variant="default">{meta.label}</Badge>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
