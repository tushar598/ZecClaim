import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { inspectZcashAddress } from "@/lib/zcash/zip316";
import { generateClaimToken, hashToken } from "@/lib/security/tokens";
import { verifyCampaignAdmin } from "@/lib/security/auth";
import { getRepo } from "@/lib/db/repo";
import { ClaimSlotRecord } from "@/types";
import { summarizeBudget, formatZec, matchCardsToPlan } from "@/lib/campaign/budget";
import { estimateBatchFeeZat } from "@/lib/zcash/zip317";
import { errorResponse } from "@/lib/http";

interface RouteContext {
  params: Promise<{ campaignId: string }>;
}

const noSecretFragment = (val: string) => !/(?:#|%23)key(?:=|%3d)/i.test(val);

/**
 * Strict Luma Row Schema: Accepts ONLY shielded address, optional amountZat, and optional memo.
 * Rejects name, email, or any PII fields at the network boundary.
 */
const LumaRowSchema = z
  .object({
    address: z
      .string()
      .min(1)
      .refine(noSecretFragment, { message: "Address must not contain secret key fragment" }),
    amountZat: z.number().positive().optional(),
    memo: z.string().max(512).optional(),
  })
  .strict();

const ImportLumaSchema = z.object({
  rows: z.array(LumaRowSchema).min(1).max(2000),
  defaultAmountZat: z.number().positive().optional(),
});

/**
 * POST /api/campaigns/[campaignId]/import-luma
 * Protected by x-admin-secret.
 * Ingests a pre-event Luma attendee/winner CSV:
 * 1. Runs strict ZIP 316 preflight on every submitted address.
 * 2. Filters & hard-rejects transparent addresses (t1...) and mixed UAs (0x00/0x01).
 * 3. Queues valid shielded addresses as SUBMITTED claim slots ready for batch export.
 */
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { campaignId } = await context.params;

    if (!campaignId) {
      return NextResponse.json({ success: false, error: "Campaign ID is required" }, { status: 400 });
    }

    // 1. Verify admin authorization
    const auth = await verifyCampaignAdmin(req, campaignId);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });
    }

    const body = await req.json();
    const parsed = ImportLumaSchema.parse(body);

    const repo = await getRepo();
    const now = new Date();

    const campaign = await repo.getCampaign(campaignId);
    if (!campaign) {
      return NextResponse.json({ success: false, error: "Campaign not found" }, { status: 404 });
    }
    if (campaign.lane === "OFFLINE_ZIP324") {
      return NextResponse.json(
        { success: false, error: "This campaign is Lane 1 only (gift cards). Recipient imports need a Lane 2 or Hybrid campaign." },
        { status: 400 }
      );
    }

    const existingSlots = await repo.getSlots(campaignId);
    const existingVouchers = await repo.getCards(campaignId);

    // Default amount = funding left after existing allocations and the fee for the enlarged
    // batch, split across the imported rows. (Previously it re-split the WHOLE funding,
    // double-allocating on top of existing claim links and cards.)
    // Clawed-back value went to the DAO treasury, so it still counts as consumed budget.
    const activeVouchers = existingVouchers;
    // Planned gift cards that are not registered yet keep their reservation.
    const plannedCardsZat = campaign.cardPlanZat?.length
      ? matchCardsToPlan(campaign.cardPlanZat, existingVouchers).remainingZat
      : [];
    const before = summarizeBudget({
      totalFundedZat: campaign.totalFundedZat,
      vouchers: activeVouchers,
      slots: existingSlots,
      plannedCardsZat,
    });
    const feeReserveAfterImport = estimateBatchFeeZat(existingSlots.length + parsed.rows.length);
    const freeZat =
      campaign.totalFundedZat -
      before.voucherAllocatedZat -
      before.slotAllocatedZat -
      before.plannedCardReserveZat -
      feeReserveAfterImport;
    const defaultAmountZat =
      parsed.defaultAmountZat ?? Math.max(0, Math.floor(freeZat / parsed.rows.length));

    interface RejectedRow {
      rowIndex: number;
      name?: string;
      address: string;
      reason: string;
    }

    const validSlots: ClaimSlotRecord[] = [];
    const rejectedRows: RejectedRow[] = [];

    // Process and validate every row with strict ZIP 316 preflight
    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i];
      const inspection = inspectZcashAddress(row.address, campaign.network);

      if (!inspection.isValid || !inspection.isShielded || inspection.hasTransparentReceiver) {
        rejectedRows.push({
          rowIndex: i + 1,
          address: row.address,
          reason:
            inspection.errorMessage ||
            "Transparent or mixed address rejected. Shielded Unified Address required.",
        });
        continue;
      }

      const rawToken = generateClaimToken();
      const tokenHash = hashToken(rawToken);

      validSlots.push({
        campaignId,
        tokenHash,
        amountZat: row.amountZat || defaultAmountZat,
        // Continue after existing slots so indexes stay unique per campaign.
        slotIndex: existingSlots.length + i,
        status: "SUBMITTED",
        recipientAddress: row.address,
        addressPoolType: inspection.poolType === "TRANSPARENT_REJECTED" || inspection.poolType === "INVALID" ? undefined : inspection.poolType,
        submittedAt: now,
        createdAt: now,
      });
    }

    if (validSlots.some((slot) => slot.amountZat <= 0)) {
      return NextResponse.json(
        {
          success: false,
          error: "No unallocated funding is left for these recipients. Fund the campaign further or set an explicit amount per row.",
        },
        { status: 409 }
      );
    }

    const after = summarizeBudget({
      totalFundedZat: campaign.totalFundedZat,
      vouchers: activeVouchers,
      slots: [...existingSlots, ...validSlots],
      plannedCardsZat,
    });
    if (after.isOverAllocated) {
      return NextResponse.json(
        {
          success: false,
          error: `This import over-allocates the campaign by ${formatZec(-after.remainingZat, 8)} ZEC (funded ${formatZec(after.totalFundedZat, 8)} ZEC, including ${formatZec(after.batchFeeReserveZat, 8)} ZEC batch fees${after.plannedCardReserveZat > 0 ? ` and ${formatZec(after.plannedCardReserveZat, 8)} ZEC reserved for planned gift cards` : ""}).`,
        },
        { status: 409 }
      );
    }

    await repo.insertSlots(validSlots);
    await repo.recordEvent({
      campaignId,
      eventType: "SLOT_CLAIMED",
      details: {
        importedVia: "LUMA_CSV",
        totalProcessed: parsed.rows.length,
        validShieldedCount: validSlots.length,
        rejectedCount: rejectedRows.length,
      },
      timestamp: now,
    });

    const rejectedTransparentCount = rejectedRows.filter(
      (r) => r.reason.toLowerCase().includes("transparent") || r.address.startsWith("t")
    ).length;
    const rejectedInvalidCount = rejectedRows.length - rejectedTransparentCount;

    return NextResponse.json({
      success: true,
      campaignId,
      totalProcessed: parsed.rows.length,
      validShieldedCount: validSlots.length,
      rejectedTransparentCount,
      rejectedInvalidCount,
      queuedSlotsCount: validSlots.length,
      rejected: rejectedRows,
    });
  } catch (err: unknown) {
    return errorResponse(err, "Invalid request");
  }
}
