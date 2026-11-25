"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FolderOpen, ShieldCheck, SlidersHorizontal, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { IconTile } from "@/components/ui/misc";
import { useRememberedCampaigns } from "@/lib/client/hooks";
import { forgetCampaign, loadSecret } from "@/lib/client/organizer";
import { formatDate } from "@/lib/format";

const LANE_LABEL = { ONLINE_BATCH: "Claim links", OFFLINE_ZIP324: "Gift cards", HYBRID: "Links + cards" } as const;

/** Accepts a campaign ID or any ZecClaim console / proof / receipt URL. */
function extractCampaignId(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  const m = v.match(/\/(?:admin|proof|ack)\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{6,64}$/.test(v) ? v : null;
}

/** Home page strip: only rendered once this browser has campaigns. */
export function MyCampaignsStrip() {
  const list = useRememberedCampaigns();
  if (!list || list.length === 0) return null;
  const shown = list.filter((c) => !c.isDemo).slice(0, 3);
  if (shown.length === 0) return null;
  return (
    <section aria-label="Your campaigns" className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-[16px] font-bold tracking-[-0.015em] text-ink">Your campaigns</h2>
        <Link href="/campaigns" className="text-[12.5px] font-semibold text-mint-hover hover:text-mint-deep inline-flex items-center gap-1">
          All campaigns <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {shown.map((c) => (
          <Link
            key={c.campaignId}
            href={`/admin/${c.campaignId}`}
            className="neo-card rounded-[16px] p-4 hover:-translate-y-0.5 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint"
          >
            <div className="flex items-center justify-between gap-2">
              <Badge variant={c.network === "mainnet" ? "shielded" : "sapling"}>{c.network}</Badge>
              <span className="text-[11px] text-subtle">{LANE_LABEL[c.lane]}</span>
            </div>
            <p className="text-[14px] font-semibold text-ink mt-2.5 truncate">{c.title}</p>
            <p className="font-mono text-[11px] text-subtle mt-0.5">{c.campaignId}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Full list for /campaigns. */
export function MyCampaignsList() {
  const list = useRememberedCampaigns();
  const router = useRouter();
  const [lookup, setLookup] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);

  const open = (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractCampaignId(lookup);
    if (!id) {
      setLookupError("Paste a campaign ID or a ZecClaim console or proof portal link.");
      return;
    }
    router.push(`/admin/${id}`);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={open} className="neo-card rounded-[16px] p-5 flex flex-col md:flex-row md:items-end gap-3">
        <div className="flex-1">
          <label htmlFor="lookup" className="block text-[11.5px] font-semibold text-subtle mb-1.5">
            Open a campaign from another device
          </label>
          <Input
            id="lookup"
            value={lookup}
            onChange={(e) => {
              setLookup(e.target.value);
              setLookupError(null);
            }}
            placeholder="Campaign ID or console / proof portal link"
            className="font-mono text-[12.5px]"
            spellCheck={false}
          />
          {lookupError && <p className="text-[11.5px] text-rose-fg mt-1.5">{lookupError}</p>}
        </div>
        <Button type="submit" variant="secondary">
          Open console
        </Button>
      </form>

      {list === null ? null : list.length === 0 ? (
        <div className="neo-inset rounded-[16px] px-6 py-12 text-center space-y-3">
          <FolderOpen className="w-8 h-8 text-faint mx-auto" />
          <p className="text-[14px] font-semibold text-ink">No campaigns in this browser yet</p>
          <p className="text-[12.5px] text-muted max-w-md mx-auto">
            Campaigns you create or open here are remembered in this browser only. ZecClaim has no public campaign list.
          </p>
          <ButtonLink href="/admin/new" size="sm" className="mt-2">
            Create a campaign
          </ButtonLink>
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((c) => {
            const signedIn = Boolean(loadSecret(c.campaignId));
            return (
              <li key={c.campaignId} className="neo-card rounded-[16px] px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <IconTile tone="mint">
                    <SlidersHorizontal className="w-4 h-4" />
                  </IconTile>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14.5px] font-semibold text-ink truncate">{c.title}</p>
                      <Badge variant={c.network === "mainnet" ? "shielded" : "sapling"}>{c.network}</Badge>
                      {c.isDemo && <Badge variant="warning">Sandbox</Badge>}
                    </div>
                    <p className="text-[12px] text-subtle mt-0.5">
                      <span className="font-mono">{c.campaignId}</span> · {LANE_LABEL[c.lane]} · saved {formatDate(c.savedAt)}
                      {signedIn ? " · signed in" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <ButtonLink href={`/admin/${c.campaignId}`} size="sm">
                    Console
                  </ButtonLink>
                  <ButtonLink href={`/proof/${c.campaignId}`} size="sm" variant="secondary">
                    <ShieldCheck className="w-3.5 h-3.5" /> Proof
                  </ButtonLink>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Forget ${c.title} in this browser`}
                    title="Forget in this browser (also removes the saved organizer secret)"
                    onClick={() => {
                      if (window.confirm(`Forget "${c.title}" in this browser? The campaign itself is not deleted.`)) forgetCampaign(c.campaignId);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
