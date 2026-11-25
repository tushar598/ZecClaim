import React from "react";
import { Badge } from "@/components/ui/badge";
import { KeyValueRow, StatTile } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { LiveRefresh } from "@/components/proof/LiveRefresh";
import { zecExact } from "@/lib/format";

export interface ProofPortalHeaderProps {
  campaignId: string;
  campaignTitle: string;
  description: string | null;
  ufvk: { fingerprint: string; published: string | null; items: string[] };
  totalFundedZat: number;
  clawbackAddress: string;
  clawbackExpiryHeight: number;
  /** Estimated time the clawback height is reached (ms), from the live tip; null if unknown. */
  clawbackEstimateMs: number | null;
  /** True once the live chain is past the clawback height. */
  clawbackOpen: boolean;
  network: "testnet" | "mainnet";
  isDemo: boolean;
  createdAt: string;
}

const utc = (ms: number | string) => new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";

const zec = zecExact;

export function ProofPortalHeader(props: ProofPortalHeaderProps) {
  return (
    <section className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-[12px] font-semibold tracking-[0.04em] text-mint-hover">Public proof portal</span>
            <Badge variant={props.network === "mainnet" ? "shielded" : "sapling"}>{props.network}</Badge>
            {props.isDemo && <Badge variant="warning">Sandbox fixtures</Badge>}
          </div>
          <h1 className="text-[24px] sm:text-[26px] font-bold tracking-[-0.02em] text-ink leading-tight [text-wrap:balance]">
            {props.campaignTitle}
          </h1>
          {props.description && <p className="text-[14px] text-muted mt-1.5 max-w-2xl">{props.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <LiveRefresh />
          <ButtonLink href={`/admin/${props.campaignId}`} variant="ghost" size="sm">
            Organizer console
          </ButtonLink>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatTile label="Declared funding" value={`${zec(props.totalFundedZat)} ZEC`} hint="Shielded amounts are not visible on-chain" />
        <StatTile
          label="Clawback"
          value={props.clawbackOpen ? "Open" : `#${props.clawbackExpiryHeight.toLocaleString("en-US")}`}
          hint={
            props.clawbackOpen
              ? `Past block #${props.clawbackExpiryHeight.toLocaleString("en-US")}`
              : props.clawbackEstimateMs
                ? `About ${utc(props.clawbackEstimateMs)}`
                : "Block height enforced on-chain"
          }
        />
        <StatTile label="Anchored" value={new Date(props.createdAt).toISOString().slice(0, 10)} hint="Registration date (UTC)" className="col-span-2 lg:col-span-1" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {props.ufvk.published ? (
          <KeyValueRow label={`Unified Full Viewing Key (published by the organizer; ${props.ufvk.items.join(", ")})`} value={props.ufvk.published} />
        ) : (
          <KeyValueRow
            label={`Viewing key fingerprint, SHA-256 (${props.ufvk.items.join(", ") || "UFVK"}; full key shared with auditors only)`}
            value={props.ufvk.fingerprint}
          />
        )}
        <KeyValueRow label="Clawback address (unclaimed funds return here)" value={props.clawbackAddress} />
      </div>
    </section>
  );
}
