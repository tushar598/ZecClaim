"use client";

import React, { useState } from "react";
import { Eraser, Layers, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Notice } from "@/components/ui/field";
import { Modal } from "@/components/ui/misc";
import { FormSection } from "@/components/ui/choice";
import { FeeActionMeter } from "@/components/zcash/FeeActionMeter";
import { BatchExporter } from "@/components/zcash/BatchExporter";
import { ScrubAttestationCard } from "@/components/proof/ScrubAttestationCard";
import { ChainCheckBadge, ChainCheckText } from "@/components/chain/ChainCheck";
import { payoutProblems, shortTxid } from "@/lib/chain/describe";
import type { BatchResult, PanelProps, PayoutView } from "./types";

interface ScrubResult {
  addressesPurgedCount: number;
  sha256PurgedSetHash: string;
  executedAt: string;
}

/** Lane 2 payout: export for your wallet, record what it broadcast, then scrub addresses. */
export function PayoutPanel({ data, campaignId, adminPost, refresh }: PanelProps) {
  const s = data.slots;
  const network = data.campaign.network;
  const [batch, setBatch] = useState<BatchResult | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batching, setBatching] = useState(false);

  // Exported runs without a recorded payout: run -> number of transactions.
  const unpaidRuns = Array.from(
    s.list
      .filter((slot) => slot.status === "LOCKED_FOR_BATCH" && slot.batchRun)
      .reduce((runs, slot) => {
        const run = slot.batchRun as number;
        runs.set(run, Math.max(runs.get(run) ?? 0, (slot.batchIndex ?? 0) + 1));
        return runs;
      }, new Map<number, number>())
  ).sort((a, b) => a[0] - b[0]);

  const exportBatch = async () => {
    setBatching(true);
    setBatchError(null);
    const res = await adminPost("/api/batch", { campaignId });
    setBatching(false);
    if (!res.ok) {
      setBatchError(String(res.json.error ?? "Export failed."));
      return;
    }
    setBatch(res.json as unknown as BatchResult);
    await refresh();
  };

  const canExport = s.submitted > 0 || unpaidRuns.length > 0;

  return (
    <div className="space-y-5">
      <FormSection
        step={1}
        title="Lock and export"
        description={`Locks every submitted address into a batch run and builds the transactions for your own wallet (at most 300 actions each, ZIP 2009 fees). ${network === "testnet" ? "Testnet" : "Mainnet"} only.`}
        aside={
          <Button onClick={exportBatch} disabled={batching || !canExport}>
            {batching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
            {batching ? "Building..." : s.submitted > 0 ? `Lock ${s.submitted} and export` : "Re-export unpaid batch"}
          </Button>
        }
      >
        {batchError && <Notice tone="error">{batchError}</Notice>}
        {!batch && !batchError && (
          <p className="text-[12.5px] text-muted">
            {s.submitted > 0
              ? `${s.submitted} address${s.submitted === 1 ? " is" : "es are"} ready to pay.`
              : unpaidRuns.length > 0
                ? "An exported batch is waiting for its payout txid. Re-export it if you lost the script."
                : "Nothing to export yet. Addresses appear here as recipients use their links."}
          </p>
        )}
        {batch && (
          <div className="space-y-5">
            <Notice tone="success">
              Batch run {batch.batchRun} {batch.isReexport ? "re-exported" : "locked"}: {batch.totalRecipients} recipient
              {batch.totalRecipients === 1 ? "" : "s"}. Sign it in your wallet, then record the txid below.
            </Notice>
            <FeeActionMeter
              totalRecipients={batch.totalRecipients}
              totalActions={batch.totalActions}
              totalFeeZat={batch.totalEstimatedFeeZat}
              transactions={batch.totalChunks}
            />
            <BatchExporter chunks={batch.chunks} zingoScript={batch.zingoScript} fileStem={campaignId} />
          </div>
        )}
      </FormSection>

      <PayoutRecorder campaignId={campaignId} network={network} unpaidRuns={unpaidRuns} payouts={data.payouts} adminPost={adminPost} refresh={refresh} />

      <ScrubStep data={data} campaignId={campaignId} adminPost={adminPost} refresh={refresh} />
    </div>
  );
}

function PayoutRecorder({
  campaignId,
  network,
  unpaidRuns,
  payouts,
  adminPost,
  refresh,
}: {
  campaignId: string;
  network: "testnet" | "mainnet";
  unpaidRuns: [number, number][];
  payouts: PayoutView[];
  adminPost: PanelProps["adminPost"];
  refresh: () => Promise<void>;
}) {
  const [txids, setTxids] = useState<Record<string, string>>({});
  const [busyRun, setBusyRun] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error" | "warning"; text: string } | null>(null);

  const record = async (run: number, chunks: number) => {
    setBusyRun(run);
    setMsg(null);
    const list = Array.from({ length: chunks }, (_, i) => (txids[`${run}:${i}`] ?? "").trim().toLowerCase());
    const res = await adminPost("/api/batch/payout", { campaignId, batchRun: run, txids: list });
    setBusyRun(null);
    if (!res.ok) {
      setMsg({ tone: "error", text: String(res.json.error ?? "Could not record the payout.") });
      return;
    }
    const problems = Array.isArray(res.json.problems) ? (res.json.problems as string[]) : [];
    setMsg({
      tone: problems.length ? "warning" : "success",
      text: problems.length
        ? `Recorded with problems (shown publicly): ${problems.join("; ")}`
        : `Batch run ${run} recorded: ${String(res.json.paidRecipients)} recipients paid on ${network}.`,
    });
    await refresh();
  };

  return (
    <FormSection
      step={2}
      title="Record the payout transaction"
      description={`After your wallet broadcasts the batch, paste the txid it printed (one per transaction). ZecClaim looks it up on ${network}, checks it has room for every recipient and no transparent outputs, and only then counts them as paid.`}
    >
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {unpaidRuns.length === 0 && payouts.length === 0 && <p className="text-[12.5px] text-muted">No exported batch is waiting for a payout txid.</p>}
      {unpaidRuns.map(([run, chunks]) => {
        const values = Array.from({ length: chunks }, (_, i) => (txids[`${run}:${i}`] ?? "").trim());
        const complete = values.every((v) => /^[0-9a-fA-F]{64}$/.test(v));
        return (
          <div key={run} className="neo-inset-sm rounded-[14px] p-4 space-y-3">
            <p className="text-[13px] font-semibold text-ink">
              Batch run {run} · {chunks} transaction{chunks === 1 ? "" : "s"}
            </p>
            {Array.from({ length: chunks }, (_, i) => (
              <div key={i}>
                <Label htmlFor={`payout-${run}-${i}`}>Transaction {i + 1} txid</Label>
                <Input
                  id={`payout-${run}-${i}`}
                  value={txids[`${run}:${i}`] ?? ""}
                  onChange={(e) => setTxids((t) => ({ ...t, [`${run}:${i}`]: e.target.value.trim() }))}
                  placeholder="64 hex characters from your wallet"
                  className="font-mono text-[12px]"
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
            ))}
            <Button size="sm" onClick={() => record(run, chunks)} disabled={busyRun !== null || !complete}>
              {busyRun === run ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {busyRun === run ? "Checking on-chain..." : "Check and record"}
            </Button>
          </div>
        );
      })}
      {payouts.length > 0 && (
        <ul className="space-y-2">
          {payouts.map((p) => (
            <li key={p.txid} className="neo-card-sm rounded-[12px] px-4 py-3 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12.5px] font-semibold text-ink">
                  Run {p.batchRun} · tx {p.chunkIndex + 1} · {p.recipients} recipient{p.recipients === 1 ? "" : "s"} ·{" "}
                  <span className="font-mono font-normal">{shortTxid(p.txid)}</span>
                </span>
                <ChainCheckBadge check={p.check} />
              </div>
              <ChainCheckText check={p.check} />
              {payoutProblems(p.check, p.recipients).map((problem) => (
                <p key={problem} className="text-[12px] font-semibold text-rose-fg">
                  {problem}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}
    </FormSection>
  );
}

function ScrubStep({ data, campaignId, adminPost, refresh }: PanelProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unpaid, setUnpaid] = useState(0);
  const [result, setResult] = useState<ScrubResult | null>(null);
  const stored = data.slots.list.filter((s) => s.status === "SUBMITTED" || s.status === "LOCKED_FOR_BATCH" || s.status === "BATCHED").length;

  const run = async (force: boolean) => {
    setBusy(true);
    setError(null);
    const res = await adminPost("/api/scrub", { campaignId, force });
    setBusy(false);
    if (res.status === 409 && res.json.code === "UNPAID_RECIPIENTS") {
      setUnpaid(Number(res.json.unpaidCount));
      return;
    }
    if (!res.ok) {
      setError(String(res.json.error ?? "Scrub failed."));
      return;
    }
    setResult(res.json as unknown as ScrubResult);
    setOpen(false);
    setUnpaid(0);
    await refresh();
  };

  return (
    <FormSection
      step={3}
      title="Scrub recipient addresses"
      description="Once payouts are recorded, overwrite the stored addresses and publish a SHA-256 commitment of what was deleted on the proof portal."
      aside={
        <Button variant="danger" onClick={() => setOpen(true)} disabled={stored === 0}>
          <Eraser className="w-3.5 h-3.5" /> Scrub {stored > 0 ? stored : ""}
        </Button>
      }
    >
      <p className="text-[12.5px] text-muted">
        {stored === 0 ? "No recipient addresses are stored right now." : `${stored} recipient address${stored === 1 ? " is" : "es are"} stored.`}
      </p>
      {result && (
        <ScrubAttestationCard
          executedAt={result.executedAt}
          purgedCount={result.addressesPurgedCount}
          setHash={result.sha256PurgedSetHash}
          stillStored={0}
        />
      )}
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setUnpaid(0);
        }}
        title="Scrub recipient addresses?"
        subtitle="This cannot be undone."
        icon={<Eraser className="w-5 h-5" />}
      >
        <div className="space-y-4 text-[13px] text-ink-soft">
          {unpaid > 0 ? (
            <Notice tone="warning">
              {unpaid} recipient{unpaid === 1 ? " has" : "s have"} no recorded payout transaction, so ZecClaim cannot tell they were paid.
              Scrubbing now deletes their only stored address. Record the payout txid first, or scrub anyway.
            </Notice>
          ) : (
            <p>Every stored recipient address is overwritten and a SHA-256 commitment of the deleted set is published.</p>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setOpen(false);
                setUnpaid(0);
              }}
            >
              Cancel
            </Button>
            <Button variant="danger" size="sm" disabled={busy} onClick={() => run(unpaid > 0)}>
              {busy ? "Scrubbing..." : unpaid > 0 ? "Scrub anyway" : "Scrub addresses"}
            </Button>
          </div>
        </div>
      </Modal>
    </FormSection>
  );
}
