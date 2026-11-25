"use client";

import React, { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, ExternalLink, LogOut, RefreshCw, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { KeyValueRow, PageHeading } from "@/components/ui/misc";
import { UnderlineTabs } from "@/components/ui/tabs";
import { ChainCheckBadge, ChainCheckText } from "@/components/chain/ChainCheck";
import { AuditTrail } from "@/components/proof/AuditTrail";
import { JudgeSandboxStrip } from "@/components/proof/JudgeSandboxStrip";
import { SecretGate } from "@/components/console/SecretGate";
import { LinksPanel } from "@/components/console/LinksPanel";
import { PayoutPanel } from "@/components/console/PayoutPanel";
import { GiftCardsPanel } from "@/components/console/GiftCardsPanel";
import type { AdminPost, CampaignResponse } from "@/components/console/types";
import { useChainTip, usePolling } from "@/lib/client/hooks";
import { clearSecret, loadSecret, rememberCampaign, saveSecret } from "@/lib/client/organizer";
import { blocksToDuration, timeForHeight } from "@/lib/chain/blockTime";
import { formatDateTime, zecExact } from "@/lib/format";

type Tab = "links" | "payout" | "cards" | "activity";

interface AdminPageProps {
  params: Promise<{ campaignId: string }>;
}

export default function OrganizerConsole({ params }: AdminPageProps) {
  const { campaignId } = use(params);
  const [data, setData] = useState<CampaignResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [auth, setAuth] = useState<"checking" | "signed-out" | "signed-in">("checking");
  const [authError, setAuthError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setLoadError(res.status === 404 ? "No campaign with this ID on this ZecClaim instance." : json.error || "Could not load the campaign.");
      } else {
        setData(json);
        setLoadError(null);
        setUpdatedAt(Date.now());
      }
    } catch {
      setLoadError((e) => e ?? "Network error loading the campaign.");
    } finally {
      setRefreshing(false);
    }
  }, [campaignId]);

  const verify = useCallback(
    async (candidate: string) => {
      const res = await fetch(`/api/campaigns/${campaignId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": candidate },
        body: "{}",
      });
      const json = await res.json().catch(() => ({}));
      return { ok: res.ok && json.success, error: json.error as string | undefined };
    },
    [campaignId]
  );

  // Load the public summary and try a saved secret.
  useEffect(() => {
    refresh();
    const saved = loadSecret(campaignId);
    if (!saved) {
      setAuth("signed-out");
      return;
    }
    verify(saved.secret).then((r) => {
      if (r.ok) {
        setSecret(saved.secret);
        setAuth("signed-in");
      } else {
        clearSecret(campaignId);
        setAuth("signed-out");
      }
    });
  }, [campaignId, refresh, verify]);

  // Default tab from the URL or the campaign lane.
  useEffect(() => {
    if (!data || tab) return;
    const requested = new URLSearchParams(window.location.search).get("tab");
    const lane = data.campaign.lane;
    const allowed: Tab[] = lane === "OFFLINE_ZIP324" ? ["cards", "activity"] : lane === "ONLINE_BATCH" ? ["links", "payout", "activity"] : ["links", "payout", "cards", "activity"];
    const legacy = requested === "lane2" ? "payout" : requested === "lane1" ? "cards" : requested;
    setTab(allowed.includes(legacy as Tab) ? (legacy as Tab) : allowed[0]);
  }, [data, tab]);

  // Remember the campaign in this browser once signed in.
  useEffect(() => {
    if (auth === "signed-in" && data) {
      rememberCampaign({
        campaignId,
        title: data.campaign.title,
        network: data.campaign.network,
        lane: data.campaign.lane,
        isDemo: data.isDemo,
      });
    }
  }, [auth, data, campaignId]);

  usePolling(refresh, 15_000, auth === "signed-in");
  const tip = useChainTip(data?.campaign.network ?? null, 60_000);

  const adminPost: AdminPost = async (url, body) => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret ?? "" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (res.status === 401 || res.status === 403) {
        clearSecret(campaignId);
        setAuth("signed-out");
        setAuthError("Your organizer secret is no longer accepted. Sign in again.");
      }
      return { ok: res.ok && Boolean(json.success), status: res.status, json };
    } catch {
      return { ok: false, status: 0, json: { error: "Network error. Check your connection and try again." } };
    }
  };

  if (loadError && !data) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4 animate-fade-up">
        <Badge variant="transparent">Not found</Badge>
        <h1 className="text-[22px] font-bold text-ink">{loadError}</h1>
        <p className="text-[13px] text-muted">Check the campaign ID, or open it from My campaigns.</p>
        <div className="flex justify-center gap-3">
          <ButtonLink href="/campaigns" size="sm" variant="secondary">
            My campaigns
          </ButtonLink>
          <ButtonLink href="/admin/new" size="sm">
            Create a campaign
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (!data || auth === "checking") {
    return (
      <div className="space-y-5 animate-pulse" aria-busy="true" aria-label="Loading campaign">
        <div className="h-8 w-72 rounded-lg neo-inset-sm" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-[14px] neo-inset-sm" />
          ))}
        </div>
        <div className="h-64 rounded-[18px] neo-inset-sm" />
      </div>
    );
  }

  if (auth === "signed-out") {
    return (
      <SecretGate
        campaignId={campaignId}
        title={data.campaign.title}
        network={data.campaign.network}
        isDemo={data.isDemo}
        error={authError}
        onSubmit={async (candidate, remember) => {
          const r = await verify(candidate);
          if (!r.ok) {
            setAuthError(r.error ?? "Wrong organizer secret.");
            return;
          }
          saveSecret(campaignId, candidate, remember);
          setSecret(candidate);
          setAuthError(null);
          setAuth("signed-in");
        }}
      />
    );
  }

  const c = data.campaign;
  const lane = c.lane;
  const tabs: { key: Tab; label: string }[] = [
    ...(lane !== "OFFLINE_ZIP324"
      ? [
          { key: "links" as Tab, label: `Claim links (${data.slots.total})` },
          { key: "payout" as Tab, label: "Payout" },
        ]
      : []),
    ...(lane !== "ONLINE_BATCH" ? [{ key: "cards" as Tab, label: `Gift cards (${data.vouchers.total})` }] : []),
    { key: "activity", label: "Activity" },
  ];
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const clawbackEstimate =
    tip.height !== null
      ? timeForHeight({ height: tip.height, timeMs: tip.timeMs ?? Date.now() }, c.clawbackExpiryHeight)
      : c.clawbackAt
        ? Date.parse(c.clawbackAt)
        : null;
  const blocksLeft = tip.height !== null ? c.clawbackExpiryHeight - tip.height : null;
  const panelProps = { data, campaignId, adminPost, refresh };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="print:hidden space-y-6">
        <PageHeading
          eyebrow="Organizer console"
          title={c.title}
          description={c.description ?? undefined}
          badges={
            <>
              <Badge variant={c.network === "mainnet" ? "shielded" : "sapling"}>{c.network}</Badge>
              {data.isDemo && <Badge variant="warning">Sandbox</Badge>}
            </>
          }
          actions={
            <>
              <ButtonLink href={`/proof/${campaignId}`} target="_blank" rel="noopener" variant="secondary" size="sm">
                <ExternalLink className="w-3.5 h-3.5" /> Proof portal
              </ButtonLink>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearSecret(campaignId);
                  setSecret(null);
                  setAuthError(null);
                  setAuth("signed-out");
                }}
              >
                <LogOut className="w-3.5 h-3.5" /> Sign out
              </Button>
            </>
          }
        />

        {data.isDemo && <JudgeSandboxStrip campaignId={campaignId} />}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="neo-card-sm rounded-[14px] px-4 py-3.5">
            <p className="text-[11.5px] font-medium text-subtle flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5" /> Pool (declared)
            </p>
            <p className="font-mono tabular-nums text-[20px] font-bold mt-1 text-ink">{zecExact(c.totalFundedZat)} ZEC</p>
            <p className="text-[11px] text-subtle mt-1">Campaign <span className="font-mono">{campaignId}</span></p>
          </div>
          <div className="neo-card-sm rounded-[14px] px-4 py-3.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11.5px] font-medium text-subtle">Funding transaction</p>
              <ChainCheckBadge check={c.fundingCheck} />
            </div>
            <ChainCheckText check={c.fundingCheck} />
          </div>
          <div className="neo-card-sm rounded-[14px] px-4 py-3.5">
            <p className="text-[11.5px] font-medium text-subtle flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5" /> Clawback
            </p>
            <p className="text-[14px] font-semibold text-ink mt-1">
              {blocksLeft !== null && blocksLeft <= 0 ? "Open now" : clawbackEstimate ? formatDateTime(clawbackEstimate) : "-"}
            </p>
            <p className="text-[11px] text-subtle mt-1">
              Block #{c.clawbackExpiryHeight.toLocaleString("en-US")}
              {blocksLeft !== null && blocksLeft > 0 ? ` · ${blocksToDuration(blocksLeft)} away` : ""}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <KeyValueRow label="Proof portal (public, share with your community)" value={`${origin}/proof/${campaignId}`} />
          {lane !== "ONLINE_BATCH" ? (
            <KeyValueRow label="Receipt page (give to meetup attendees)" value={`${origin}/ack/${campaignId}`} />
          ) : (
            <div className="neo-inset-sm rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-[12px] text-subtle">
                {updatedAt ? `Live: refreshes every 15 s. Last update ${new Date(updatedAt).toLocaleTimeString()}.` : "Live updates every 15 s."}
              </p>
              <Button size="sm" variant="ghost" onClick={() => refresh()} disabled={refreshing} aria-label="Refresh now">
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              </Button>
            </div>
          )}
        </div>

        {tab && <UnderlineTabs ariaLabel="Console sections" active={tab} onChange={setTab} tabs={tabs} />}
      </div>

      {tab === "links" && <LinksPanel {...panelProps} />}
      {tab === "payout" && <PayoutPanel {...panelProps} />}
      {tab === "cards" && <GiftCardsPanel {...panelProps} />}
      {tab === "activity" && (
        <div className="space-y-3">
          <AuditTrail
            events={data.auditEvents.map((e) => ({
              eventType: e.eventType,
              details: e.details ?? {},
              txid: e.txid ?? null,
              blockHeight: e.blockHeight ?? null,
              timestamp: new Date(e.timestamp).toISOString(),
            }))}
          />
          <p className="text-[12px] text-subtle">
            The same trail is public on the{" "}
            <Link href={`/proof/${campaignId}`} className="text-mint-hover hover:text-mint-deep font-semibold">
              proof portal
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
