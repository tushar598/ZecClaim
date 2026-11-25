import React from "react";
import type { Metadata } from "next";
import { Flag } from "lucide-react";
import { getCampaignProofData } from "@/lib/proof/getProofData";
import { ProofPortalHeader } from "@/components/proof/ProofPortalHeader";
import { LedgerCard } from "@/components/proof/LedgerCard";
import { ProofLedgerTable } from "@/components/proof/ProofLedgerTable";
import { ScrubAttestationCard } from "@/components/proof/ScrubAttestationCard";
import { AuditTrail } from "@/components/proof/AuditTrail";
import { OnChainCard } from "@/components/proof/OnChainCard";
import { ViewingKeyAuditCard } from "@/components/proof/ViewingKeyAuditCard";
import { JudgeSandboxStrip } from "@/components/proof/JudgeSandboxStrip";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { getChainTip } from "@/lib/chain/txCheck";
import { timeForHeight } from "@/lib/chain/blockTime";
import { shortTxid } from "@/lib/chain/describe";
import { payoutReportLabel, zecExact } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Proof portal" };

export interface ProofPageProps {
  params: Promise<{ campaignId: string }>;
}

export default async function ProofPortalPage({ params }: ProofPageProps) {
  const { campaignId } = await params;
  const proof = await getCampaignProofData(campaignId);

  if (!proof) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4 animate-fade-up">
        <Badge variant="transparent">Not found</Badge>
        <h1 className="text-[22px] font-bold text-ink">No campaign with this ID</h1>
        <p className="text-sm text-muted">
          Campaign <code className="font-mono text-ink">{campaignId}</code> is not registered on this ZecClaim instance.
        </p>
        <ButtonLink href="/campaigns" variant="secondary" size="sm">
          My campaigns
        </ButtonLink>
      </div>
    );
  }

  const disputed = proof.vouchers.filter((v) => v.disputeReason);
  const reported = proof.slots.filter((s) => s.payoutReport);
  // Live tip (cached 15 s server-side) for the clawback estimate; falls back to the chosen date.
  const tip = proof.isDemo ? null : await getChainTip(proof.network, { timeoutMs: 3000 });
  const clawbackOpen = tip?.height != null && tip.height >= proof.clawbackExpiryHeight;
  const clawbackEstimateMs =
    tip?.height != null
      ? timeForHeight({ height: tip.height, timeMs: tip.timeMs ?? Date.now() }, proof.clawbackExpiryHeight)
      : proof.clawbackAt
        ? Date.parse(proof.clawbackAt)
        : null;

  return (
    <div className="space-y-7 animate-fade-up">
      <ProofPortalHeader
        campaignId={proof.campaignId}
        campaignTitle={proof.title}
        description={proof.description}
        ufvk={proof.ufvk}
        totalFundedZat={proof.totalFundedZat}
        clawbackAddress={proof.clawbackAddress}
        clawbackExpiryHeight={proof.clawbackExpiryHeight}
        clawbackEstimateMs={clawbackEstimateMs}
        clawbackOpen={clawbackOpen}
        network={proof.network}
        isDemo={proof.isDemo}
        createdAt={proof.createdAt}
      />

      {proof.isDemo && <JudgeSandboxStrip campaignId={proof.campaignId} />}

      <LedgerCard ledger={proof.ledger} isDemo={proof.isDemo} />

      <OnChainCard proof={proof} />

      <ViewingKeyAuditCard proof={proof} />

      {disputed.length > 0 && (
        <section className="neo-card rounded-[18px] p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Flag className="w-5 h-5 text-rose-fg" />
            <h2 className="text-[17px] font-bold tracking-[-0.015em] text-ink">
              {disputed.length} card{disputed.length === 1 ? "" : "s"} reported already empty
            </h2>
          </div>
          <p className="text-[12.5px] text-muted leading-relaxed">
            Someone said the card was empty when they scanned it: the organizer, a leaked or photographed slip, or a
            mistake. Disputes stay on the public record even if the card is confirmed later, and anyone holding the
            card can check its sweep transaction in their wallet.
          </p>
          <ul className="space-y-2.5">
            {disputed.map((v) => (
              <li key={v.cardId} className="neo-inset-sm rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[12.5px]">
                <span className="text-ink-soft">
                  <strong className="font-mono text-ink">{v.cardId}</strong> · {v.disputeReason}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {v.state === "ACK_CONFIRMED" && (
                    <Badge variant="ack">
                      {v.ackSubmittedAt && v.disputedAt && v.ackSubmittedAt < v.disputedAt ? "Confirmed, then disputed" : "Confirmed after dispute"}
                    </Badge>
                  )}
                  {v.disputedAt && (
                    <span className="font-mono text-[11.5px] text-subtle">{v.disputedAt.replace("T", " ").slice(0, 16)} UTC</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {reported.length > 0 && (
        <section className="neo-card rounded-[18px] p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Flag className="w-5 h-5 text-rose-fg" />
            <h2 className="text-[17px] font-bold tracking-[-0.015em] text-ink">
              {reported.length} recipient{reported.length === 1 ? "" : "s"} reported a payout that did not arrive as recorded
            </h2>
          </div>
          <p className="text-[12.5px] text-muted leading-relaxed">
            The holder of the claim link said the recorded payout transaction did not pay them, or paid a different
            amount. ZecClaim cannot see who a shielded payout paid, so these amounts count as awaiting, not
            distributed. An auditor holding the campaign viewing key can check the payout. Reports stay on the
            public record.
          </p>
          <ul className="space-y-2.5">
            {reported.map((s) => (
              <li key={s.slotIndex} className="neo-inset-sm rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[12.5px]">
                <span className="text-ink-soft">
                  <strong className="font-mono text-ink">SLOT-{String(s.slotIndex + 1).padStart(2, "0")}</strong> ·{" "}
                  {zecExact(s.amountZat)} ZEC · payout <span className="font-mono">{s.payoutTxid ? shortTxid(s.payoutTxid) : "-"}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <Badge variant="transparent">{payoutReportLabel(s.payoutReport)}</Badge>
                  {s.payoutReportedAt && (
                    <span className="font-mono text-[11.5px] text-subtle">{s.payoutReportedAt.replace("T", " ").slice(0, 16)} UTC</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ProofLedgerTable vouchers={proof.vouchers} slots={proof.slots} cardPlan={proof.cardPlan} />

      {proof.scrubAttestation && (
        <ScrubAttestationCard
          executedAt={proof.scrubAttestation.executedAt}
          purgedCount={proof.scrubAttestation.addressesPurgedCount}
          setHash={proof.scrubAttestation.sha256PurgedSetHash}
          stillStored={proof.addressesStored}
        />
      )}

      <AuditTrail events={proof.auditEvents} />
    </div>
  );
}
