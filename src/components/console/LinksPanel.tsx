"use client";

import React, { useEffect, useRef, useState } from "react";
import { Download, KeyRound, Link2, RefreshCw, Upload } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, BadgeVariant } from "@/components/ui/badge";
import { Hint, Notice, Textarea } from "@/components/ui/field";
import { CopyButton, Modal, StatTile } from "@/components/ui/misc";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChainCheckBadge } from "@/components/chain/ChainCheck";
import { parseClientLumaCsv } from "@/lib/zcash/luma";
import { shortTxid } from "@/lib/chain/describe";
import { downloadText } from "@/lib/client/organizer";
import { payoutReportLabel, zecExact, zecPlain } from "@/lib/format";
import type { PanelProps } from "./types";

const STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  UNCLAIMED: { label: "Open", variant: "default" },
  SUBMITTED: { label: "Address in", variant: "warning" },
  LOCKED_FOR_BATCH: { label: "Exported", variant: "warning" },
  BATCHED: { label: "Paid", variant: "ack" },
  PURGED: { label: "Scrubbed", variant: "purged" },
};

const POOL_LABEL: Record<string, string> = {
  ORCHARD: "Orchard UA",
  IRONWOOD: "Orchard UA",
  SAPLING: "Sapling (legacy)",
};

/** Long enough to compare by eye against a wallet; the full address is in the tooltip and the copy button. */
const shortAddress = (a: string) => (a.length > 34 ? `${a.slice(0, 18)}...${a.slice(-12)}` : a);

interface IssuedLink {
  slotIndex: number;
  claimPath: string;
  amountZat: number;
}

/** Claim links: live status per link, reissue for unused links, and CSV import of known addresses. */
export function LinksPanel({ data, campaignId, adminPost, refresh }: PanelProps) {
  const s = data.slots;
  const [confirm, setConfirm] = useState<number[] | "all" | null>(null);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<IssuedLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [csv, setCsv] = useState("");
  const [importMsg, setImportMsg] = useState<{ tone: "success" | "error" | "warning"; text: string } | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const payoutByTxid = new Map(data.payouts.map((p) => [p.txid, p]));

  // Addresses are organizer-only (the polled campaign data is public), so they come from their
  // own endpoint, refetched only when the set of links holding an address changes.
  const [addresses, setAddresses] = useState<Map<number, string>>(new Map());
  const adminPostRef = useRef(adminPost);
  useEffect(() => {
    adminPostRef.current = adminPost;
  });
  const addressKey = s.list
    .filter((slot) => slot.addressPoolType && slot.status !== "PURGED")
    .map((slot) => slot.slotIndex)
    .join(",");
  useEffect(() => {
    if (!addressKey) {
      setAddresses(new Map());
      return;
    }
    let cancelled = false;
    adminPostRef.current(`/api/campaigns/${campaignId}/addresses`, {}).then((res) => {
      if (cancelled || !res.ok) return;
      const list = (res.json.addresses as { slotIndex: number; address: string }[] | undefined) ?? [];
      setAddresses(new Map(list.map((a) => [a.slotIndex, a.address])));
    });
    return () => {
      cancelled = true;
    };
  }, [addressKey, campaignId]);

  const reissue = async () => {
    if (!confirm) return;
    setBusy(true);
    setError(null);
    const res = await adminPost(`/api/campaigns/${campaignId}/links`, confirm === "all" ? {} : { slotIndexes: confirm });
    setBusy(false);
    setConfirm(null);
    if (!res.ok) {
      setError(String(res.json.error ?? "Could not reissue links."));
      return;
    }
    setIssued((res.json.tokens as IssuedLink[]) ?? []);
    await refresh();
  };

  const importCsv = async () => {
    setImportMsg(null);
    try {
      const parsed = parseClientLumaCsv(csv);
      const res = await adminPost(`/api/campaigns/${campaignId}/import-luma`, { rows: parsed.recipients });
      if (!res.ok) {
        setImportMsg({ tone: "error", text: String(res.json.error ?? "Import failed.") });
        return;
      }
      const dropped = parsed.discardedColumns.length ? ` Dropped in your browser before sending: ${parsed.discardedColumns.join(", ")}.` : "";
      const rejected = Number(res.json.rejectedTransparentCount) + Number(res.json.rejectedInvalidCount);
      setImportMsg({
        tone: rejected > 0 ? "warning" : "success",
        text: `${String(res.json.validShieldedCount)} shielded recipients queued for the next payout; ${String(res.json.rejectedTransparentCount)} transparent and ${String(res.json.rejectedInvalidCount)} invalid rejected.${dropped}`,
      });
      setCsv("");
      await refresh();
    } catch (err) {
      setImportMsg({ tone: "error", text: err instanceof Error ? err.message : "Could not read the CSV." });
    }
  };

  const issuedUrls = (issued ?? []).map((l) => ({ ...l, url: `${origin}${l.claimPath}` }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatTile label="Open links" value={s.unclaimed} />
        <StatTile label="Addresses in" value={s.submitted} tone="amber" hint="ready to export" />
        <StatTile label="Exported" value={s.locked} tone="amber" hint="waiting for payout txid" />
        <StatTile label="Paid" value={s.paid} tone="mint" hint="payout tx recorded" />
        <StatTile label="Scrubbed" value={s.purged} tone="violet" />
      </div>

      <Card>
        <CardHeader className="sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-mint" /> Claim links
            </CardTitle>
            <CardDescription>
              Updates live as recipients submit addresses. Links are stored only as hashes: lost or leaked links can be replaced while unused.
              Addresses are shown only to you, until you scrub them.
            </CardDescription>
          </div>
          <Button variant="secondary" size="sm" disabled={s.unclaimed === 0} onClick={() => setConfirm("all")}>
            <RefreshCw className="w-3.5 h-3.5" /> Reissue {s.unclaimed} unused
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && <Notice tone="error">{error}</Notice>}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Payout</TableHead>
                <TableHead className="text-right">Link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {s.list.map((slot) => {
                const st = slot.status === "PURGED" && slot.payoutTxid ? { label: "Paid, scrubbed", variant: "purged" as BadgeVariant } : STATUS[slot.status];
                const payout = slot.payoutTxid ? payoutByTxid.get(slot.payoutTxid) : undefined;
                const address = addresses.get(slot.slotIndex);
                const poolLabel = slot.addressPoolType ? POOL_LABEL[slot.addressPoolType] : null;
                return (
                  <TableRow key={slot.slotIndex}>
                    <TableCell className="font-mono text-subtle">{slot.slotIndex + 1}</TableCell>
                    <TableCell className="text-right font-mono">{zecExact(slot.amountZat)}</TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1.5">
                        <Badge variant={st.variant}>{st.label}</Badge>
                        {slot.payoutReport && <Badge variant="transparent">{payoutReportLabel(slot.payoutReport)}</Badge>}
                      </span>
                    </TableCell>
                    <TableCell className="text-[12px]">
                      {address ? (
                        <div className="min-w-0">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="font-mono text-[11.5px] text-ink-soft break-all" title={address}>
                              {shortAddress(address)}
                            </span>
                            <CopyButton value={address} label={`Copy address of link ${slot.slotIndex + 1}`} className="w-7 h-7 shrink-0" />
                          </span>
                          {poolLabel && <span className="block text-[11px] text-subtle">{poolLabel}</span>}
                        </div>
                      ) : poolLabel ? (
                        <span className="text-ink-soft">{slot.status === "PURGED" ? `${poolLabel}, scrubbed` : poolLabel}</span>
                      ) : (
                        <span className="text-faint">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-[12px]">
                      {slot.payoutTxid ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="font-mono text-ink-soft">{shortTxid(slot.payoutTxid)}</span>
                          {payout && <ChainCheckBadge check={payout.check} />}
                        </span>
                      ) : slot.batchRun ? (
                        <span className="text-subtle">Run {slot.batchRun}</span>
                      ) : (
                        <span className="text-faint">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {slot.status === "UNCLAIMED" ? (
                        <Button size="sm" variant="ghost" onClick={() => setConfirm([slot.slotIndex])} title="Revoke this link and issue a new one">
                          <KeyRound className="w-3.5 h-3.5" /> New link
                        </Button>
                      ) : (
                        <span className="text-faint text-[12px]">used</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {s.list.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-subtle py-6">
                    No claim links in this campaign.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-mint" /> Import addresses you already collected
          </CardTitle>
          <CardDescription>
            For example a Luma export. Names, emails and every column except the address are dropped in this browser; each address is
            checked (ZIP 316) and queued for the next payout.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            rows={4}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={"name,email,zcash_address\nAlice,alice@example.org,utest1..."}
            className="font-mono text-[11.5px]"
            spellCheck={false}
          />
          <Hint className="mt-0">Needs a header row with an address column (address, zcash_address or shielded_address).</Hint>
          {importMsg && <Notice tone={importMsg.tone}>{importMsg.text}</Notice>}
          <Button variant="secondary" onClick={importCsv} disabled={!csv.trim()}>
            Check and import
          </Button>
        </CardContent>
      </Card>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === "all" ? `Reissue ${s.unclaimed} unused links?` : `Reissue link #${Array.isArray(confirm) ? confirm[0] + 1 : ""}?`}
        subtitle="The current link stops working immediately."
        icon={<RefreshCw className="w-5 h-5" />}
      >
        <div className="space-y-4 text-[13px] text-ink-soft">
          <p>
            Use this when links were lost or may have leaked. Links that already received an address are never touched. You will get the
            new links once; send them to the recipients again.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" size="sm" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button size="sm" disabled={busy} onClick={reissue}>
              {busy ? "Reissuing..." : "Reissue"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={issued !== null}
        onClose={() => setIssued(null)}
        title={`${issuedUrls.length} new claim link${issuedUrls.length === 1 ? "" : "s"}`}
        subtitle="Shown once. The previous links no longer work."
        icon={<Link2 className="w-5 h-5" />}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <ul className="neo-inset-sm rounded-xl divide-y divide-line max-h-72 overflow-y-auto">
            {issuedUrls.map((l) => (
              <li key={l.url} className="flex items-center gap-3 px-3.5 py-2">
                <span className="font-mono text-[11px] text-subtle w-8 shrink-0">#{l.slotIndex + 1}</span>
                <span className="font-mono text-[11.5px] font-semibold text-ink shrink-0">{zecExact(l.amountZat)} ZEC</span>
                <span className="font-mono text-[11.5px] text-ink-soft truncate flex-1" title={l.url}>
                  {l.url}
                </span>
                <CopyButton value={l.url} label={`Copy link ${l.slotIndex + 1}`} className="w-7 h-7" />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <CopyButton value={issuedUrls.map((l) => l.url).join("\n")} label="Copy all links" />
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                downloadText(
                  `zecclaim-${campaignId}-reissued-links.csv`,
                  ["link_number,amount_zec,claim_link", ...issuedUrls.map((l) => `${l.slotIndex + 1},${zecPlain(l.amountZat)},${l.url}`)].join("\n"),
                  "text/csv"
                )
              }
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </Button>
            <Button size="sm" onClick={() => setIssued(null)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
