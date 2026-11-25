import React from "react";
import { zecExact } from "@/lib/format";
import { Link2 } from "lucide-react";
import { IconTile, KeyValueRow } from "@/components/ui/misc";
import { ChainCheckBadge, ChainCheckText } from "@/components/chain/ChainCheck";
import { payoutProblems } from "@/lib/chain/describe";
import type { CampaignProofData } from "@/lib/proof/getProofData";

/**
 * What the chain itself confirms for this campaign, as reported by lightwalletd: the funding
 * transaction, every recorded payout transaction, and recipients' sweep transactions. Shielded
 * amounts and recipients are not visible on-chain, so this card never states them.
 */
export function OnChainCard({ proof }: { proof: CampaignProofData }) {
  const confirmed = proof.vouchers.filter((v) => v.state === "ACK_CONFIRMED");
  const withSweep = confirmed.filter((v) => v.sweepCheck?.status === "MINED");
  const recipientsPaid = proof.payouts.reduce((sum, p) => sum + p.recipients, 0);

  return (
    <section className="neo-card rounded-[18px] p-6 space-y-5">
      <div className="flex items-center gap-3">
        <IconTile tone="mint">
          <Link2 className="w-5 h-5" />
        </IconTile>
        <div>
          <h2 className="text-[17px] font-bold tracking-[-0.015em] text-ink">What the chain confirms</h2>
          <p className="text-[12.5px] text-subtle mt-0.5">
            Looked up on {proof.network} through a public lightwalletd node. Shielded amounts and recipients stay
            private, so the chain shows that a transaction exists, when it was mined, and its shape.
          </p>
        </div>
      </div>

      <div className="neo-inset-sm rounded-[14px] px-4 py-3.5 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-semibold text-ink">Funding transaction</p>
          <ChainCheckBadge check={proof.fundingCheck} />
        </div>
        <KeyValueRow label="Transaction ID" value={proof.fundingTxid} />
        <ChainCheckText check={proof.fundingCheck} />
        <p className="text-[11.5px] text-subtle">
          The declared {zecExact(proof.totalFundedZat)} ZEC is the organizer&apos;s statement: a
          shielded amount cannot be read from the chain without the viewing key.
          {proof.anchorHeight ? ` Anchored when the chain was at height ${proof.anchorHeight.toLocaleString("en-US")}.` : ""}
        </p>
      </div>

      <div className="space-y-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[13px] font-semibold text-ink">Payout transactions (online claims)</p>
          <span className="text-[11.5px] text-subtle">
            {proof.payouts.length} recorded · {recipientsPaid} recipient{recipientsPaid === 1 ? "" : "s"}
          </span>
        </div>
        <p className="text-[11.5px] text-subtle">
          Each payout must be found on-chain, mined after the campaign was anchored, and not recorded by another
          campaign. A shielded transaction hides its sender, so ZecClaim cannot tell whether it came from the campaign
          account: an auditor holding the viewing key can, and recipients can report a payout that never arrived.
        </p>
        {proof.payouts.length === 0 ? (
          <p className="text-[12.5px] text-muted">No payout transaction has been recorded yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {proof.payouts.map((p) => {
              const problems = payoutProblems(p.check, p.recipients);
              return (
                <li key={p.txid} className="neo-inset-sm rounded-[14px] px-4 py-3 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12.5px] font-semibold text-ink">
                      Batch run {p.batchRun} · transaction {p.chunkIndex + 1} · {p.recipients} recipient{p.recipients === 1 ? "" : "s"}
                    </span>
                    <ChainCheckBadge check={p.check} />
                  </div>
                  <p className="font-mono text-[11.5px] text-ink-soft break-all">{p.txid}</p>
                  <ChainCheckText check={p.check} />
                  {problems.map((problem) => (
                    <p key={problem} className="text-[12px] font-semibold text-rose-fg">
                      {problem}
                    </p>
                  ))}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {proof.vouchers.length > 0 && (
        <p className="text-[12.5px] text-muted">
          <strong className="text-ink">Gift cards:</strong> {confirmed.length} of {proof.vouchers.length} confirmed by
          their recipients; {withSweep.length} of those include a sweep transaction found on-chain after the campaign
          was anchored. ZecClaim cannot see a gift card being swept on its own (each card is its own key), so the others
          rely on the memo code alone.
        </p>
      )}
    </section>
  );
}
