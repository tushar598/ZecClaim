import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { CreateCampaignSchema } from "@/lib/validators";
import {
  computeCampaignId,
  generateClaimToken,
  hashToken,
  generateAdminSecret,
  hashAdminSecret,
} from "@/lib/security/tokens";
import { getRepo } from "@/lib/db/repo";
import { checkTransaction, getChainTip } from "@/lib/chain/txCheck";
import { checkRateLimit, clientIp, tooManyRequests } from "@/lib/security/rateLimit";
import { CampaignRecord, ClaimSlotRecord } from "@/types";
import { cardPlanReserveZat, defaultSlotAmountZat, laneTwoBudgetZat, summarizeBudget, formatZec } from "@/lib/campaign/budget";
import { toPublicCampaign } from "@/lib/security/publicViews";
import { shieldedOutputCapacity } from "@/lib/chain/describe";
import { clawbackTimeProblem, heightForTime } from "@/lib/chain/blockTime";

/**
 * POST /api/campaigns
 * Anchors a new campaign with a read-only Unified Full Viewing Key (UFVK) and its funding txid.
 *
 * - The funding txid must exist on the campaign's network (lightwalletd): not found = 422, node
 *   unreachable = 503 (the request is refused rather than anchoring an unchecked campaign). A
 *   mined funding transaction with no shielded outputs cannot fund a shielded campaign (422).
 *   The chain cannot reveal the shielded amount, so the declared total stays declared.
 * - One funding transaction anchors one campaign per network (409 otherwise).
 * - `clawbackAt` (a date) is converted to a block height from the live tip and the tip block's
 *   timestamp at 25 s per block. A raw `clawbackExpiryHeight` is still accepted for scripts.
 * - The chain tip at anchoring is stored as `anchorHeight`; sweep evidence mined before it is
 *   refused later.
 * - Claim-link amounts: split evenly after fees (default), `slotAmountZat` on every link, or
 *   `slotAmountsZat` (one per link). `cardPlanZat` anchors the gift-card amounts to be minted
 *   (Lane 1 / Hybrid); it is reserved in the budget and imports must match it.
 * - Claim tokens and the organizer secret are returned once; only peppered hashes are stored.
 */
export async function POST(req: NextRequest) {
  try {
    const rl = await checkRateLimit(`campaign-create:${clientIp(req)}`, 10, 60 * 60_000);
    if (!rl.allowed) return tooManyRequests("Too many campaigns created from this address. Try again later.", rl);

    const parsed = CreateCampaignSchema.parse(await req.json());
    const campaignId = computeCampaignId(parsed.ufvk, parsed.fundingTxid);
    const repo = await getRepo();
    const now = new Date();

    if (await repo.getCampaign(campaignId)) {
      return NextResponse.json(
        { success: false, error: "A campaign with this viewing key and funding transaction is already registered.", campaignId },
        { status: 409 }
      );
    }
    if (await repo.findCampaignByFundingTxid(parsed.network, parsed.fundingTxid)) {
      return NextResponse.json(
        { success: false, error: "This funding transaction already anchors another campaign. Each campaign needs its own funding transaction." },
        { status: 409 }
      );
    }

    // Budget first (no network calls for requests that fail validation).
    const claimSlots: ClaimSlotRecord[] = [];
    const generatedTokens: { slotIndex: number; token: string; amountZat: number }[] = [];
    const cardPlanZat = parsed.lane === "ONLINE_BATCH" ? [] : parsed.cardPlanZat ?? [];
    const cardPlanReserved = cardPlanReserveZat(cardPlanZat);
    let slotAmounts: number[] = [];
    if (parsed.lane === "ONLINE_BATCH" || parsed.lane === "HYBRID") {
      if (parsed.slotAmountsZat) {
        slotAmounts = parsed.slotAmountsZat;
      } else {
        // Reserve the ZIP 2009 batch fee before splitting, otherwise the payout tx exceeds the funding.
        const perSlotAmount =
          parsed.slotAmountZat ??
          defaultSlotAmountZat(laneTwoBudgetZat(parsed.lane, parsed.totalFundedZat, cardPlanReserved), parsed.slotCount);
        if (perSlotAmount <= 0) {
          return NextResponse.json(
            {
              success: false,
              error: `Funding is too small to cover the claim links plus ZIP 2009 batch fees${cardPlanZat.length ? " after the gift-card plan" : ""}.`,
            },
            { status: 400 }
          );
        }
        slotAmounts = Array.from({ length: parsed.slotCount }, () => perSlotAmount);
      }
    }
    const uniformSlotAmount = slotAmounts.length > 0 && slotAmounts.every((a) => a === slotAmounts[0]) ? slotAmounts[0] : null;
    const budget = summarizeBudget({
      totalFundedZat: parsed.totalFundedZat,
      vouchers: [],
      slots: slotAmounts.map((amountZat) => ({ amountZat, status: "UNCLAIMED" })),
      plannedCardsZat: cardPlanZat,
    });
    if (budget.isOverAllocated) {
      const parts = [
        ...(slotAmounts.length
          ? [
              uniformSlotAmount !== null
                ? `${slotAmounts.length} links x ${formatZec(uniformSlotAmount, 8)} ZEC`
                : `${slotAmounts.length} links totalling ${formatZec(budget.slotAllocatedZat, 8)} ZEC`,
              `${formatZec(budget.batchFeeReserveZat, 8)} ZEC fees`,
            ]
          : []),
        ...(cardPlanZat.length
          ? [`${cardPlanZat.length} planned gift cards (${formatZec(budget.plannedCardReserveZat, 8)} ZEC with sweep buffers)`]
          : []),
      ];
      return NextResponse.json(
        { success: false, error: `${parts.join(" plus ")} exceeds the ${formatZec(parsed.totalFundedZat, 8)} ZEC funding.` },
        { status: 400 }
      );
    }

    const [fundingCheck, tip] = await Promise.all([
      checkTransaction(parsed.network, parsed.fundingTxid),
      getChainTip(parsed.network),
    ]);

    if (fundingCheck.status === "NOT_FOUND") {
      return NextResponse.json(
        {
          success: false,
          error: `Funding transaction not found on ${parsed.network}. Paste the txid of the transaction that sent the prize pool to the campaign wallet (check the network too).`,
          fundingCheck,
        },
        { status: 422 }
      );
    }
    if (fundingCheck.status === "UNREACHABLE") {
      return NextResponse.json(
        { success: false, error: `Cannot check the funding transaction right now (${fundingCheck.note}). Try again in a minute.`, fundingCheck },
        { status: 503 }
      );
    }
    if (fundingCheck.status === "MINED" && fundingCheck.shape && shieldedOutputCapacity(fundingCheck.shape) === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "The funding transaction has no shielded outputs, so it cannot have funded a shielded campaign wallet. Fund the campaign from a shielded (Orchard) account.",
          fundingCheck,
        },
        { status: 422 }
      );
    }

    const anchorHeight = tip.height ?? fundingCheck.tipHeight ?? null;
    let clawbackExpiryHeight: number;
    let clawbackAt: Date | undefined;
    if (parsed.clawbackAt) {
      if (anchorHeight === null) {
        const disabled = !tip.endpoint;
        return NextResponse.json(
          {
            success: false,
            error: disabled
              ? "Chain checks are disabled on this server, so a date cannot be converted to a block height. Send clawbackExpiryHeight instead."
              : `Cannot read the ${parsed.network} chain height right now (${tip.note}). Try again in a minute.`,
          },
          { status: disabled ? 400 : 503 }
        );
      }
      const reference = { height: anchorHeight, timeMs: tip.timeMs ?? Date.now() };
      const targetMs = Date.parse(parsed.clawbackAt);
      const problem = clawbackTimeProblem(reference, targetMs);
      if (problem) return NextResponse.json({ success: false, error: problem }, { status: 400 });
      clawbackExpiryHeight = heightForTime(reference, targetMs);
      clawbackAt = new Date(targetMs);
    } else {
      clawbackExpiryHeight = parsed.clawbackExpiryHeight as number;
      if (anchorHeight !== null && clawbackExpiryHeight <= anchorHeight) {
        return NextResponse.json(
          {
            success: false,
            error: `Clawback height ${clawbackExpiryHeight} has already passed (${parsed.network} is at ${anchorHeight}). Pick a future date instead.`,
            tipHeight: anchorHeight,
          },
          { status: 400 }
        );
      }
    }

    const adminSecret = generateAdminSecret();
    const campaign: CampaignRecord = {
      campaignId,
      title: parsed.title,
      description: parsed.description,
      network: parsed.network,
      lane: parsed.lane,
      ufvk: parsed.ufvk,
      fundingTxid: parsed.fundingTxid,
      fundingCheck,
      anchorHeight,
      totalFundedZat: parsed.totalFundedZat,
      slotCount: slotAmounts.length,
      ...(cardPlanZat.length ? { cardPlanZat } : {}),
      clawbackAddress: parsed.clawbackAddress,
      clawbackExpiryHeight,
      ...(clawbackAt ? { clawbackAt } : {}),
      adminSecretHash: hashAdminSecret(adminSecret),
      publishUfvk: Boolean(parsed.publishUfvk),
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };

    slotAmounts.forEach((amountZat, i) => {
      const rawToken = generateClaimToken();
      generatedTokens.push({ slotIndex: i, token: rawToken, amountZat });
      claimSlots.push({
        campaignId,
        tokenHash: hashToken(rawToken),
        amountZat,
        slotIndex: i,
        status: "UNCLAIMED",
        createdAt: now,
      });
    });

    await repo.insertCampaign(campaign);
    await repo.insertSlots(claimSlots);
    await repo.recordEvent({
      campaignId,
      eventType: "CAMPAIGN_ANCHORED",
      details: {
        title: parsed.title,
        lane: parsed.lane,
        totalFundedZat: parsed.totalFundedZat,
        slotCount: campaign.slotCount,
        slotTotalZat: budget.slotAllocatedZat,
        slotAmountsVary: slotAmounts.length > 0 && uniformSlotAmount === null,
        ...(cardPlanZat.length ? { cardPlanCount: cardPlanZat.length, cardPlanTotalZat: cardPlanZat.reduce((s, a) => s + a, 0) } : {}),
        clawbackExpiryHeight,
        clawbackAt: clawbackAt?.toISOString() ?? null,
        clawbackAddress: parsed.clawbackAddress,
        anchorHeight,
      },
      txid: parsed.fundingTxid,
      timestamp: now,
    });
    await repo.recordEvent({
      campaignId,
      eventType: "FUNDING_CHECKED",
      details: { status: fundingCheck.status, note: fundingCheck.note, endpoint: fundingCheck.endpoint },
      txid: parsed.fundingTxid,
      blockHeight: fundingCheck.height ?? undefined,
      timestamp: now,
    });

    return NextResponse.json(
      {
        success: true,
        campaignId,
        adminSecret,
        message: "Campaign anchored.",
        title: campaign.title,
        network: campaign.network,
        lane: campaign.lane,
        fundingCheck,
        anchorHeight,
        anchor: {
          fundingTxid: parsed.fundingTxid,
          totalFundedZat: parsed.totalFundedZat,
          slotCount: campaign.slotCount,
          cardPlanZat: campaign.cardPlanZat ?? null,
          clawbackExpiryHeight,
          clawbackAt: clawbackAt?.toISOString() ?? null,
          clawbackAddress: parsed.clawbackAddress,
          publishUfvk: campaign.publishUfvk,
        },
        // Amount shared by every link, or null when the organizer set amounts per link.
        slotAmountZat: slotAmounts.length ? uniformSlotAmount : 0,
        tokens: generatedTokens.map((t) => ({ slotIndex: t.slotIndex, token: t.token, claimPath: `/claim/${t.token}`, amountZat: t.amountZat })),
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: unknown) {
    return errorResponse(err, "Invalid request");
  }
}

/**
 * GET /api/campaigns?campaignId=...
 * Public projection of one campaign. There is no public listing: organizers share their
 * campaign's proof portal link themselves.
 */
export async function GET(req: NextRequest) {
  try {
    const campaignId = req.nextUrl.searchParams.get("campaignId");
    if (!campaignId) {
      return NextResponse.json({ success: false, error: "campaignId is required." }, { status: 400 });
    }
    const campaign = await (await getRepo()).getCampaign(campaignId);
    if (!campaign) {
      return NextResponse.json({ success: false, error: "Campaign not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, campaign: toPublicCampaign(campaign) });
  } catch (err: unknown) {
    return errorResponse(err, "Server error", 500);
  }
}
