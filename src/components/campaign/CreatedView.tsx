"use client";

import React, { useState } from "react";
import { CalendarClock, Download, KeyRound, Link2, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/field";
import { CopyButton, KeyValueRow, PageHeading } from "@/components/ui/misc";
import { CheckRow } from "@/components/ui/choice";
import { ChainCheckBadge, ChainCheckText } from "@/components/chain/ChainCheck";
import { CardPlanCard } from "@/components/campaign/CardPlanCard";
import { downloadText, saveSecret } from "@/lib/client/organizer";
import { cardPlanReserveZat } from "@/lib/campaign/budget";
import { formatDateTime, zecExact, zecPlain } from "@/lib/format";
import type { ChainTxCheck, ZcashNetwork } from "@/types";

export interface CreatedCampaign {
  campaignId: string;
  adminSecret: string;
  title: string;
  network: ZcashNetwork;
  /** Amount shared by every link, or null when the links have their own amounts. */
  slotAmountZat: number | null;
  /** Gift-card amounts anchored with the campaign (null without a plan). */
  cardPlanZat: number[] | null;
  fundingCheck: ChainTxCheck | null;
  clawbackExpiryHeight: number;
  clawbackAt: string | null;
  tokens: Array<{ slotIndex: number; token: string; claimPath: string; amountZat: number }>;
}

export function linksCsv(origin: string, tokens: { slotIndex: number; claimPath: string; amountZat: number }[]) {
  return ["link_number,amount_zec,claim_link", ...tokens.map((t) => `${t.slotIndex + 1},${zecPlain(t.amountZat)},${origin}${t.claimPath}`)].join("\n");
}

/** Shown once after anchoring: the organizer secret and the claim links are never shown again. */
export function CreatedView({ created }: { created: CreatedCampaign }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const links = created.tokens.map((t) => ({ ...t, url: `${origin}${t.claimPath}` }));
  const [remember, setRemember] = useState(false);
  const [saved, setSaved] = useState(false);
  const linksTotalZat = links.reduce((sum, l) => sum + l.amountZat, 0);
  const plan = created.cardPlanZat ?? [];

  const backup = () =>
    downloadText(
      `zecclaim-${created.campaignId}-backup.txt`,
      [
        `ZecClaim campaign backup. Keep this file private: the organizer secret controls the campaign.`,
        ``,
        `Campaign: ${created.title}`,
        `Campaign ID: ${created.campaignId}`,
        `Network: ${created.network}`,
        `Organizer console: ${origin}/admin/${created.campaignId}`,
        `Proof portal: ${origin}/proof/${created.campaignId}`,
        `Organizer secret: ${created.adminSecret}`,
        `Clawback opens at block ${created.clawbackExpiryHeight}${created.clawbackAt ? ` (about ${new Date(created.clawbackAt).toUTCString()})` : ""}`,
        ``,
        ...(links.length
          ? [
              `Claim links (one per recipient, ${created.slotAmountZat !== null ? `${zecExact(created.slotAmountZat)} ZEC each` : `${zecExact(linksTotalZat)} ZEC in total`}):`,
              ...links.map((l) => `${l.slotIndex + 1}. ${zecExact(l.amountZat)} ZEC  ${l.url}`),
            ]
          : []),
        ...(plan.length
          ? [
              ``,
              `Gift-card plan (${plan.length} cards, fund with ${zecExact(cardPlanReserveZat(plan))} ZEC including sweep buffers):`,
              ...plan.map((a, i) => `${i + 1}. ${zecExact(a)} ZEC`),
            ]
          : []),
      ].join("\n")
    );

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-up">
      <PageHeading
        eyebrow="Campaign anchored"
        title={created.title}
        description="Save the organizer secret and the claim links now. ZecClaim stores only their hashes, so it cannot show them again."
        badges={<Badge variant={created.network === "mainnet" ? "shielded" : "sapling"}>{created.network}</Badge>}
      />

      <Card>
        <CardHeader className="flex-row items-start gap-3">
          <span className="w-10 h-10 rounded-xl neo-icon-btn flex items-center justify-center text-rose-fg shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </span>
          <div>
            <CardTitle>Organizer secret</CardTitle>
            <CardDescription>
              Needed for every organizer action: exporting payouts, recording txids, reissuing links, scrubbing. Anyone with it can
              manage this campaign (never spend funds).
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <KeyValueRow label="Organizer secret" value={created.adminSecret} wrap />
          <KeyValueRow label="Campaign ID" value={created.campaignId} />
          <CheckRow
            id="remember-secret"
            checked={remember}
            onChange={(v) => {
              setRemember(v);
              saveSecret(created.campaignId, created.adminSecret, v);
            }}
            title="Remember the secret on this device."
          >
            Off: it stays in this browser tab only. Leave it off on shared computers.
          </CheckRow>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button onClick={backup}>
              <Download className="w-4 h-4" /> Download backup (.txt)
            </Button>
            <span className="text-[12px] text-subtle">Secret, links and campaign URLs in one private file.</span>
          </div>
        </CardContent>
      </Card>

      {links.length > 0 && (
        <Card>
          <CardHeader className="sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl neo-icon-btn flex items-center justify-center text-mint shrink-0">
                <Link2 className="w-5 h-5" />
              </span>
              <div>
                <CardTitle>
                  {links.length} claim link{links.length === 1 ? "" : "s"} ·{" "}
                  {created.slotAmountZat !== null ? `${zecExact(created.slotAmountZat)} ZEC each` : `${zecExact(linksTotalZat)} ZEC in total`}
                </CardTitle>
                <CardDescription>Send one link per recipient, privately. Each works once. Unused links can be reissued from the console.</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => downloadText(`zecclaim-${created.campaignId}-links.csv`, linksCsv(origin, links), "text/csv")}
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </Button>
              <CopyButton value={links.map((l) => l.url).join("\n")} label="Copy all links" />
            </div>
          </CardHeader>
          <CardContent>
            <ul className="neo-inset-sm rounded-xl divide-y divide-line max-h-80 overflow-y-auto">
              {links.map((l) => (
                <li key={l.token} className="flex items-center gap-3 px-3.5 py-2">
                  <span className="font-mono text-[11px] text-subtle w-7 shrink-0">#{l.slotIndex + 1}</span>
                  <span className="font-mono text-[11.5px] font-semibold text-ink shrink-0 min-w-[88px] text-right">{zecExact(l.amountZat)} ZEC</span>
                  <span className="font-mono text-[11.5px] text-ink-soft truncate flex-1" title={l.url}>
                    {l.url}
                  </span>
                  <CopyButton value={l.url} label={`Copy link ${l.slotIndex + 1}`} className="w-7 h-7" />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {plan.length > 0 && <CardPlanCard campaignId={created.campaignId} planZat={plan} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="neo-card-sm rounded-[14px] px-4 py-3.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-semibold text-ink">Funding transaction</p>
            <ChainCheckBadge check={created.fundingCheck} />
          </div>
          <ChainCheckText check={created.fundingCheck} />
        </div>
        <div className="neo-card-sm rounded-[14px] px-4 py-3.5 space-y-1.5">
          <p className="text-[12px] font-semibold text-ink flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-mint" /> Clawback
          </p>
          <p className="text-[12px] text-muted leading-relaxed">
            Opens at block <span className="font-mono text-ink">#{created.clawbackExpiryHeight.toLocaleString("en-US")}</span>
            {created.clawbackAt ? `, about ${formatDateTime(created.clawbackAt)}` : ""}. Unclaimed funds can be returned after that.
          </p>
        </div>
      </div>

      <div className="neo-inset rounded-[16px] px-5 py-4 space-y-4">
        <CheckRow id="saved-ack" checked={saved} onChange={setSaved} title="I saved the organizer secret and the claim links." />
        <div className="flex flex-wrap gap-3">
          <ButtonLink
            href={saved ? `/admin/${created.campaignId}` : undefined}
            aria-disabled={!saved}
            className={saved ? "" : "opacity-45 pointer-events-none"}
          >
            <KeyRound className="w-4 h-4" /> Open organizer console
          </ButtonLink>
          <ButtonLink href={`/proof/${created.campaignId}`} variant="secondary" target="_blank" rel="noopener">
            View proof portal
          </ButtonLink>
        </div>
        {!saved && (
          <Notice tone="warning" className="text-[12px]">
            Lost secrets cannot be recovered. Lost links can be reissued, but only with the secret.
          </Notice>
        )}
      </div>
    </div>
  );
}
