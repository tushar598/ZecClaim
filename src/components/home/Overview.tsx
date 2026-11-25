import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  FileCheck2,
  FlaskConical,
  KeyRound,
  Link2,
  Send,
  ShieldCheck,
  Ticket,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { IconTile } from "@/components/ui/misc";

/** What ZecClaim is, and what an organizer needs before starting. */
export function HeroPanel() {
  return (
    <section className="neo-card rounded-[20px] p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
      <div className="lg:col-span-7 space-y-5">
        <p className="text-[12.5px] font-semibold tracking-[0.04em] text-mint-hover">Non-custodial Zcash payouts</p>
        <h1 className="text-[clamp(1.75rem,3vw,2.4rem)] font-bold tracking-[-0.025em] leading-[1.15] text-ink [text-wrap:balance]">
          Pay meetup attendees and bounty winners in shielded ZEC
        </h1>
        <p className="text-[15px] leading-[1.65] text-muted max-w-xl">
          Send single-use claim links or hand out gift-card slips. ZecClaim checks every address is shielded, builds the
          payout for your own wallet to sign, then looks the transactions up on-chain and publishes a ledger anyone can
          audit. It never holds keys or funds.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <ButtonLink href="/admin/new" size="lg">
            Create a campaign
          </ButtonLink>
          <ButtonLink href="#how" variant="secondary" size="lg">
            How it works
          </ButtonLink>
        </div>
      </div>

      <div className="lg:col-span-5 neo-inset rounded-[16px] p-5 space-y-4">
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-subtle">Before you start</p>
        {[
          {
            icon: Wallet,
            title: "A shielded wallet account",
            body: "Zingo PC or zingo-cli, with the prize pool in an Orchard account you use only for this campaign.",
          },
          {
            icon: KeyRound,
            title: "Its viewing key (UFVK)",
            body: "Read-only. In zingo-cli: export_ufvk. It can view the account but never spend from it.",
          },
          {
            icon: Send,
            title: "The funding transaction ID",
            body: "The txid that moved the pool into that account. ZecClaim looks it up on-chain before anything goes out.",
          },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex gap-3.5">
            <span className="w-8 h-8 rounded-lg neo-icon-btn flex items-center justify-center shrink-0 text-mint">
              <Icon className="w-4 h-4" />
            </span>
            <div>
              <p className="text-[13.5px] font-semibold text-ink">{title}</p>
              <p className="text-[12.5px] text-muted leading-relaxed">{body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const LANES = [
  {
    icon: Link2,
    name: "Online bounties",
    tag: "Claim links",
    steps: [
      "Create the campaign: you get one single-use link per winner (stored only as hashes).",
      "Winners open their link and paste a shielded address. Transparent and mixed addresses are refused.",
      "Lock the queue and export: ZIP 321 payment URIs or a zingo-cli script, at most 300 actions per transaction.",
      "Sign and send from your wallet, then paste the txid. ZecClaim checks it is mined, fully shielded and big enough.",
      "Scrub the stored addresses. Winners can reopen their link to see the payout transaction.",
    ],
  },
  {
    icon: Ticket,
    name: "In-person meetups",
    tag: "Gift-card slips",
    steps: [
      "Mint ZIP 324 gift cards in Vizor or Zodl and import the CSV. Card keys stay in your browser.",
      "Print the QR slips or hand them out one at a time in desk mode.",
      "Attendees sweep the card in their wallet and confirm it with the memo code on the receipt page.",
      "Anyone can flag a slip that was already empty; disputes stay public.",
      "After the clawback date, sweep unclaimed cards back and record the clawback txid.",
    ],
  },
];

/** The two payout lanes, step by step, plus what every campaign shares. */
export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-10 space-y-5">
      <div>
        <h2 id="how-title" className="text-[18px] font-bold tracking-[-0.015em] text-ink">
          How it works
        </h2>
        <p className="text-[12.5px] text-subtle mt-0.5">
          Every campaign is anchored to a viewing key and an on-chain funding transaction, and ends on a public proof portal.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {LANES.map((lane) => {
          const Icon = lane.icon;
          return (
            <div key={lane.name} className="neo-card rounded-[18px] p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <IconTile tone="mint">
                    <Icon className="w-5 h-5" />
                  </IconTile>
                  <h3 className="text-[15.5px] font-bold text-ink">{lane.name}</h3>
                </div>
                <Badge variant="default">{lane.tag}</Badge>
              </div>
              <ol className="space-y-3">
                {lane.steps.map((step, i) => (
                  <li key={step} className="flex gap-3 text-[13px] leading-relaxed text-ink-soft">
                    <span className="font-mono text-[11.5px] font-bold text-mint mt-[3px] w-4 shrink-0">{i + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>
      <div className="neo-inset rounded-[16px] px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <span className="flex items-center gap-3 text-[13px] text-ink-soft">
          <FileCheck2 className="w-5 h-5 text-mint shrink-0" />
          The proof portal shows where every zatoshi of the funding sits and what the chain confirmed, without revealing who was paid.
        </span>
      </div>
    </section>
  );
}

/** Single entry point to the labeled fixture campaign. */
export function SandboxCard() {
  return (
    <section aria-label="Judge sandbox" className="neo-card rounded-[18px] p-6 flex flex-col md:flex-row md:items-center justify-between gap-5">
      <div className="flex items-start gap-4">
        <IconTile>
          <FlaskConical className="w-5 h-5 text-amber-fg" />
        </IconTile>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[16px] font-bold text-ink">No testnet wallet at hand?</h2>
            <Badge variant="warning">Sandbox</Badge>
          </div>
          <p className="text-[13px] text-muted leading-relaxed max-w-2xl">
            The judge sandbox is one seeded testnet campaign with labeled fixture data. Every screen and check runs for real
            against it, and any txid you record there is looked up on the live testnet.
          </p>
        </div>
      </div>
      <Link
        href="/sandbox"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-mint-hover hover:text-mint-deep shrink-0"
      >
        Open the sandbox <ArrowRight className="w-4 h-4" />
      </Link>
    </section>
  );
}

const ENFORCED = [
  "Every address is decoded (ZIP 316) in the browser and again on the server; transparent receivers are refused.",
  "A campaign can only be anchored to a funding transaction that exists on-chain and has shielded outputs.",
  "Funding, payout, sweep and clawback txids are looked up on lightwalletd: height, transparent inputs and outputs, shielded actions.",
  "Recipients count as paid only once a payout tx with room for all of them is found; the scrub waits for it.",
  "Gift-card keys never leave the browser; claim links and organizer secrets are stored only as peppered hashes.",
  "Clawback opens only after the expiry height on the real chain. The viewing key is published only if you opt in.",
];

const TRUSTED = [
  "Shielded amounts are invisible on-chain, so the declared funding and payout amounts are the organizer's word.",
  "ZecClaim cannot see a gift card being swept (each card is its own key). Receipts rest on the memo code, plus an optional sweep txid.",
  "The organizer writes the memo codes, so a receipt shows liveness, not honesty. Public disputes are the signal that matters.",
  "The scrub hash commits to the deleted addresses; it cannot prove database backups were wiped.",
];

/** Honest summary of what the software enforces versus what remains trust. */
export function TrustModel() {
  return (
    <section id="trust" className="pt-10 border-t border-line/80 scroll-mt-10">
      <div className="flex items-center gap-3 mb-5">
        <IconTile tone="ink">
          <ShieldCheck className="w-5 h-5" />
        </IconTile>
        <div>
          <h2 className="text-[18px] font-bold tracking-[-0.015em] text-ink">Trust model</h2>
          <p className="text-[12.5px] text-subtle">Shielded pools have no escrow, so here is exactly where the line sits.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="neo-card rounded-[18px] p-6 space-y-3.5">
          <p className="text-[13px] font-bold text-ink">Enforced by ZecClaim</p>
          <ul className="space-y-3">
            {ENFORCED.map((line) => (
              <li key={line} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-soft">
                <CheckCircle2 className="w-4 h-4 text-mint shrink-0 mt-0.5" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="neo-inset rounded-[18px] p-6 space-y-3.5">
          <p className="text-[13px] font-bold text-ink">Still trust-based</p>
          <ul className="space-y-3">
            {TRUSTED.map((line) => (
              <li key={line} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-soft">
                <CircleDashed className="w-4 h-4 text-amber-fg shrink-0 mt-0.5" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
