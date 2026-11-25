import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import crypto from "crypto";
import {
  ImportVouchersSchema,
  SubmitAckSchema,
  FlagDisputeSchema,
  ClawbackVouchersSchema,
} from "@/lib/validators";
import { verifyCampaignAdmin } from "@/lib/security/auth";
import { checkRateLimit, clientIp, tooManyRequests } from "@/lib/security/rateLimit";
import { getRepo } from "@/lib/db/repo";
import { checkTransaction, getChainTip } from "@/lib/chain/txCheck";
import type { CampaignRecord, VoucherCardRecord } from "@/types";
import { DEMO_CAMPAIGN_ID } from "@/lib/demo/constants";
import { summarizeBudget, formatZec, groupAmounts, matchCardsToPlan } from "@/lib/campaign/budget";
import { blocksToDuration } from "@/lib/chain/blockTime";

const isDemo = (c: CampaignRecord) => Boolean(c.isDemo || c.campaignId === DEMO_CAMPAIGN_ID);


/**
 * POST /api/vouchers
 * Lane 1 (meetup gift cards), dispatched on body shape:
 *
 * 1. ACK (`ackCode`): the recipient confirms a card with the code from the card's encrypted memo.
 *    Optional `sweepTxid` is looked up on-chain and kept as public evidence (must be mined after
 *    the campaign was anchored and not used for another card).
 * 2. Dispute (`details`): anyone reports a card as already empty. Public, rate limited.
 * 3. Clawback (`txid`, admin): after the expiry height, unclaimed cards are reconciled against a
 *    clawback transaction that must exist on-chain.
 * 4. Import (`cards`, admin): card metadata from a Vizor/Zodl CSV parsed in the browser. Keys never
 *    reach the server. With a card plan, each card must match an open plan amount (409 otherwise).
 *
 * ZecClaim cannot see a gift card being swept: each card is its own spending key, which the
 * campaign UFVK does not cover. Card states therefore record what recipients reported and what
 * the chain confirmed, never a simulated spend.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const repo = await getRepo();
    const now = new Date();

    // 1. Memo ACK submission
    if ("ackCode" in body) {
      const ipRl = await checkRateLimit(`ack:${clientIp(req)}`, 20, 60_000);
      if (!ipRl.allowed) return tooManyRequests("Too many ACK attempts. Please wait a minute.", ipRl);

      const parsed = SubmitAckSchema.parse(body);
      // Per-card limit on top of the per-IP limit, so rotating IPs cannot brute-force one card's code.
      const cardRl = await checkRateLimit(`ack-card:${parsed.campaignId}:${parsed.cardId}`, 10, 60_000);
      if (!cardRl.allowed) return tooManyRequests("Too many ACK attempts for this card. Please wait a minute.", cardRl);

      const campaign = await repo.getCampaign(parsed.campaignId);
      const card = campaign ? await repo.getCard(parsed.campaignId, parsed.cardId) : null;
      if (!campaign || !card) {
        return NextResponse.json({ success: false, error: "Card not found in this campaign." }, { status: 404 });
      }
      if (card.state === "ACK_CONFIRMED") {
        return NextResponse.json({ success: true, cardId: card.cardId, state: card.state, message: "This card was already confirmed." });
      }
      if (card.state === "CLAWED_BACK") {
        return NextResponse.json(
          { success: false, error: "This card was clawed back to the campaign treasury and can no longer be confirmed.", currentState: card.state },
          { status: 409 }
        );
      }

      const computed = crypto.createHash("sha256").update(parsed.ackCode.trim()).digest("hex");
      if (computed !== card.ackCodeHash) {
        return NextResponse.json({ success: false, error: "Invalid ACK code. It does not match the code in this card's memo." }, { status: 403 });
      }

      // Optional sweep evidence, checked only after the code matched (no chain calls for guessers).
      let sweep: Pick<VoucherCardRecord, "sweepTxid" | "sweepCheck"> = {};
      if (parsed.sweepTxid) {
        const others = (await repo.getCards(parsed.campaignId)).filter(
          (c) => c.cardId !== card.cardId && c.sweepTxid === parsed.sweepTxid
        );
        if (others.length > 0) {
          return NextResponse.json({ success: false, error: `That transaction is already recorded as the sweep of ${others[0].cardId}.` }, { status: 409 });
        }
        const check = await checkTransaction(campaign.network, parsed.sweepTxid);
        if (check.status === "NOT_FOUND") {
          return NextResponse.json(
            { success: false, error: `Sweep transaction not found on ${campaign.network}. Check the txid in your wallet, or leave it empty.`, sweepCheck: check },
            { status: 422 }
          );
        }
        if (check.status === "MINED" && campaign.anchorHeight && (check.height ?? 0) < campaign.anchorHeight) {
          return NextResponse.json(
            {
              success: false,
              error: `That transaction was mined at height ${check.height}, before this campaign was anchored (${campaign.anchorHeight}), so it cannot be this card's sweep.`,
              sweepCheck: check,
            },
            { status: 422 }
          );
        }
        sweep = { sweepTxid: parsed.sweepTxid, sweepCheck: check };
      }

      const afterDispute = card.state === "DISPUTED";
      const updated = await repo.updateCard(
        parsed.campaignId,
        card.cardId,
        { state: "ACK_CONFIRMED", ackSubmittedAt: now, ...sweep },
        ["UNCLAIMED", "DISPUTED"]
      );
      if (!updated) {
        return NextResponse.json({ success: false, error: "This card changed state during your request. Reload and try again." }, { status: 409 });
      }

      await repo.recordEvent({
        campaignId: campaign.campaignId,
        eventType: "ACK_VERIFIED",
        details: {
          cardId: card.cardId,
          amountZat: card.amountZat,
          afterDispute,
          sweepEvidence: sweep.sweepCheck ? sweep.sweepCheck.status : "none",
        },
        txid: sweep.sweepTxid,
        blockHeight: sweep.sweepCheck?.height ?? undefined,
        timestamp: now,
      });

      return NextResponse.json({
        success: true,
        cardId: card.cardId,
        state: "ACK_CONFIRMED",
        sweepCheck: sweep.sweepCheck ?? null,
        message: sweep.sweepCheck?.status === "MINED"
          ? "Receipt confirmed. The sweep transaction was found on-chain."
          : "Receipt confirmed with the memo code.",
      });
    }

    // 2. "Already empty" dispute
    if ("details" in body) {
      const rl = await checkRateLimit(`dispute:${clientIp(req)}`, 15, 60_000);
      if (!rl.allowed) return tooManyRequests("Too many dispute submissions. Please wait a minute.", rl);

      const parsed = FlagDisputeSchema.parse(body);
      const card = await repo.getCard(parsed.campaignId, parsed.cardId);
      if (!card) {
        return NextResponse.json({ success: false, error: "Card not found in this campaign." }, { status: 404 });
      }
      if (card.disputeReason) {
        return NextResponse.json({ success: false, error: `${card.cardId} already has a public dispute on record.`, currentState: card.state }, { status: 409 });
      }
      if (card.state === "CLAWED_BACK") {
        return NextResponse.json({ success: false, error: `${card.cardId} was clawed back after expiry; it cannot be disputed.`, currentState: card.state }, { status: 409 });
      }

      // A confirmed card can still be disputed (a thief may have swept a photographed slip and
      // confirmed it); it keeps its ACK_CONFIRMED state with the dispute shown next to it.
      const nextState = card.state === "ACK_CONFIRMED" ? "ACK_CONFIRMED" : "DISPUTED";
      const updated = await repo.updateCard(
        parsed.campaignId,
        card.cardId,
        { state: nextState, disputeReason: parsed.details, disputedAt: now },
        [card.state]
      );
      if (!updated) {
        return NextResponse.json({ success: false, error: "This card changed state during your request. Reload and try again." }, { status: 409 });
      }

      await repo.recordEvent({
        campaignId: parsed.campaignId,
        eventType: "DISPUTE_FLAGGED",
        details: { cardId: card.cardId, reason: parsed.details, wasConfirmed: card.state === "ACK_CONFIRMED" },
        timestamp: now,
      });

      return NextResponse.json({
        success: true,
        cardId: card.cardId,
        state: nextState,
        message: "Dispute recorded on the public proof portal.",
      });
    }

    // 3. Clawback after expiry (admin)
    if ("txid" in body) {
      const parsed = ClawbackVouchersSchema.parse(body);
      const auth = await verifyCampaignAdmin(req, parsed.campaignId);
      if (!auth.authorized) {
        return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });
      }
      const campaign = await repo.getCampaign(parsed.campaignId);
      if (!campaign) return NextResponse.json({ success: false, error: "Campaign not found." }, { status: 404 });

      const demo = isDemo(campaign);
      let tipHeight: number | null = null;
      let clawbackCheck = null;

      if (!demo) {
        const tip = await getChainTip(campaign.network);
        if (tip.height === null) {
          return NextResponse.json(
            { success: false, error: `Cannot confirm the expiry height right now (${tip.note}). Try again shortly.` },
            { status: 503 }
          );
        }
        tipHeight = tip.height;
        if (tip.height < campaign.clawbackExpiryHeight) {
          const remaining = campaign.clawbackExpiryHeight - tip.height;
          return NextResponse.json(
            {
              success: false,
              error: `Clawback opens at height ${campaign.clawbackExpiryHeight}. The chain is at ${tip.height}, ${remaining} blocks (${blocksToDuration(remaining)}) to go.`,
              tipHeight: tip.height,
            },
            { status: 409 }
          );
        }
        clawbackCheck = await checkTransaction(campaign.network, parsed.txid);
        if (clawbackCheck.status === "NOT_FOUND") {
          return NextResponse.json(
            { success: false, error: `Clawback transaction not found on ${campaign.network}. Broadcast it first, then record its txid.`, clawbackCheck },
            { status: 422 }
          );
        }
        if (clawbackCheck.status === "UNREACHABLE") {
          return NextResponse.json({ success: false, error: `Cannot check the clawback transaction right now (${clawbackCheck.note}).` }, { status: 503 });
        }
      }

      const unclaimed = (await repo.getCards(parsed.campaignId)).filter((c) => c.state === "UNCLAIMED");
      let clawedBackCount = 0;
      let totalZatReturned = 0;
      for (const c of unclaimed) {
        const updated = await repo.updateCard(parsed.campaignId, c.cardId, { state: "CLAWED_BACK", clawbackTxid: parsed.txid }, ["UNCLAIMED"]);
        if (updated) {
          clawedBackCount++;
          totalZatReturned += c.amountZat;
        }
      }

      await repo.recordEvent({
        campaignId: parsed.campaignId,
        eventType: "CLAWBACK_RECONCILED",
        details: {
          clawbackTxid: parsed.txid,
          clawbackAddress: campaign.clawbackAddress,
          cardsClawedBackCount: clawedBackCount,
          totalZatReturned,
          tipHeight,
          chainStatus: clawbackCheck?.status ?? "SKIPPED",
          ...(demo ? { simulated: true } : {}),
        },
        txid: parsed.txid,
        blockHeight: clawbackCheck?.height ?? undefined,
        timestamp: now,
      });

      return NextResponse.json({
        success: true,
        message: demo
          ? "Demo: unclaimed cards marked as clawed back (expiry and txid are not checked in the sandbox)."
          : "Unclaimed cards reconciled against the on-chain clawback transaction.",
        clawedBackCount,
        totalZatReturned,
        txid: parsed.txid,
        clawbackCheck,
      });
    }

    // 4. Card import from a Vizor / Zodl CSV (admin)
    const parsedImport = ImportVouchersSchema.parse(body);
    const auth = await verifyCampaignAdmin(req, parsedImport.campaignId);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });
    }

    const isSplitCustody = Boolean(parsedImport.isSplitCustody);
    const importIds = parsedImport.cards.map((c) => c.cardId);
    const duplicateInPayload = importIds.filter((id, i) => importIds.indexOf(id) !== i);
    if (duplicateInPayload.length > 0) {
      return NextResponse.json(
        { success: false, error: `Duplicate card IDs in CSV: ${Array.from(new Set(duplicateInPayload)).join(", ")}` },
        { status: 400 }
      );
    }

    const campaign = await repo.getCampaign(parsedImport.campaignId);
    if (!campaign) {
      return NextResponse.json({ success: false, error: "Campaign not found." }, { status: 404 });
    }
    if (campaign.lane === "ONLINE_BATCH") {
      return NextResponse.json(
        { success: false, error: "This campaign is Lane 2 only (online batch). Gift cards need a Lane 1 or Hybrid campaign." },
        { status: 400 }
      );
    }

    const existingCards = await repo.getCards(parsedImport.campaignId);
    const existingIds = new Set(existingCards.map((c) => c.cardId));
    const alreadyRegistered = importIds.filter((id) => existingIds.has(id));
    if (alreadyRegistered.length > 0) {
      // Re-importing must never reset the state of cards that are already confirmed or disputed.
      return NextResponse.json(
        { success: false, error: `Card IDs already registered for this campaign: ${alreadyRegistered.join(", ")}` },
        { status: 409 }
      );
    }

    const voucherDocs: VoucherCardRecord[] = parsedImport.cards.map((c) => ({
      campaignId: parsedImport.campaignId,
      cardId: c.cardId,
      amountZat: Math.round(c.amountZec * 100_000_000),
      feeBufferZat: c.feeBufferZat,
      ackCodeHash: c.ackHash,
      isSplitCustody,
      state: "UNCLAIMED",
      createdAt: now,
    }));

    // A card plan anchored at creation: every imported card must take an open entry of the
    // same amount, and entries still open stay reserved in the budget.
    let plannedCardsZat: number[] = [];
    if (campaign.cardPlanZat?.length) {
      const match = matchCardsToPlan(campaign.cardPlanZat, [...existingCards, ...voucherDocs]);
      if (match.unplanned.length > 0) {
        // The whole import is refused, so report what is open before it.
        const openBefore = matchCardsToPlan(campaign.cardPlanZat, existingCards).remainingZat;
        const open = groupAmounts(openBefore)
          .map((g) => `${g.count} x ${formatZec(g.amountZat, 8)} ZEC`)
          .join(", ");
        const listed = match.unplanned
          .slice(0, 5)
          .map((c) => `${c.cardId} (${formatZec(c.amountZat, 8)} ZEC)`)
          .join(", ");
        return NextResponse.json(
          {
            success: false,
            error: `${listed}${match.unplanned.length > 5 ? ` and ${match.unplanned.length - 5} more` : ""} ${match.unplanned.length === 1 ? "does" : "do"} not match the card plan anchored with this campaign. Still open in the plan: ${open || "nothing (every planned card is registered)"}.`,
            remainingPlanZat: openBefore,
          },
          { status: 409 }
        );
      }
      plannedCardsZat = match.remainingZat;
    }

    const budget = summarizeBudget({
      totalFundedZat: campaign.totalFundedZat,
      vouchers: [...existingCards, ...voucherDocs],
      slots: await repo.getSlots(parsedImport.campaignId),
      plannedCardsZat,
    });
    if (budget.isOverAllocated) {
      return NextResponse.json(
        {
          success: false,
          error: `These cards over-allocate the campaign by ${formatZec(-budget.remainingZat, 8)} ZEC (funded ${formatZec(budget.totalFundedZat, 8)} ZEC). Fund more or import fewer cards.`,
        },
        { status: 409 }
      );
    }

    await repo.insertCards(voucherDocs);
    await repo.recordEvent({
      campaignId: parsedImport.campaignId,
      eventType: "CAMPAIGN_ANCHORED",
      details: {
        kind: "VOUCHERS_IMPORTED",
        cardsImportedCount: voucherDocs.length,
        totalAmountZat: voucherDocs.reduce((sum, v) => sum + v.amountZat, 0),
        isSplitCustody,
      },
      timestamp: now,
    });

    return NextResponse.json({
      success: true,
      campaignId: parsedImport.campaignId,
      cardsImported: voucherDocs.length,
      isSplitCustody,
      message: "Gift card batch registered without storing private keys.",
    });
  } catch (err: unknown) {
    return errorResponse(err, "Invalid request");
  }
}
