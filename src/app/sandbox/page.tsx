import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, FileCheck2, FlaskConical, Layers, Link2, Ticket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { IconTile, KeyValueRow, PageHeading } from "@/components/ui/misc";
import { Notice } from "@/components/ui/field";
import { SandboxReset } from "@/components/proof/JudgeSandboxStrip";
import { isSandboxEnabled } from "@/lib/demo/sandbox";
import { seedDemoCampaign } from "@/lib/db/seedDemo";
import { DEMO_ACK_CODES, DEMO_ADMIN_SECRET, DEMO_CAMPAIGN_ID, DEMO_CLAIM_TOKENS } from "@/lib/demo/constants";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Judge sandbox" };

/**
 * The only page that points at fixture data. It seeds the sandbox campaign on first visit and
 * walks a judge through every step without needing a funded testnet wallet.
 */
export default async function SandboxPage() {
  if (!isSandboxEnabled()) notFound();
  await seedDemoCampaign(false);

  const steps = [
    {
      icon: Link2,
      title: "Claim with a shielded address",
      body: "Open a claim link. Try the transparent or mixed example address first and watch it get refused, then submit a shielded one.",
      href: `/claim/${DEMO_CLAIM_TOKENS.slot2}`,
      cta: "Open claim link",
    },
    {
      icon: Ticket,
      title: "Confirm a meetup slip",
      body: `Confirm CARD-03 with its memo code ${DEMO_ACK_CODES["CARD-03"]}. Optionally add any recent testnet txid as the sweep: it is looked up live. Then flag CARD-05 as empty.`,
      href: `/ack/${DEMO_CAMPAIGN_ID}`,
      cta: "Open receipt page",
    },
    {
      icon: Layers,
      title: "Export, pay and scrub",
      body: "Sign in with the sandbox secret, lock the queue, export the ZIP 321 URI or zingo-cli script, record a testnet payout txid (checked live), then scrub.",
      href: `/admin/${DEMO_CAMPAIGN_ID}`,
      cta: "Open organizer console",
    },
    {
      icon: FileCheck2,
      title: "Audit it publicly",
      body: "See where every zatoshi sits, what the chain confirms, the dispute, the scrub commitment and the event trail.",
      href: `/proof/${DEMO_CAMPAIGN_ID}`,
      cta: "Open proof portal",
    },
  ];

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeading
        eyebrow="For judges and first-time visitors"
        title="Judge sandbox"
        description="One seeded testnet campaign that exercises every step without a funded wallet. Its fixture data is labeled everywhere it appears; everything you do here runs through the real API and the real chain checks."
        badges={<Badge variant="warning">Fixture data</Badge>}
        actions={<SandboxReset campaignId={DEMO_CAMPAIGN_ID} />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <KeyValueRow label="Sandbox organizer secret (public, unlocks only this campaign)" value={DEMO_ADMIN_SECRET} />
        <KeyValueRow label="Sandbox campaign ID" value={DEMO_CAMPAIGN_ID} />
      </div>

      <ol className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <li key={step.title}>
              <Link
                href={step.href}
                className="group neo-card rounded-[18px] p-5 h-full flex flex-col justify-between gap-4 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <IconTile tone="mint">
                      <Icon className="w-5 h-5" />
                    </IconTile>
                    <span className="font-mono text-[12px] font-bold text-faint">0{i + 1}</span>
                  </div>
                  <h2 className="text-[15px] font-bold tracking-[-0.01em] text-ink">{step.title}</h2>
                  <p className="text-[12.5px] leading-[1.6] text-muted">{step.body}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-mint-hover group-hover:text-mint-deep">
                  {step.cta} <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      <Notice tone="info" className="flex items-start gap-3">
        <FlaskConical className="w-4 h-4 shrink-0 mt-0.5 text-amber-fg" />
        <span>
          The sandbox funding and earlier payout txids are fixtures (shown as &quot;Demo fixture&quot;, never as on-chain). Txids you record
          yourself are checked against the live testnet node. For a real run, create your own campaign with a funded testnet wallet.
        </span>
      </Notice>
    </div>
  );
}
