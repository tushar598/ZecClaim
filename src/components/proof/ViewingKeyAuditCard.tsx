import React from "react";
import { KeyRound } from "lucide-react";
import { CopyButton, IconTile } from "@/components/ui/misc";
import { Notice } from "@/components/ui/field";
import { shortTxid } from "@/lib/chain/describe";
import { zecExact } from "@/lib/format";
import { viewingKeyAuditCommands } from "@/lib/zcash/zingoScript";
import type { CampaignProofData } from "@/lib/proof/getProofData";

function Command({ value, label }: { value: string; label: string }) {
  return (
    <div className="neo-inset-sm rounded-xl p-3 flex items-start gap-2">
      <pre className="flex-1 min-w-0 overflow-x-auto text-[11.5px] font-mono text-ink-soft leading-relaxed">{value}</pre>
      <CopyButton value={value} label={label} className="w-7 h-7 shrink-0" />
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span className="neo-inset-sm w-7 h-7 rounded-full grid place-items-center text-[12px] font-bold text-mint shrink-0">{n}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-[13.5px] font-semibold text-ink">{title}</p>
        {children}
      </div>
    </li>
  );
}

/**
 * How an auditor sees the shielded amounts and recipients the chain hides: open the campaign's
 * viewing key in a view-only wallet on their own computer, then compare with ZecClaim's records.
 * Static instructions only. There is deliberately no key input: a viewing key reveals every
 * payout, so it should never be pasted into a website, this one included.
 */
export function ViewingKeyAuditCard({ proof }: { proof: CampaignProofData }) {
  const startHeight = proof.fundingCheck?.height ?? proof.anchorHeight;
  const cmd = viewingKeyAuditCommands({ network: proof.network, campaignId: proof.campaignId, startHeight });
  const memo = `ZecClaim: ${proof.title}`.slice(0, 120);

  const payouts = proof.payouts.map((p) => {
    const amounts = proof.slots.filter((s) => s.payoutTxid === p.txid).map((s) => s.amountZat);
    const total = amounts.reduce((sum, a) => sum + a, 0);
    const same = amounts.length > 0 && amounts.every((a) => a === amounts[0]);
    const expected =
      amounts.length === 0
        ? `${p.recipients} transfer${p.recipients === 1 ? "" : "s"}`
        : same
          ? `${amounts.length} transfer${amounts.length === 1 ? "" : "s"} of ${zecExact(amounts[0])} ZEC`
          : `${amounts.length} transfers, ${zecExact(total)} ZEC in total`;
    return { txid: p.txid, label: `Batch run ${p.batchRun}, transaction ${p.chunkIndex + 1}`, expected };
  });

  return (
    <section className="neo-card rounded-[18px] p-6 space-y-5">
      <div className="flex items-center gap-3">
        <IconTile tone="mint">
          <KeyRound className="w-5 h-5" />
        </IconTile>
        <div>
          <h2 className="text-[17px] font-bold tracking-[-0.015em] text-ink">Check amounts and recipients with the viewing key</h2>
          <p className="text-[12.5px] text-subtle mt-0.5">
            The chain hides who was paid and how much. The campaign&apos;s viewing key shows both, in a wallet on your own
            computer. It can view payments but never spend them. Never paste a viewing key into a website, this one included.
          </p>
        </div>
      </div>

      {proof.isDemo && (
        <Notice tone="warning">
          Sandbox fixtures: this campaign&apos;s key and transaction IDs are not on the chain, so a wallet will not find them.
          The steps are the same for a real campaign.
        </Notice>
      )}

      <ol className="space-y-5">
        <Step n={1} title="Get the viewing key">
          <p className="text-[12.5px] text-muted leading-relaxed">
            {proof.ufvk.published
              ? "The organizer published it at the top of this page."
              : "Ask the organizer for it. It reveals every payment in this campaign, so it is shared with auditors directly and only its fingerprint is public."}
          </p>
        </Step>

        <Step n={2} title="Confirm it is this campaign's key">
          <Command value={cmd.fingerprint} label="Copy fingerprint command" />
          <p className="text-[12px] text-muted">
            The output must match the fingerprint registered for this campaign (use <code className="font-mono">sha256sum</code> on Linux):
          </p>
          <p className="font-mono text-[11.5px] text-ink break-all">{proof.ufvk.fingerprint}</p>
        </Step>

        <Step n={3} title="Open it in a view-only wallet">
          <p className="text-[12.5px] text-muted leading-relaxed">
            In the same terminal, with{" "}
            <a href="https://github.com/zingolabs/zingolib" target="_blank" rel="noreferrer" className="text-mint-hover underline underline-offset-2">
              zingo-cli
            </a>{" "}
            installed. It scans from block {cmd.birthday.toLocaleString("en-US")}
            {cmd.birthday > 0 ? ", just before the funding transaction," : " (the start of the shielded chain, which is slow)"} and
            lists every transfer.
          </p>
          <Command value={cmd.openWallet} label="Copy view-only wallet command" />
          <p className="text-[12px] text-muted">
            The folder must not exist yet. To look again later, run it without the key:
          </p>
          <Command value={cmd.reopenWallet} label="Copy reopen command" />
        </Step>

        <Step n={4} title="Compare with this campaign's records">
          <ul className="space-y-2">
            <li className="neo-inset-sm rounded-xl px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-[12.5px]">
              <span className="text-ink-soft">
                Funding <span className="font-mono">{shortTxid(proof.fundingTxid)}</span>
              </span>
              <span className="text-ink font-semibold">{zecExact(proof.totalFundedZat)} ZEC received (declared)</span>
            </li>
            {payouts.map((p) => (
              <li
                key={p.txid}
                className="neo-inset-sm rounded-xl px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-[12.5px]"
              >
                <span className="text-ink-soft">
                  {p.label} <span className="font-mono">{shortTxid(p.txid)}</span>
                </span>
                <span className="text-ink font-semibold">{p.expected}</span>
              </li>
            ))}
          </ul>
          {payouts.length === 0 ? (
            <p className="text-[12px] text-muted">No payout transaction has been recorded yet.</p>
          ) : (
            <p className="text-[12px] text-muted leading-relaxed">
              Payout transfers carry the memo &quot;{memo}&quot;. Each recipient can also see the payment arrive in their own
              wallet, and their claim page shows the same transaction ID.
            </p>
          )}
          <p className="text-[12px] text-muted leading-relaxed">
            These amounts are ZecClaim&apos;s records. The wallet reads the chain, so if they differ, the wallet is right.
            {proof.vouchers.length > 0 && " Gift cards each have their own key, so their sweeps do not appear in this wallet."}
          </p>
        </Step>
      </ol>
    </section>
  );
}
