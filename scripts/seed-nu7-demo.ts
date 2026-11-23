/**
 * Seed Script: 2-Minute NU7 Testnet Judge Sandbox
 *
 * Populates MongoDB with:
 * 1. A pre-anchored NU7 demo campaign with watch-only UFVK
 * 2. Lane 1 Vizor gift-card slips with simulated spent nullifier & memo ACK
 * 3. Lane 2 blind claim slots ready for testing preflight & <=300 action batch export
 * 4. A verified PII scrub attestation
 */

import { connectToDatabase } from "../src/lib/db/mongodb";
import {
  Campaign,
  ClaimSlot,
  VoucherCard,
  AuditEvent,
  ScrubAttestation,
} from "../src/lib/db/models";
import { computePurgeSetHash } from "../src/lib/security/scrub";

async function seedNu7Demo() {
  console.log("==================================================");
  console.log("ZecClaim: Seeding 2-Minute NU7 Judge Sandbox");
  console.log("Consensus: NU7 (Nov 2026) | Branch ID: 0x77190AD9");
  console.log("Lightnode: zebra.openlightnodes.org:443 (Mumbai)");
  console.log("==================================================");

  try {
    await connectToDatabase();
    console.log("[1/5] Connected to MongoDB.");

    const campaignId = "demo-nu7-campaign";

    // Clean previous demo state
    await Promise.all([
      Campaign.deleteMany({ campaignId }),
      ClaimSlot.deleteMany({ campaignId }),
      VoucherCard.deleteMany({ campaignId }),
      AuditEvent.deleteMany({ campaignId }),
      ScrubAttestation.deleteMany({ campaignId }),
    ]);

    // 1. Create Demo Campaign
    await Campaign.create({
      campaignId,
      title: "ZecHub DAO India NU7 Hackathon Demo",
      description: "Interactive 2-minute sandbox demonstrating dual-lane non-custodial payouts.",
      lane: "HYBRID",
      ufvk: "uview1demoanchor9876543210zyxwvutsrqponmlkjihgfedcbamumbaiopenlightnodesnu7testnetanchor",
      fundingTxid: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      totalFundedZat: 200_000_000, // 2.0 ZEC
      slotCount: 10,
      clawbackAddress: "utest1demo_clawback_address_zechub_treasury_shielded_only_anchor_nu7",
      clawbackExpiryHeight: 3_350_000,
      status: "ACTIVE",
    });
    console.log("[2/5] Campaign trust anchor registered.");

    // 2. Create Lane 1 Voucher Cards (1 spent & ACK confirmed, 4 unclaimed)
    await VoucherCard.create([
      {
        campaignId,
        cardId: "CARD-01",
        amountZat: 10_000_000,
        feeBufferZat: 2000,
        nullifierHex: "9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a",
        ackCodeHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        state: "ACK_CONFIRMED",
        spentAtHeight: 3_250_100,
        spentTxid: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
        ackSubmittedAt: new Date(),
      },
      {
        campaignId,
        cardId: "CARD-02",
        amountZat: 10_000_000,
        feeBufferZat: 2000,
        ackCodeHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        state: "UNCLAIMED",
      },
    ]);
    console.log("[3/5] Lane 1 ZIP 324 gift card vouchers seeded.");

    // 3. Create Lane 2 Claim Slots
    await ClaimSlot.create([
      {
        campaignId,
        tokenHash: "sample-token-1-hash",
        amountZat: 25_000_000,
        slotIndex: 0,
        status: "PURGED",
        recipientAddress: "[PURGED]",
        addressPoolType: "ORCHARD",
        submittedAt: new Date(),
      },
      {
        campaignId,
        tokenHash: "sample-token-2-hash",
        amountZat: 25_000_000,
        slotIndex: 1,
        status: "UNCLAIMED",
      },
    ]);
    console.log("[4/5] Lane 2 claim slots seeded.");

    // 4. Create Audit & Scrub Attestation
    await ScrubAttestation.create({
      campaignId,
      addressesPurgedCount: 1,
      sha256PurgedSetHash: computePurgeSetHash(["utest1mockpurgedaddressdemo"]),
      executedAt: new Date(),
    });
    console.log("[5/5] Public Scrub Attestation generated.");

    console.log("==================================================");
    console.log("Seeding complete! You can now start the app:");
    console.log("  npm run dev");
    console.log("Open: http://localhost:3000/proof/demo-nu7-campaign");
    console.log("==================================================");
    process.exit(0);
  } catch (error) {
    console.error("Seeding failed (is MongoDB running?):", error);
    process.exit(1);
  }
}

seedNu7Demo();
