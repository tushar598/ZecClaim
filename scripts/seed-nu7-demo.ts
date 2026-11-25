/**
 * Seed Script: 2-Minute NU7 Testnet Judge Sandbox
 *
 * Populates MongoDB Atlas or local DB with pristine NU7 fixtures:
 * 1. Pre-anchored NU7 demo campaign with watch-only UFVK
 * 2. Lane 1 Vizor gift-card slips with simulated spent nullifiers & 8-char memo ACK codes
 * 3. Lane 2 blind claim slots ready for testing preflight & <=300 action batch export
 * 4. Immutable public scrub attestation
 */

import { seedDemoCampaign } from "../src/lib/db/seedDemo";

async function run() {
  console.log("==================================================");
  console.log("ZecClaim: Seeding 2-Minute NU7 Judge Sandbox");
  console.log("Consensus: NU7 (Nov 2026) | Branch ID: 0x77190AD9");
  console.log("Lightnode: zebra.openlightnodes.org:443 (Mumbai)");
  console.log("==================================================");

  try {
    const success = await seedDemoCampaign(true);
    if (!success) {
      console.error("Failed to seed demo sandbox into database.");
      process.exit(1);
    }
    console.log("Seeding complete! You can now start the application:");
    console.log("  npm run dev");
    console.log("Open: http://localhost:3000/proof/demo-nu7-campaign");
    console.log("==================================================");
    process.exit(0);
  } catch (error) {
    console.error("Seeding error:", error);
    process.exit(1);
  }
}

run();
