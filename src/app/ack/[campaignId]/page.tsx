"use client";

import React, { useState, useEffect, use } from "react";
import { BadgeCheck, CheckCircle2, Flag, FlaskConical } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Hint, Textarea, Notice } from "@/components/ui/field";
import { IconTile, PageHeading } from "@/components/ui/misc";
import { DEMO_ACK_CODES, DEMO_CAMPAIGN_ID } from "@/lib/demo/constants";
import { checkHeadline, shapeSummary } from "@/lib/chain/describe";
import type { ChainTxCheck } from "@/types";

interface AckPageProps {
  params: Promise<{ campaignId: string }>;
}

export default function AckSubmissionPage({ params }: AckPageProps) {
  const { campaignId } = use(params);
  const [network, setNetwork] = useState<"testnet" | "mainnet">("testnet");
  const [title, setTitle] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(campaignId === DEMO_CAMPAIGN_ID);
  const [lane, setLane] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [cardId, setCardId] = useState("");
  const [ackCode, setAckCode] = useState("");
  const [sweepTxid, setSweepTxid] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ackDone, setAckDone] = useState<{ cardId: string; sweepCheck: ChainTxCheck | null } | null>(null);
  const [ackError, setAckError] = useState<string | null>(null);

  const [disputeCardId, setDisputeCardId] = useState("");
  const [disputeDetails, setDisputeDetails] = useState("");
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const [disputeDone, setDisputeDone] = useState<string | null>(null);
  const [disputeError, setDisputeError] = useState<string | null>(null);


  useEffect(() => {
    fetch(`/api/campaigns/${campaignId}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((data) => {
        if (!data?.campaign) return;
        setNetwork(data.campaign.network);
        setTitle(data.campaign.title);
        setLane(data.campaign.lane);
        setIsDemo(Boolean(data.isDemo));
      })
      .catch(() => undefined);
  }, [campaignId]);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/vouchers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, ...body }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || "Request failed.");
    return data;
  };

  const handleAck = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setAckError(null);
    try {
      const data = await post({
        cardId: cardId.trim().toUpperCase(),
        ackCode: ackCode.trim().toUpperCase(),
        sweepTxid: sweepTxid.trim(),
      });
      setAckDone({ cardId: data.cardId, sweepCheck: data.sweepCheck ?? null });
    } catch (err) {
      setAckError(err instanceof Error ? err.message : "Failed to verify ACK code.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    setDisputeSubmitting(true);
    setDisputeError(null);
    try {
      const data = await post({ cardId: disputeCardId.trim().toUpperCase(), details: disputeDetails.trim() });
      setDisputeDone(data.cardId);
    } catch (err) {
      setDisputeError(err instanceof Error ? err.message : "Failed to record dispute.");
    } finally {
      setDisputeSubmitting(false);
    }
  };

  if (notFound) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4 animate-fade-up">
        <Badge variant="transparent">Not found</Badge>
        <h1 className="text-[22px] font-bold text-ink">No campaign with this ID</h1>
        <p className="text-sm text-muted">Check the receipt link printed on your slip or given by the organizer.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {lane === "ONLINE_BATCH" && (
        <Notice tone="warning">This campaign pays through claim links and has no gift cards. Use the link the organizer sent you.</Notice>
      )}
      <PageHeading
        eyebrow="Meetup gift card"
        title="Confirm your gift card"
        description={
          <>
            After sweeping your slip in Vizor or Zodl, find the <strong className="font-mono text-ink">ACK-XXXXXXXX</strong> code in
            the transaction memo and enter it here{title ? ` for ${title}` : ""}.
          </>
        }
        badges={
          <>
            <Badge variant={network === "mainnet" ? "shielded" : "sapling"}>{network}</Badge>
            {isDemo && <Badge variant="warning">Sandbox</Badge>}
          </>
        }
        actions={
          <ButtonLink href={`/proof/${campaignId}`} variant="secondary" size="sm">
            Proof portal
          </ButtonLink>
        }
      />

      {isDemo && (
        <section className="neo-inset rounded-[16px] px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <FlaskConical className="w-5 h-5 text-amber-fg shrink-0" />
            <div>
              <p className="text-[13px] font-semibold text-ink">Judge sandbox</p>
              <p className="text-[12px] text-subtle">
                In a real meetup the attendee reads the code from the card&apos;s memo after sweeping it. Here,{" "}
                <span className="font-mono">CARD-03</span> uses <span className="font-mono">{DEMO_ACK_CODES["CARD-03"]}</span>.
                A sweep txid is optional; any real testnet txid mined after the sandbox was anchored is accepted and checked live.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5 shrink-0">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setCardId("CARD-03");
                setAckCode(DEMO_ACK_CODES["CARD-03"]);
              }}
            >
              Fill CARD-03 receipt
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setDisputeCardId("CARD-05");
                setDisputeDetails("Scanned at 2:15 PM; the wallet said this card was already swept.");
              }}
            >
              Fill CARD-05 dispute
            </Button>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Card>
          <CardHeader className="flex-row items-center gap-3">
            <IconTile tone="mint">
              <BadgeCheck className="w-5 h-5" />
            </IconTile>
            <div>
              <CardTitle>Receipt</CardTitle>
              <CardDescription>Use the code from the memo your wallet shows after sweeping the card.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {ackDone ? (
              <div className="text-center space-y-3 py-4">
                <CheckCircle2 className="w-10 h-10 text-mint mx-auto" />
                <p className="text-[15px] font-bold text-ink">{ackDone.cardId} confirmed</p>
                <p className="text-[12.5px] text-muted">
                  {ackDone.sweepCheck
                    ? `Sweep transaction: ${checkHeadline(ackDone.sweepCheck).label}. ${shapeSummary(ackDone.sweepCheck.shape) ?? ""}`
                    : "Recorded on the public ledger with the memo code."}
                </p>
                <ButtonLink href={`/proof/${campaignId}`} size="sm">
                  View on proof portal
                </ButtonLink>
              </div>
            ) : (
              <form onSubmit={handleAck} className="space-y-4">
                {ackError && <Notice tone="error">{ackError}</Notice>}
                <div>
                  <Label htmlFor="card">Card ID (printed on the slip)</Label>
                  <Input id="card" value={cardId} onChange={(e) => setCardId(e.target.value)} placeholder="CARD-01" className="font-mono uppercase" required />
                </div>
                <div>
                  <Label htmlFor="ack">Memo code</Label>
                  <Input id="ack" value={ackCode} onChange={(e) => setAckCode(e.target.value)} placeholder="ACK-XXXXXXXX" className="font-mono uppercase" required />
                  <Hint>The code is inside the card&apos;s encrypted memo, not printed on the slip.</Hint>
                </div>
                <div>
                  <Label htmlFor="sweep">Sweep transaction ID (optional)</Label>
                  <Input
                    id="sweep"
                    value={sweepTxid}
                    onChange={(e) => setSweepTxid(e.target.value)}
                    placeholder="64-character txid from your wallet's transaction details"
                    className="font-mono text-[12px]"
                    pattern="[0-9a-fA-F]{64}"
                  />
                  <Hint>
                    ZecClaim looks it up on {network}: it must be mined after the campaign started. It becomes public
                    evidence that the card was swept, not who swept it.
                  </Hint>
                </div>
                <Button type="submit" className="w-full" disabled={submitting || !cardId.trim() || !ackCode.trim()}>
                  {submitting ? "Verifying..." : "Confirm receipt"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-3">
            <IconTile>
              <Flag className="w-5 h-5 text-rose-fg" />
            </IconTile>
            <div>
              <CardTitle>Slip already empty?</CardTitle>
              <CardDescription>Flag it publicly. Disputes stay on the proof portal, even if the card is confirmed later.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {disputeDone ? (
              <Notice tone="warning" className="space-y-1">
                <p className="font-semibold">Dispute recorded for {disputeDone}</p>
                <p className="font-normal">It now appears on the proof portal and stays there.</p>
              </Notice>
            ) : (
              <form onSubmit={handleDispute} className="space-y-4">
                {disputeError && <Notice tone="error">{disputeError}</Notice>}
                <div>
                  <Label htmlFor="dcard">Card ID</Label>
                  <Input id="dcard" value={disputeCardId} onChange={(e) => setDisputeCardId(e.target.value)} placeholder="CARD-05" className="font-mono uppercase" required />
                </div>
                <div>
                  <Label htmlFor="details">What happened</Label>
                  <Textarea id="details" rows={3} value={disputeDetails} onChange={(e) => setDisputeDetails(e.target.value)} placeholder="Got the slip at 2:15 PM; wallet said it was already swept." required minLength={5} maxLength={500} />
                </div>
                <Button type="submit" variant="danger" className="w-full" disabled={disputeSubmitting || !disputeCardId.trim() || disputeDetails.trim().length < 5}>
                  {disputeSubmitting ? "Submitting..." : "Flag on proof portal"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
