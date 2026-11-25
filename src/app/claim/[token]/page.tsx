"use client";

import React, { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, ExternalLink, Link2, Loader2, Lock, ShieldCheck } from "lucide-react";
import { clsx } from "clsx";
import { AddressPreflightInput } from "@/components/zcash/AddressPreflightInput";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/field";
import { IconTile } from "@/components/ui/misc";
import { usePolling } from "@/lib/client/hooks";
import { shortTxid } from "@/lib/chain/describe";
import { formatDateTime, payoutReportLabel, zecExact } from "@/lib/format";
import type { PayoutReportReason } from "@/types";

interface ClaimPageProps {
  params: Promise<{ token: string }>;
}

interface SlotData {
  campaignId: string;
  campaignTitle: string;
  campaignDescription: string | null;
  network: "testnet" | "mainnet";
  isDemo: boolean;
  amountZat: number;
  slotIndex: number;
  status: "UNCLAIMED" | "SUBMITTED" | "LOCKED_FOR_BATCH" | "BATCHED" | "PURGED";
  isClaimable: boolean;
  submittedAt: string | null;
  addressHint: string | null;
  addressPoolType: string | null;
  batchRun: number | null;
  payoutReport: PayoutReportReason | null;
  payoutReportedAt: string | null;
  payout: { txid: string; status: string | null; height: number | null; confirmations: number | null } | null;
}

function Step({ done, active, title, children }: { done: boolean; active?: boolean; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex flex-col items-center">
        {done ? (
          <CheckCircle2 className="w-5 h-5 text-mint shrink-0" />
        ) : active ? (
          <Loader2 className="w-5 h-5 text-amber-fg animate-spin shrink-0" />
        ) : (
          <Circle className="w-5 h-5 text-faint shrink-0" />
        )}
      </span>
      <div className="pb-4 min-w-0">
        <p className={clsx("text-[13.5px] font-semibold", done ? "text-ink" : active ? "text-ink-soft" : "text-subtle")}>{title}</p>
        {children && <div className="text-[12.5px] text-muted leading-relaxed mt-0.5">{children}</div>}
      </div>
    </li>
  );
}

/** Where this link's payout stands, from address submission to the on-chain payout. */
function Progress({ slot }: { slot: SlotData }) {
  const submitted = slot.status !== "UNCLAIMED";
  const exported = Boolean(slot.batchRun) || slot.status === "BATCHED" || Boolean(slot.payout);
  const paid = Boolean(slot.payout);
  const mined = slot.payout?.status === "MINED";
  return (
    <ol className="neo-inset-sm rounded-[14px] px-4 pt-4" aria-label="Payout progress">
      <Step done={submitted} title="Address received">
        {slot.addressHint ? (
          <>
            <span className="font-mono text-ink-soft">{slot.addressHint}</span>
            {slot.addressPoolType ? ` · ${slot.addressPoolType === "SAPLING" ? "Sapling (legacy)" : "Orchard"}` : ""}
            {slot.submittedAt ? ` · ${formatDateTime(slot.submittedAt)}` : ""}
          </>
        ) : slot.status === "PURGED" ? (
          "The organizer has deleted the stored address after paying."
        ) : null}
      </Step>
      <Step done={exported} active={submitted && !exported} title="Included in a payout batch">
        {exported ? `Batch run ${slot.batchRun ?? ""} exported for the organizer's wallet.` : submitted ? "Waiting for the organizer to send the next batch." : null}
      </Step>
      <Step done={paid && mined} active={exported && !(paid && mined)} title="Paid on-chain">
        {slot.payout ? (
          <>
            Transaction <span className="font-mono text-ink-soft">{shortTxid(slot.payout.txid)}</span>
            {mined
              ? `, mined at height ${slot.payout.height?.toLocaleString("en-US")} (${slot.payout.confirmations} confirmation${slot.payout.confirmations === 1 ? "" : "s"}).`
              : slot.payout.status === "MEMPOOL"
                ? ", in the mempool."
                : "."}{" "}
            Your wallet shows the funds once it syncs.
          </>
        ) : exported ? (
          "Waiting for the organizer to broadcast and record the payout."
        ) : null}
      </Step>
    </ol>
  );
}

/**
 * The link holder's counter-statement when a recorded payout did not arrive. ZecClaim cannot see
 * who a shielded payout paid; the recipient can. Fixed choices only, so no address is published.
 */
function PayoutReport({ token, slot, onReported }: { token: string; slot: SlotData; onReported: () => Promise<void> }) {
  const [confirm, setConfirm] = useState<PayoutReportReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!slot.payout) return null;
  const linkNumber = slot.slotIndex + 1;

  if (slot.payoutReport) {
    return (
      <Notice tone="warning">
        You reported this payout: {payoutReportLabel(slot.payoutReport).replace(/^Reported /, "")}
        {slot.payoutReportedAt ? ` (${formatDateTime(slot.payoutReportedAt)})` : ""}. The report is on the proof portal next to link{" "}
        {linkNumber}, without your address.
      </Notice>
    );
  }

  const submit = async () => {
    if (!confirm) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/claims/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reason: confirm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) setError(data.error || "Could not send the report.");
      else await onReported();
    } catch {
      setError("Network error while sending the report. Try again.");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const pending = slot.payout.status === "MEMPOOL";
  return (
    <div className="neo-inset-sm rounded-[14px] px-4 py-3.5 space-y-2.5">
      <p className="text-[13px] font-semibold text-ink">Payment not in your wallet?</p>
      <p className="text-[12px] text-muted leading-relaxed">
        Let your wallet finish syncing first. If the payout above did not pay you, or paid a different amount, report it. The report
        is published on the proof portal next to link {linkNumber}, never with your address, and cannot be withdrawn.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      {confirm ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-ink-soft">Publish &quot;{payoutReportLabel(confirm).replace(/^Reported /, "")}&quot;?</span>
          <Button size="sm" variant="danger" disabled={busy} onClick={submit}>
            {busy ? "Sending..." : "Publish report"}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm(null)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => setConfirm("NOT_RECEIVED")}>
            Nothing arrived
          </Button>
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => setConfirm("WRONG_AMOUNT")}>
            A different amount arrived
          </Button>
        </div>
      )}
      {pending && <p className="text-[11.5px] text-subtle">Available once the payout is mined.</p>}
    </div>
  );
}

export default function ClaimSlotPage({ params }: ClaimPageProps) {
  const { token } = use(params);
  const [address, setAddress] = useState("");
  const [isValidShielded, setIsValidShielded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [slot, setSlot] = useState<SlotData | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/claims/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data.success) setInvalid(data.error || "This claim link is not valid.");
      else {
        setSlot(data);
        setInvalid(null);
      }
    } catch {
      setInvalid((v) => v ?? "Network error while checking the link. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);
  usePolling(load, 30_000, Boolean(slot && !slot.isClaimable && !(slot.payout?.status === "MINED")));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidShielded || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, address }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Could not submit the address.");
      } else {
        setJustSubmitted(true);
        await load();
      }
    } catch {
      setError("Network error while submitting. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto py-2 sm:py-6 animate-fade-up">
      <div className="neo-card rounded-[20px] p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <IconTile tone="mint">
              <Link2 className="w-5 h-5" />
            </IconTile>
            <div>
              <h1 className="text-[20px] font-bold tracking-[-0.015em] text-ink">Claim your shielded payout</h1>
              <p className="text-xs text-muted mt-0.5">Single-use link. No account, no social login.</p>
            </div>
          </div>
          {slot && (
            <span className="flex flex-col items-end gap-1.5">
              <Badge variant={slot.network === "mainnet" ? "shielded" : "sapling"}>{slot.network}</Badge>
              {slot.isDemo && <Badge variant="warning">Sandbox</Badge>}
            </span>
          )}
        </div>

        {slot && (
          <div className="neo-inset rounded-[14px] px-5 py-4 mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div className="min-w-0">
              <p className="text-[11px] text-subtle">Campaign</p>
              <p className="text-[14px] font-semibold text-ink break-words">{slot.campaignTitle}</p>
              {slot.campaignDescription && <p className="text-[12px] text-muted">{slot.campaignDescription}</p>}
            </div>
            <div className="sm:text-right shrink-0">
              <p className="text-[11px] text-subtle">Amount</p>
              <p className="font-mono tabular-nums text-[20px] font-bold text-ink">{zecExact(slot.amountZat)} ZEC</p>
            </div>
          </div>
        )}

        <div className="mt-6">
          {loading ? (
            <div className="py-10 flex items-center justify-center gap-2 text-sm text-muted">
              <Loader2 className="w-4 h-4 animate-spin" /> Checking your link...
            </div>
          ) : invalid && !slot ? (
            <Notice tone="error" className="space-y-1">
              <p className="font-semibold">This claim link does not work</p>
              <p className="font-normal">{invalid}</p>
              <p className="text-ink-soft font-normal">Check that you copied the whole link, or ask the organizer for a new one.</p>
            </Notice>
          ) : slot && !slot.isClaimable ? (
            <div className="space-y-4">
              {justSubmitted ? (
                <Notice tone="success" className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Address accepted. Keep this link: it shows your payout status, live.</span>
                </Notice>
              ) : (
                <p className="text-[13px] text-muted">This link has been used. Here is where the payout stands:</p>
              )}
              <Progress slot={slot} />
              <PayoutReport token={token} slot={slot} onReported={load} />
              <Link
                href={`/proof/${slot.campaignId}`}
                className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-mint-hover hover:text-mint-deep"
              >
                Campaign proof portal <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && <Notice tone="error">{error}</Notice>}
              <AddressPreflightInput
                value={address}
                expectedNetwork={slot?.network}
                onChange={(addr, valid) => {
                  setAddress(addr);
                  setIsValidShielded(valid);
                  setError(null);
                }}
              />
              <Button type="submit" variant="solid" size="lg" disabled={!isValidShielded || submitting} className="w-full">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? "Submitting..." : `Claim ${slot ? zecExact(slot.amountZat) : ""} ZEC`}
              </Button>
              <p className="text-[11.5px] text-subtle leading-relaxed">
                Need a shielded address? Use a {slot?.network === "testnet" ? "testnet " : ""}Unified Address from Zingo, Zodl or Ywallet. Your
                address is used once for this payout and deleted after the organizer pays.
                {slot?.network === "testnet" ? " Testnet ZEC has no monetary value." : ""}
              </p>
            </form>
          )}
        </div>

        <div className="mt-7 pt-5 border-t border-line grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11.5px] text-subtle">
          <span className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-mint shrink-0" /> Transparent and mixed addresses are refused
          </span>
          <span className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-mint shrink-0" /> The link is stored only as a peppered hash
          </span>
        </div>
      </div>
    </div>
  );
}
