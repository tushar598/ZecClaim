import { connectToDatabase } from "@/lib/db/mongodb";
import { Campaign, ClaimSlot, VoucherCard, AuditEvent, ScrubAttestation, Payout } from "@/lib/db/models";
import { memoryStore } from "@/lib/db/store";
import { buildDemoFixtures } from "@/lib/demo/fixtures";
import { DEMO_CAMPAIGN_ID } from "@/lib/demo/constants";

export { DEMO_CAMPAIGN_ID };

/**
 * Idempotently seeds the judge sandbox into MongoDB (or the in-memory store when no
 * database is configured). Both paths use the same fixtures from `@/lib/demo/fixtures`.
 * If forceReset is true, all previous demo records are removed and recreated.
 */
export async function seedDemoCampaign(forceReset = false): Promise<boolean> {
  const db = await connectToDatabase();

  if (!db) {
    if (forceReset || !(await memoryStore.getCampaign(DEMO_CAMPAIGN_ID))) {
      memoryStore.seedDemoCampaign();
    }
    return true;
  }

  try {
    const existing = await Campaign.findOne({ campaignId: DEMO_CAMPAIGN_ID });
    if (existing && !forceReset) {
      // Re-seed if the demo lost its slots (e.g. the TTL index of older deployments removed them).
      const slotCount = await ClaimSlot.countDocuments({ campaignId: DEMO_CAMPAIGN_ID });
      if (slotCount > 0) {
        return true;
      }
    }

    await Promise.all([
      Campaign.deleteMany({ campaignId: DEMO_CAMPAIGN_ID }),
      ClaimSlot.deleteMany({ campaignId: DEMO_CAMPAIGN_ID }),
      VoucherCard.deleteMany({ campaignId: DEMO_CAMPAIGN_ID }),
      AuditEvent.deleteMany({ campaignId: DEMO_CAMPAIGN_ID }),
      ScrubAttestation.deleteMany({ campaignId: DEMO_CAMPAIGN_ID }),
      Payout.deleteMany({ campaignId: DEMO_CAMPAIGN_ID }),
    ]);

    const fixtures = buildDemoFixtures();
    await Campaign.create(fixtures.campaign);
    await VoucherCard.insertMany(fixtures.vouchers);
    await ClaimSlot.insertMany(fixtures.claimSlots);
    await Payout.insertMany(fixtures.payouts);
    await ScrubAttestation.create(fixtures.scrubAttestation);
    await AuditEvent.insertMany(fixtures.auditEvents);

    return true;
  } catch (error) {
    console.error("Failed to seed demo campaign into MongoDB:", error instanceof Error ? error.message : error);
    return false;
  }
}
