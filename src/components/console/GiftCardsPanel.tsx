"use client";

import React, { useState } from "react";
import { Printer, RotateCcw, Ticket, Upload } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, BadgeVariant } from "@/components/ui/badge";
import { Input, Label, Notice, Textarea } from "@/components/ui/field";
import { StatTile } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QrSlipCard } from "@/components/zcash/QrSlipCard";
import { CardPlanCard } from "@/components/campaign/CardPlanCard";
import { parseClientVizorCsv, toServerImportPayload, ClientVizorCard } from "@/lib/zcash/zip324";
import { checkHeadline, shortTxid } from "@/lib/chain/describe";
import { blocksToDuration, timeForHeight } from "@/lib/chain/blockTime";
import { useChainTip } from "@/lib/client/hooks";
import { formatDateTime, zecExact } from "@/lib/format";
import type { PanelProps } from "./types";

// Sandbox only: card IDs that do not collide with the seeded CARD-01..05 and keys that are
// obviously not real. Real exports come from Vizor or Zodl.
const SAMPLE_VIZOR_CSV = `card_id,amount_zec,sweep_fee_buffer_zat,claim_url,ack_hash
CARD-06,0.05,2000,https://link.vizor.cash/payment-links/open#key=SAMPLE_NOT_A_REAL_KEY_06,5f2b8c1d9e3a7f4b6c0d2e8a1b9c7d3e5f4a6b8c0d1e2f3a4b5c6d7e8f9a0b1c
CARD-07,0.05,2000,https://link.vizor.cash/payment-links/open#key=SAMPLE_NOT_A_REAL_KEY_07,7a1c3e5b9d2f4a6c8e0b1d3f5a7c9e2b4d6f8a0c1e3b5d7f9a2c4e6b8d0f1a3c`;

const VOUCHER_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
  UNCLAIMED: { label: "Unclaimed", variant: "default" },
  ACK_CONFIRMED: { label: "Confirmed", variant: "ack" },
  DISPUTED: { label: "Disputed", variant: "transparent" },
  CLAWED_BACK: { label: "Clawed back", variant: "clawback" },
};

/** Lane 1: import ZIP 324 cards, print or hand out slips, track receipts, reconcile the clawback. */
export function GiftCardsPanel({ data, campaignId, adminPost, refresh }: PanelProps) {
  const isDemo = data.isDemo;
  const v = data.vouchers;
  const [csv, setCsv] = useState("");
  const [splitCustody, setSplitCustody] = useState(true);
  const [parsedCards, setParsedCards] = useState<ClientVizorCard[]>([]);
  const [importMsg, setImportMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"sheet" | "desk">("sheet");
  const [deskIndex, setDeskIndex] = useState(0);
  const [clawbackTxid, setClawbackTxid] = useState("");
  const [clawbackMsg, setClawbackMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const tip = useChainTip(data.campaign.network);
  const expiry = data.campaign.clawbackExpiryHeight;
  const plan = data.campaign.cardPlanZat ?? [];

  // Slip QR payloads exist only in this browser session (parsed from the CSV). After a reload a
  // real campaign has none, and no look-alike QR codes are printed. The sandbox shows
  // watermarked samples that encode no key.
  const sampleSlips: ClientVizorCard[] = isDemo
    ? v.list.map((card) => ({
        cardId: card.cardId,
        amountZec: card.amountZat / 100_000_000,
        amountZat: card.amountZat,
        feeBufferZat: card.feeBufferZat,
        claimToken: "",
        secretUri: `ZECCLAIM-SAMPLE-SLIP-${card.cardId}-NOT-SPENDABLE`,
        ackHash: "",
      }))
    : [];
  const slips = parsedCards.length > 0 ? parsedCards : sampleSlips;
  const slipsAreSamples = parsedCards.length === 0;
  const desk = slips[Math.min(deskIndex, Math.max(0, slips.length - 1))];

  const importCsv = async () => {
    setBusy(true);
    setImportMsg(null);
    try {
      const manifest = parseClientVizorCsv(csv);
      const res = await adminPost("/api/vouchers", toServerImportPayload(manifest, campaignId, splitCustody));
      if (!res.ok) {
        setImportMsg({ tone: "error", text: String(res.json.error ?? "Import failed.") });
        return;
      }
      setParsedCards(manifest.cards);
      setImportMsg({ tone: "success", text: `${manifest.totalCards} cards registered. No card key left this browser; the slips below are printable.` });
      setCsv("");
      await refresh();
    } catch (err) {
      setImportMsg({ tone: "error", text: err instanceof Error ? err.message : "Could not parse the CSV." });
    } finally {
      setBusy(false);
    }
  };

  const clawback = async () => {
    setClawbackMsg(null);
    const res = await adminPost("/api/vouchers", { campaignId, txid: clawbackTxid.trim().toLowerCase() });
    if (!res.ok) {
      setClawbackMsg({ tone: "error", text: String(res.json.error ?? "Clawback failed.") });
      return;
    }
    setClawbackMsg({
      tone: "success",
      text: `${String(res.json.clawedBackCount)} unclaimed cards marked clawed back (${zecExact(Number(res.json.totalZatReturned))} ZEC).`,
    });
    setClawbackTxid("");
    await refresh();
  };

  const clawbackStatus = (() => {
    if (isDemo) return "Sandbox: the expiry and txid checks are skipped and the clawback is labeled simulated.";
    if (tip.loading) return "Reading the chain height...";
    if (tip.height === null) return `Chain height unavailable (${tip.note ?? "node unreachable"}). Recording needs the live height.`;
    if (tip.height >= expiry) return `Open: ${data.campaign.network} is at #${tip.height.toLocaleString("en-US")}, past #${expiry.toLocaleString("en-US")}.`;
    const opensAt = timeForHeight({ height: tip.height, timeMs: tip.timeMs ?? Date.now() }, expiry);
    return `Opens about ${formatDateTime(opensAt)} (block #${expiry.toLocaleString("en-US")}, ${blocksToDuration(expiry - tip.height)} away).`;
  })();
  const clawbackOpen = isDemo || (tip.height !== null && tip.height >= expiry);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 print:hidden">
        <StatTile label="Cards" value={v.total} />
        <StatTile label="Confirmed" value={v.ackConfirmed} tone="mint" />
        <StatTile label="With sweep tx" value={v.withSweepEvidence} tone="cyan" hint="found on-chain" />
        <StatTile label="Disputed" value={v.disputed} tone="rose" />
        <StatTile label="Clawed back" value={v.clawedBack} tone="slate" />
      </div>

      {plan.length > 0 && <CardPlanCard campaignId={campaignId} planZat={plan} registered={v.list} />}

      <Card className="print:hidden">
        <CardHeader className="sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-mint" /> Import gift cards
            </CardTitle>
            <CardDescription>
              Paste the gift-card CSV from Vizor or Zodl. Card links (with their <code className="font-mono">#key=</code> secrets) are read in this
              browser to draw the QR slips; only card IDs, amounts and memo-code hashes are sent.
              {plan.length > 0 && " Each card must match an amount still open in the card plan."}
            </CardDescription>
          </div>
          <Segmented
            ariaLabel="Who minted the cards"
            value={splitCustody ? "dao" : "host"}
            onChange={(k) => setSplitCustody(k === "dao")}
            options={[
              { key: "dao", label: "DAO minted" },
              { key: "host", label: "Host minted" },
            ]}
          />
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            rows={4}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder="card_id,amount_zec,sweep_fee_buffer_zat,claim_url,ack_hash"
            className="font-mono text-[11.5px]"
            spellCheck={false}
          />
          {importMsg && <Notice tone={importMsg.tone}>{importMsg.text}</Notice>}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={importCsv} disabled={busy || !csv.trim()}>
              {busy ? "Registering..." : "Parse and register"}
            </Button>
            {isDemo && (
              <Button variant="ghost" size="sm" onClick={() => setCsv(SAMPLE_VIZOR_CSV)}>
                Load sandbox sample CSV
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="print:shadow-none print:bg-white">
        <CardHeader className="sm:flex-row sm:items-center sm:justify-between gap-3 print:hidden">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Ticket className="w-4 h-4 text-mint" /> Slips
            </CardTitle>
            <CardDescription>Print all slips, or hand them out one at a time at the desk to avoid shoulder-surfing.</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Segmented
              ariaLabel="Slip view"
              value={mode}
              onChange={setMode}
              options={[
                { key: "sheet", label: "Print sheet" },
                { key: "desk", label: "Desk mode" },
              ]}
            />
            {mode === "sheet" && slips.length > 0 && (
              <Button size="sm" variant="secondary" onClick={() => window.print()}>
                <Printer className="w-3.5 h-3.5" /> Print
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {slips.length === 0 ? (
            <Notice tone="info">
              QR slips are drawn from the gift-card links, which exist only in the browser that imported them. Paste the CSV again here to
              print or hand out slips.
            </Notice>
          ) : mode === "sheet" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 print:grid-cols-2">
              {slips.map((card) => (
                <QrSlipCard
                  key={card.cardId}
                  cardId={card.cardId}
                  amountZec={card.amountZec}
                  feeBufferZat={card.feeBufferZat}
                  secretUri={card.secretUri}
                  isSplitCustody={splitCustody}
                  isSample={slipsAreSamples}
                />
              ))}
            </div>
          ) : (
            desk && (
              <div className="max-w-sm mx-auto space-y-4">
                <p className="text-center font-mono text-[12px] text-subtle">
                  Card {Math.min(deskIndex, slips.length - 1) + 1} of {slips.length}
                </p>
                <QrSlipCard
                  cardId={desk.cardId}
                  amountZec={desk.amountZec}
                  feeBufferZat={desk.feeBufferZat}
                  secretUri={desk.secretUri}
                  isSplitCustody={splitCustody}
                  isSample={slipsAreSamples}
                />
                <div className="flex justify-between gap-3">
                  <Button variant="secondary" size="sm" disabled={deskIndex === 0} onClick={() => setDeskIndex((i) => Math.max(0, i - 1))}>
                    Previous
                  </Button>
                  <Button size="sm" disabled={deskIndex >= slips.length - 1} onClick={() => setDeskIndex((i) => i + 1)}>
                    Handed out, next
                  </Button>
                </div>
              </div>
            )
          )}
        </CardContent>
      </Card>

      <div className="print:hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Card</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Minted by</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Evidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {v.list.map((card) => (
              <TableRow key={card.cardId}>
                <TableCell className="font-mono font-semibold text-ink">{card.cardId}</TableCell>
                <TableCell className="text-right font-mono">{zecExact(card.amountZat)} ZEC</TableCell>
                <TableCell>{card.isSplitCustody ? "DAO" : "Host"}</TableCell>
                <TableCell>
                  <span className="flex flex-wrap gap-1.5">
                    <Badge variant={VOUCHER_BADGE[card.state].variant}>{VOUCHER_BADGE[card.state].label}</Badge>
                    {card.disputeReason && card.state !== "DISPUTED" && <Badge variant="transparent">Disputed</Badge>}
                  </span>
                </TableCell>
                <TableCell className="text-[11.5px] text-subtle">
                  {card.sweepTxid
                    ? `Sweep ${shortTxid(card.sweepTxid)}: ${checkHeadline(card.sweepCheck).label}`
                    : card.state === "ACK_CONFIRMED"
                      ? "Memo code only"
                      : card.clawbackTxid
                        ? `Clawback ${shortTxid(card.clawbackTxid)}`
                        : "-"}
                </TableCell>
              </TableRow>
            ))}
            {v.list.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-subtle py-6">
                  No gift cards registered yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-mint" /> Clawback
          </CardTitle>
          <CardDescription>
            After the clawback opens, sweep unredeemed cards to the return address in your wallet, then record that transaction. ZecClaim
            checks the live chain height and looks the txid up before marking cards.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className={`text-[12.5px] ${clawbackOpen ? "text-mint-deep font-semibold" : "text-muted"}`}>{clawbackStatus}</p>
          <div className="flex flex-col md:flex-row md:items-end gap-3">
            <div className="flex-1">
              <Label htmlFor="clawback-txid">Clawback transaction ID</Label>
              <Input
                id="clawback-txid"
                value={clawbackTxid}
                onChange={(e) => setClawbackTxid(e.target.value.trim())}
                placeholder="64 hex characters"
                className="font-mono text-[12px]"
                spellCheck={false}
              />
            </div>
            <Button variant="secondary" onClick={clawback} disabled={!clawbackOpen || !/^[0-9a-fA-F]{64}$/.test(clawbackTxid)}>
              Record clawback
            </Button>
          </div>
          {clawbackMsg && <Notice tone={clawbackMsg.tone}>{clawbackMsg.text}</Notice>}
        </CardContent>
      </Card>
    </div>
  );
}
