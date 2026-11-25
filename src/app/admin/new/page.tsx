"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Circle, KeyRound, Link2, Loader2, Shuffle, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Hint, Notice, Textarea } from "@/components/ui/field";
import { PageHeading } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/tabs";
import { CheckRow, ChipGroup, FormSection, RadioCards } from "@/components/ui/choice";
import { CreatedView, type CreatedCampaign } from "@/components/campaign/CreatedView";
import { AmountSpecFields, type AmountFieldsState } from "@/components/campaign/AmountSpecFields";
import { inspectUnifiedViewingKey, inspectZcashAddress } from "@/lib/zcash/zip316";
import { cardPlanReserveZat, MAX_PLANNED_CARDS, MIN_CARD_SWEEP_BUFFER_ZAT, summarizeBudget } from "@/lib/campaign/budget";
import { MAX_CLAIM_LINKS, planCampaignAmounts, type AmountSpec } from "@/lib/campaign/amountPlan";
import { checkHeadline, shapeSummary, shieldedOutputCapacity } from "@/lib/chain/describe";
import { clawbackTimeProblem, heightForTime } from "@/lib/chain/blockTime";
import { useChainTip } from "@/lib/client/hooks";
import { rememberCampaign, saveSecret } from "@/lib/client/organizer";
import { formatDateTime, parseZecToZat, relativeTime, toDateTimeLocalValue, zecExact } from "@/lib/format";
import type { CampaignLane, ChainTxCheck, ZcashNetwork } from "@/types";

const DAY = 24 * 3600 * 1000;
const PRESETS = {
  "1d": { label: "1 day", ms: DAY },
  "3d": { label: "3 days", ms: 3 * DAY },
  "1w": { label: "1 week", ms: 7 * DAY },
  "2w": { label: "2 weeks", ms: 14 * DAY },
  "30d": { label: "30 days", ms: 30 * DAY },
} as const;
type Preset = keyof typeof PRESETS | "custom";

type CheckState = { state: "idle" | "checking" | "done"; check: ChainTxCheck | null };

const LANE_OPTIONS: { key: CampaignLane; title: string; body: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "ONLINE_BATCH", title: "Claim links", body: "Online bounties: one private link per winner.", icon: Link2 },
  { key: "OFFLINE_ZIP324", title: "Gift-card slips", body: "In-person meetups: ZIP 324 cards you mint in Vizor or Zodl.", icon: Ticket },
  { key: "HYBRID", title: "Both", body: "Links and gift cards from one pool: half each, or the amounts you plan.", icon: Shuffle },
];

function Requirement({ ok, pending, children }: { ok: boolean; pending?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[12.5px]">
      {pending ? (
        <Loader2 className="w-4 h-4 text-subtle animate-spin shrink-0 mt-px" />
      ) : ok ? (
        <CheckCircle2 className="w-4 h-4 text-mint shrink-0 mt-px" />
      ) : (
        <Circle className="w-4 h-4 text-faint shrink-0 mt-px" />
      )}
      <span className={ok ? "text-ink-soft" : "text-subtle"}>{children}</span>
    </li>
  );
}

/** Form fields -> the spec `planCampaignAmounts` resolves. */
function toSpec(state: AmountFieldsState): AmountSpec {
  const count = Number.parseInt(state.count, 10);
  return {
    mode: state.mode,
    count: Number.isInteger(count) ? count : null,
    fixedZat: parseZecToZat(state.fixedZec),
    customZat: state.custom.map(parseZecToZat),
  };
}

function amountRange(amounts: number[]): string {
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  return min === max ? `${zecExact(min)} ZEC` : `${zecExact(min)} to ${zecExact(max)}`;
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[12.5px]">
      <span className="text-subtle">{label}</span>
      <span className={`font-mono text-right ${strong ? "font-bold text-ink" : "font-semibold text-ink-soft"}`}>{value}</span>
    </div>
  );
}

export default function NewCampaignPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [lane, setLane] = useState<CampaignLane>("ONLINE_BATCH");
  const [networkChoice, setNetworkChoice] = useState<ZcashNetwork>("testnet");
  const [ufvk, setUfvk] = useState("");
  const [fundingTxid, setFundingTxid] = useState("");
  const [fundedZec, setFundedZec] = useState("");
  const [linkFields, setLinkFields] = useState<AmountFieldsState>({ mode: "split", count: "5", fixedZec: "", custom: [] });
  const [planCards, setPlanCards] = useState(false);
  const [cardFields, setCardFields] = useState<AmountFieldsState>({ mode: "split", count: "10", fixedZec: "", custom: [] });
  const [preset, setPreset] = useState<Preset>("1w");
  const [customAt, setCustomAt] = useState("");
  const [clawbackAddress, setClawbackAddress] = useState("");
  const [publishUfvk, setPublishUfvk] = useState(false);
  const [txCheck, setTxCheck] = useState<CheckState>({ state: "idle", check: null });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedCampaign | null>(null);
  // Null while prerendering and hydrating. This page is static: reading the clock during render
  // would bake the build time (in the server's locale and time zone) into the HTML, which never
  // matches the browser's first render (React hydration error #418).
  const [now, setNow] = useState<number | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // The viewing key decides the network; the switch only matters before a key is pasted.
  const ufvkInspection = useMemo(() => (ufvk.trim() ? inspectUnifiedViewingKey(ufvk.trim()) : null), [ufvk]);
  const network: ZcashNetwork = ufvkInspection?.isValid && ufvkInspection.network ? ufvkInspection.network : networkChoice;
  const networkLocked = Boolean(ufvkInspection?.isValid && ufvkInspection.network);
  const tip = useChainTip(network);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Look the funding txid up as soon as it is complete (and again if the network changes).
  const txid = fundingTxid.trim().toLowerCase();
  const txidComplete = /^[0-9a-f]{64}$/.test(txid);
  useEffect(() => {
    if (!txidComplete) {
      setTxCheck({ state: "idle", check: null });
      return;
    }
    let cancelled = false;
    setTxCheck({ state: "checking", check: null });
    const timer = setTimeout(() => {
      fetch(`/api/chain/tx?network=${network}&txid=${txid}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => !cancelled && setTxCheck({ state: "done", check: j.check ?? null }))
        .catch(() => !cancelled && setTxCheck({ state: "done", check: null }));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [txid, txidComplete, network]);

  const hasLinks = lane !== "OFFLINE_ZIP324";
  const hasCards = lane !== "ONLINE_BATCH";
  const cardsPlanned = hasCards && planCards;
  const fundedZat = parseZecToZat(fundedZec);

  // Every amount the campaign will anchor, resolved exactly as the server does it.
  const linkSpec = toSpec(linkFields);
  const cardSpec = toSpec(cardFields);
  const { linksZat, cardsZat } = fundedZat
    ? planCampaignAmounts({ lane, totalFundedZat: fundedZat, links: linkSpec, cards: cardsPlanned ? cardSpec : null })
    : { linksZat: null, cardsZat: null };
  const links = hasLinks ? linksZat : [];
  const cards = cardsPlanned ? cardsZat : [];
  const budget =
    fundedZat && links && cards
      ? summarizeBudget({
          totalFundedZat: fundedZat,
          vouchers: [],
          slots: links.map((amountZat) => ({ amountZat, status: "UNCLAIMED" })),
          plannedCardsZat: cards,
        })
      : null;
  const linksTotalZat = budget?.slotAllocatedZat ?? 0;
  const linksVary = Boolean(links && links.length > 1 && links.some((a) => a !== links[0]));
  // Without a card plan, a Hybrid campaign keeps half of the pool free for gift cards.
  const hybridHalfZat = fundedZat ? Math.floor(fundedZat / 2) : 0;
  const hybridHalfExceeded = lane === "HYBRID" && !cardsPlanned && linkFields.mode !== "split" && budget !== null && linksTotalZat > hybridHalfZat;

  const budgetProblem: { where: "links" | "cards"; text: string } | null = (() => {
    if (!fundedZat) return null;
    if (hasLinks && links === null && linkFields.mode === "split" && linkSpec.count !== null && linkSpec.count >= 1 && linkSpec.count <= MAX_CLAIM_LINKS && (!cardsPlanned || cardsZat !== null)) {
      return { where: "links", text: `The pool is too small to cover these links plus the batch fee${cardsPlanned ? " after the card plan" : ""}.` };
    }
    if (cardsPlanned && cards === null && cardFields.mode === "split" && cardSpec.count !== null && cardSpec.count >= 1 && cardSpec.count <= MAX_PLANNED_CARDS && (!hasLinks || links !== null)) {
      return { where: "cards", text: `What is left of the pool cannot fund ${cardSpec.count} cards plus a ${zecExact(MIN_CARD_SWEEP_BUFFER_ZAT)} ZEC sweep buffer each.` };
    }
    if (budget?.isOverAllocated) {
      const parts = [
        ...(links && links.length ? [`${links.length} links (${zecExact(linksTotalZat)} ZEC)`, `${zecExact(budget.batchFeeReserveZat)} ZEC batch fee`] : []),
        ...(cards && cards.length ? [`${cards.length} cards with sweep buffers (${zecExact(budget.plannedCardReserveZat)} ZEC)`] : []),
      ];
      return {
        where: cardsPlanned ? "cards" : "links",
        text: `${parts.join(" plus ")} is ${zecExact(-budget.remainingZat)} ZEC more than the ${zecExact(fundedZat)} ZEC pool.`,
      };
    }
    if (hybridHalfExceeded) {
      return {
        where: "links",
        text: `The links total ${zecExact(linksTotalZat)} ZEC, more than the half kept for links (${zecExact(hybridHalfZat)} ZEC). Plan the gift cards below to use a different split.`,
      };
    }
    return null;
  })();
  const budgetOk = Boolean(fundedZat) && links !== null && cards !== null && budget !== null && !budget.isOverAllocated && !hybridHalfExceeded;

  const clawbackMs = now === null ? NaN : preset === "custom" ? (customAt ? new Date(customAt).getTime() : NaN) : now + PRESETS[preset].ms;
  const tipRef = now !== null && tip.height !== null ? { height: tip.height, timeMs: tip.timeMs ?? now } : null;
  const clawbackProblem = now === null ? null : clawbackTimeProblem({ height: 0, timeMs: now }, clawbackMs);
  const clawbackReady = now !== null && !clawbackProblem;
  const clawbackHeight = tipRef && clawbackReady ? heightForTime(tipRef, clawbackMs) : null;

  const clawbackInspection = useMemo(
    () => (clawbackAddress.trim() ? inspectZcashAddress(clawbackAddress.trim(), network) : null),
    [clawbackAddress, network]
  );
  const clawbackOk = Boolean(clawbackInspection?.isValid && clawbackInspection.isShielded && !clawbackInspection.hasTransparentReceiver);

  const check = txCheck.check;
  const fundingFound = check?.status === "MINED" || check?.status === "MEMPOOL" || check?.status === "SKIPPED";
  const fundingShieldless = check?.status === "MINED" && check.shape ? shieldedOutputCapacity(check.shape) === 0 : false;
  const fundingBlocking = check?.status === "NOT_FOUND" || fundingShieldless;
  const fundingUnverifiable = txCheck.state === "done" && (!check || check.status === "UNREACHABLE");

  const titleOk = title.trim().length >= 3;
  const ufvkOk = Boolean(ufvkInspection?.isValid);
  const ready =
    titleOk && ufvkOk && txidComplete && !fundingBlocking && txCheck.state !== "checking" && budgetOk && clawbackReady && clawbackOk;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || submitting) return;
    setError(null);
    setSubmitting(true);
    // Presets are relative to the moment of submission; custom dates are absolute.
    const clawbackAt = new Date(preset === "custom" ? clawbackMs : Date.now() + PRESETS[preset].ms).toISOString();
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          network,
          lane,
          ufvk: ufvk.trim(),
          fundingTxid: txid,
          totalFundedZat: fundedZat,
          slotCount: hasLinks && links ? links.length : 1,
          // A split is recomputed by the server with the same rule; fixed and custom are sent as set.
          ...(hasLinks && links && linkFields.mode === "fixed" ? { slotAmountZat: links[0] } : {}),
          ...(hasLinks && links && linkFields.mode === "custom" ? { slotAmountsZat: links } : {}),
          ...(cardsPlanned && cards ? { cardPlanZat: cards } : {}),
          clawbackAddress: clawbackAddress.trim(),
          clawbackAt,
          publishUfvk,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.error || `Could not create the campaign (HTTP ${res.status}).`);
        requestAnimationFrame(() => errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
        return;
      }
      saveSecret(data.campaignId, data.adminSecret, false);
      rememberCampaign({ campaignId: data.campaignId, title: data.title, network: data.network, lane: data.lane });
      setCreated({
        campaignId: data.campaignId,
        adminSecret: data.adminSecret,
        title: data.title,
        network: data.network,
        slotAmountZat: data.slotAmountZat ?? null,
        cardPlanZat: data.anchor.cardPlanZat ?? null,
        fundingCheck: data.fundingCheck ?? null,
        clawbackExpiryHeight: data.anchor.clawbackExpiryHeight,
        clawbackAt: data.anchor.clawbackAt ?? null,
        tokens: data.tokens ?? [],
      });
      window.scrollTo({ top: 0 });
    } catch {
      setError("Network error while creating the campaign. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (created) return <CreatedView created={created} />;

  const fundingHint = (() => {
    if (!fundingTxid.trim()) return { tone: "", text: "The transaction that moved the prize pool into the campaign account." };
    if (!txidComplete) return { tone: "text-rose-fg", text: "A transaction ID is 64 hexadecimal characters." };
    if (txCheck.state === "checking") return { tone: "", text: `Looking it up on ${network}...` };
    if (fundingShieldless) return { tone: "text-rose-fg", text: "Found, but it has no shielded outputs, so it cannot fund a shielded campaign." };
    if (check?.status === "NOT_FOUND") return { tone: "text-rose-fg", text: `Not found on ${network}. Check the txid and the network.` };
    if (fundingUnverifiable) return { tone: "text-amber-fg", text: "The node did not answer. You can still submit; the server checks again." };
    if (check) {
      const shape = shapeSummary(check.shape);
      return { tone: "text-mint-deep", text: `${checkHeadline(check).label}${shape ? `. ${shape[0].toUpperCase()}${shape.slice(1)}` : ""}.` };
    }
    return { tone: "", text: "" };
  })();

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeading
        eyebrow="New campaign"
        title="Create a payout campaign"
        description="Anchor the campaign to a read-only viewing key and its on-chain funding before any link or slip goes out. ZecClaim never asks for spending keys or seed phrases."
      />

      <form onSubmit={handleSubmit} noValidate className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8 space-y-5">
          {error && (
            <div ref={errorRef}>
              <Notice tone="error" className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </Notice>
            </div>
          )}

          <FormSection step={1} title="Campaign" description="Shown to recipients on their claim page and on the public proof portal.">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Zcash Mumbai Meetup #4"
                  maxLength={100}
                  aria-invalid={title.length > 0 && !titleOk}
                />
                {title.length > 0 && !titleOk && <Hint className="text-rose-fg">At least 3 characters.</Hint>}
              </div>
              <div>
                <Label htmlFor="description">Description (optional)</Label>
                <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the payouts are for" maxLength={500} />
              </div>
              <div>
                <Label>How will you pay people?</Label>
                <RadioCards name="Payout lane" value={lane} onChange={setLane} options={LANE_OPTIONS} className="grid-cols-1 md:grid-cols-3" />
              </div>
            </div>
          </FormSection>

          <FormSection
            step={2}
            title="Funding"
            description="Use a wallet account dedicated to this campaign. ZecClaim checks the funding transaction on-chain before anchoring."
            aside={
              networkLocked ? (
                <Badge variant={network === "mainnet" ? "shielded" : "sapling"}>{network} (from key)</Badge>
              ) : (
                <Segmented
                  ariaLabel="Network"
                  value={networkChoice}
                  onChange={setNetworkChoice}
                  options={[
                    { key: "testnet", label: "Testnet" },
                    { key: "mainnet", label: "Mainnet" },
                  ]}
                />
              )
            }
          >
            <div>
              <Label htmlFor="ufvk">Unified Full Viewing Key</Label>
              <Textarea
                id="ufvk"
                rows={3}
                value={ufvk}
                onChange={(e) => setUfvk(e.target.value)}
                placeholder={network === "testnet" ? "uviewtest1..." : "uview1..."}
                className="font-mono text-[12px] break-all"
                spellCheck={false}
                autoComplete="off"
                aria-invalid={Boolean(ufvkInspection && !ufvkInspection.isValid)}
              />
              {ufvkInspection ? (
                <Hint className={ufvkInspection.isValid ? "text-mint-deep" : "text-rose-fg"}>
                  {ufvkInspection.isValid
                    ? `Valid ${ufvkInspection.network ?? ""} viewing key (${ufvkInspection.items.map((i) => i.name).join(", ")}). Read-only: it can never spend.`
                    : ufvkInspection.errorMessage}
                </Hint>
              ) : (
                <Hint>
                  In zingo-cli run <code className="font-mono text-ink-soft">export_ufvk</code>. Starts with uview1 (mainnet) or uviewtest1 (testnet).
                </Hint>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="md:col-span-3">
                <Label htmlFor="txid">Funding transaction ID</Label>
                <div className="relative">
                  <Input
                    id="txid"
                    value={fundingTxid}
                    onChange={(e) => setFundingTxid(e.target.value.trim())}
                    placeholder="64 hex characters"
                    className="font-mono text-[12px] pr-9"
                    maxLength={64}
                    spellCheck={false}
                    autoComplete="off"
                    aria-invalid={fundingBlocking || (fundingTxid.length > 0 && !txidComplete)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    {txCheck.state === "checking" ? (
                      <Loader2 className="w-4 h-4 text-subtle animate-spin" />
                    ) : fundingFound && !fundingShieldless ? (
                      <CheckCircle2 className="w-4 h-4 text-mint" />
                    ) : fundingBlocking ? (
                      <AlertCircle className="w-4 h-4 text-rose-fg" />
                    ) : null}
                  </span>
                </div>
                {fundingHint.text && <Hint className={fundingHint.tone}>{fundingHint.text}</Hint>}
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="funded">Amount in the pool (ZEC)</Label>
                <Input
                  id="funded"
                  inputMode="decimal"
                  value={fundedZec}
                  onChange={(e) => setFundedZec(e.target.value.replace(",", "."))}
                  placeholder="1.0"
                  className="font-mono"
                  aria-invalid={fundedZec.length > 0 && !fundedZat}
                />
                <Hint className={fundedZec.length > 0 && !fundedZat ? "text-rose-fg" : undefined}>
                  {fundedZec.length > 0 && !fundedZat ? "A positive amount, up to 8 decimals." : "Shielded amounts are not visible on-chain, so this is published as declared."}
                </Hint>
              </div>
            </div>
          </FormSection>

          {hasLinks && (
            <FormSection
              step={3}
              title="Claim links"
              description="One private link per recipient. Each link can pay the same amount or its own. ZIP 2009 fees for the payout batch are reserved first, so the batch can always be paid."
            >
              <AmountSpecFields
                idPrefix="links"
                item="link"
                countLabel="Number of recipients"
                max={MAX_CLAIM_LINKS}
                state={linkFields}
                onChange={setLinkFields}
                amountsZat={links}
                splitNote={
                  lane === "HYBRID" ? (cardsPlanned ? "From what the card plan leaves, after fees." : "From half of the pool, after fees.") : "From the pool, after fees."
                }
              />
              {budgetProblem?.where === "links" && <Notice tone="error">{budgetProblem.text}</Notice>}
            </FormSection>
          )}

          {hasCards && (
            <FormSection
              step={hasLinks ? 4 : 3}
              title="Gift-card slips"
              description="You mint the cards in Vizor or Zodl; ZecClaim never creates card keys. Plan the amounts here to reserve them and hold the CSV import to them."
            >
              <CheckRow id="plan-cards" checked={planCards} onChange={setPlanCards} title="Plan each card's amount now.">
                Every imported card must then match an open planned amount, and the plan is published on the proof portal. Off: the
                amounts come from the gift-card CSV at import.
              </CheckRow>
              {planCards && (
                <>
                  <AmountSpecFields
                    idPrefix="cards"
                    item="card"
                    countLabel="Number of cards"
                    max={MAX_PLANNED_CARDS}
                    state={cardFields}
                    onChange={setCardFields}
                    amountsZat={cards}
                    splitNote={`${hasLinks ? (linkFields.mode === "split" ? "From half of the pool" : "From what the links leave") : "From the pool"}, after a ${zecExact(MIN_CARD_SWEEP_BUFFER_ZAT)} ZEC sweep buffer per card.`}
                  />
                  {cards && cards.length > 0 && (
                    <p className="neo-inset-sm rounded-xl px-4 py-3 text-[12.5px] text-ink-soft leading-relaxed">
                      Mint {cards.length} card{cards.length === 1 ? "" : "s"} and fund them with{" "}
                      <strong className="font-mono text-ink">{zecExact(cardPlanReserveZat(cards))} ZEC</strong> (amounts plus{" "}
                      {zecExact(MIN_CARD_SWEEP_BUFFER_ZAT)} ZEC sweep buffer each). The plan CSV is ready after you create the campaign.
                    </p>
                  )}
                </>
              )}
              {budgetProblem?.where === "cards" && <Notice tone="error">{budgetProblem.text}</Notice>}
            </FormSection>
          )}

          <FormSection
            step={3 + (hasLinks ? 1 : 0) + (hasCards ? 1 : 0)}
            title="Unclaimed funds"
            description="Pick when unclaimed money can come back to you. ZecClaim turns the date into a block height on the live chain and enforces the height."
          >
            <div className="space-y-3">
              <Label>Clawback opens after</Label>
              <ChipGroup
                label="Clawback after"
                value={preset}
                onChange={setPreset}
                options={[
                  ...Object.entries(PRESETS).map(([key, p]) => ({ key: key as Preset, label: p.label })),
                  { key: "custom" as Preset, label: "Pick a date" },
                ]}
              />
              {preset === "custom" && (
                <Input
                  type="datetime-local"
                  aria-label="Clawback date and time"
                  value={customAt}
                  min={now !== null ? toDateTimeLocalValue(now + 60 * 60 * 1000) : undefined}
                  onChange={(e) => setCustomAt(e.target.value)}
                  className="max-w-xs"
                />
              )}
              <div className="neo-inset-sm rounded-xl px-4 py-3 text-[12.5px] leading-relaxed" aria-live="polite">
                {now === null ? (
                  <span className="text-subtle">Reading the date...</span>
                ) : clawbackProblem ? (
                  <span className={preset === "custom" && !customAt ? "text-subtle" : "text-rose-fg"}>
                    {preset === "custom" && !customAt ? "Choose a date and time." : clawbackProblem}
                  </span>
                ) : (
                  <span className="text-ink-soft">
                    <strong className="text-ink">{formatDateTime(clawbackMs)}</strong> ({relativeTime(clawbackMs, now)})
                    <span className="text-subtle">
                      {" "}
                      ·{" "}
                      {clawbackHeight !== null
                        ? `about block #${clawbackHeight.toLocaleString("en-US")} on ${network} (now #${(tip.height as number).toLocaleString("en-US")})`
                        : tip.loading
                          ? "reading the chain height..."
                          : "chain height unavailable; the server converts it when you submit"}
                    </span>
                  </span>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="clawback">Return address (shielded)</Label>
              <Input
                id="clawback"
                value={clawbackAddress}
                onChange={(e) => setClawbackAddress(e.target.value.trim())}
                placeholder={network === "testnet" ? "utest1..." : "u1..."}
                className="font-mono text-[12px]"
                spellCheck={false}
                autoComplete="off"
                aria-invalid={Boolean(clawbackInspection && !clawbackOk)}
              />
              <Hint className={clawbackInspection ? (clawbackOk ? (clawbackInspection.warningMessage ? "text-amber-fg" : "text-mint-deep") : "text-rose-fg") : undefined}>
                {clawbackInspection
                  ? clawbackOk
                    ? clawbackInspection.warningMessage || "Shielded address accepted."
                    : clawbackInspection.errorMessage || "Must be a shielded address without transparent receivers."
                  : "Where unclaimed funds go, usually your treasury. Published on the proof portal."}
              </Hint>
            </div>

            <CheckRow id="publish-ufvk" checked={publishUfvk} onChange={setPublishUfvk} title="Publish the full viewing key on the proof portal.">
              Off by default: anyone holding it can decrypt every payout, recipient addresses included. Without it the portal shows the
              key&apos;s SHA-256 fingerprint and you share the key with auditors directly.
            </CheckRow>
          </FormSection>
        </div>

        <aside className="xl:col-span-4 space-y-4 xl:sticky xl:top-6">
          <div className="neo-card rounded-[18px] p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-bold text-ink">Summary</h2>
              <Badge variant={network === "mainnet" ? "shielded" : "sapling"}>{network}</Badge>
            </div>
            <div className="space-y-2.5">
              <Row label="Pool" value={fundedZat ? `${zecExact(fundedZat)} ZEC` : "-"} strong />
              {hasLinks && (
                <>
                  <Row label="Recipients" value={links ? links.length.toLocaleString("en-US") : "-"} />
                  <Row label="Per link" value={links && links.length ? amountRange(links) : "-"} />
                  {linksVary && <Row label="Links total" value={`${zecExact(linksTotalZat)} ZEC`} />}
                  <Row label="Batch fee reserve" value={budget ? `${zecExact(budget.batchFeeReserveZat)} ZEC` : "-"} />
                </>
              )}
              {cardsPlanned && (
                <>
                  <Row label="Planned cards" value={cards ? `${cards.length.toLocaleString("en-US")}${cards.length ? ` (${amountRange(cards)})` : ""}` : "-"} />
                  <Row label="Cards with buffers" value={budget ? `${zecExact(budget.plannedCardReserveZat)} ZEC` : "-"} />
                </>
              )}
              {lane === "OFFLINE_ZIP324" && !cardsPlanned && fundedZat && <Row label="For gift cards" value={`${zecExact(fundedZat)} ZEC`} />}
              {budget && !budget.isOverAllocated && (hasLinks || cardsPlanned) && (
                <Row label={lane === "HYBRID" && !cardsPlanned ? "Left for gift cards" : "Unallocated"} value={`${zecExact(budget.remainingZat)} ZEC`} />
              )}
              <Row label="Clawback" value={now !== null && !clawbackProblem ? relativeTime(clawbackMs, now).replace(/^in /, "") : "-"} />
            </div>

            <ul className="space-y-2 pt-3 border-t border-line" aria-label="Checklist">
              <Requirement ok={titleOk}>Title</Requirement>
              <Requirement ok={ufvkOk}>Valid viewing key</Requirement>
              <Requirement ok={txidComplete && fundingFound && !fundingShieldless} pending={txCheck.state === "checking"}>
                Funding transaction found on {network}
              </Requirement>
              <Requirement ok={budgetOk}>
                Budget covers {hasLinks ? (cardsPlanned ? "links, cards and fees" : "links and fees") : cardsPlanned ? "the planned cards" : "the pool"}
              </Requirement>
              <Requirement ok={clawbackReady}>Clawback date</Requirement>
              <Requirement ok={clawbackOk}>Shielded return address</Requirement>
            </ul>

            <Button type="submit" variant="solid" size="lg" className="w-full" disabled={!ready || submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              {submitting ? "Checking on-chain and anchoring..." : "Create campaign"}
            </Button>
            <p className="text-[11.5px] text-subtle leading-relaxed">
              The organizer secret{hasLinks ? " and claim links are" : " is"} generated on the server and shown once. Only hashes are stored.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}
