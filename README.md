# ZecClaim

> **100% Non-Custodial Dual-Mode QR Payout & ZecHub DAO Proof Portal for Post-NU7 Zcash**
> Built for November 2026 Zcash: 25-second blocks, 330-action block cap, Ironwood shielded pool, and ZIP 2009 1,000-zatoshi marginal fees.

---

## Overview

**ZecClaim** is an open-source, non-custodial issuance, preflight, and DAO accountability portal for Zcash disbursements. It eliminates the operational friction and privacy risks of funding in-person meetup attendees, hackathon winners, and online bounty contributors.

### The Fundamental Problem: Why Escrow Fails on Zcash
1. **No Native Timelocks in Shielded Pools:** Zcash shielded pools (Sapling, Orchard, Ironwood) deliberately lack stateful smart contracts, and relative timelocks (`OP_CHECKSEQUENCEVERIFY`) remain undeployed in shielded circuits.
2. **Transparent Escrow Destroys Privacy:** Reverting to transparent multisig escrow permanently links recipient identities on public block explorers, defeating the purpose of Zcash.
3. **Interactive Multisig (FROST) Is Impractical:** FROST 2-of-3 threshold setups require multiple rounds of interactive key generation and signing between untrusted parties, which is completely unusable for casual meetup attendees or anonymous bounty hunters.

### The ZecClaim Solution: Dual-Lane Non-Custodial Architecture
Instead of holding user funds or pretending smart-contract escrow exists on shielded pools, ZecClaim acts as the **missing coordination, preflight validation, and DAO verification layer** over open Zcash standards:

```text
+----------------------------------------------------------------------------------------------------+
|                                    CAMPAIGN TRUST ANCHOR                                          |
|   Organizer registers read-only Unified Full Viewing Key (uview...), Funding TxID, and Expiry     |
+----------------------------------------------------------------------------------------------------+
                                      |
         +----------------------------+----------------------------+
         |                                                         |
         v                                                         v
+-----------------------------------+     +---------------------------------------------------------+
| LANE 1: OFFLINE MEETUPS & EVENTS  |     | LANE 2: ONLINE BOUNTIES & ASYNC PAYOUTS                 |
| (Bearer Preset QRs — ZIP 324)     |     | (Non-Bearer Blind Claim -> 1-Tx Shielded Batch)         |
+-----------------------------------+     +---------------------------------------------------------+
| * Import Vizor ZIP 324 CSV batch  |     | * Single-use blind claim tokens (SHA-256 hashed in DB)  |
| * Printable desk check-in slips   |     | * Strict ZIP 316 Preflight (Reject t1... and mixed UAs) |
| * Public Card ID (CARD-01)        |     | * Auto-chunked batching (<= 300 actions per tx)         |
| * Nullifier-gated encrypted memo  |     | * Multi-payment ZIP 321 URIs + zingo-cli script export  |
|   ACK-XXXX verification via UFVK  |     | * 1-Click PII Scrub with SHA-256 public attestation     |
| * Dispute tripwire & clawback     |     | * Zero OAuth, zero social-to-address linkage            |
+-----------------------------------+     +---------------------------------------------------------+
                                      |
                                      v
+----------------------------------------------------------------------------------------------------+
|                                ZECHUB DAO PROOF PORTAL                                            |
|   UFVK-Anchored Public Ledger * Spent Nullifier Verification * Optional ZIP 311 Output Badges     |
+----------------------------------------------------------------------------------------------------+
```

---

## Key Features

- **Strict ZIP 316 Client & Server Preflight:** Comprehensive Bech32m and F4Jumble address decoding. Instantly hard-rejects transparent addresses (`t1...`) and multi-receiver Unified Addresses (`u1...`) bundling transparent receivers, preventing pool contamination.
- **Auto-Chunked Batch Payouts (<= 300 Actions):** Built for NU7's 330-action block cap. Bundles verified claims into safe transactions with real-time ZIP 2009 marginal fee calculations, exporting ready-to-sign ZIP 321 payment request URIs and Mumbai lightnode-targeted `zingo-cli` scripts.
- **Nullifier-Gated ACK Verification:** In Lane 1, gift card redemption is verified non-custodially. The campaign UFVK detects when a note nullifier is spent; the winner submits their unique encrypted-memo `ACK-XXXX` code to confirm receipt and claim their DAO reputation.
- **1-Click DB Scrub & Cryptographic Attestation:** Permanently purges all recipient addresses from MongoDB, computing and publishing a deterministic `sha256PurgedSetHash` proof on the public portal.
- **Under-2-Minute Judge Sandbox:** Built-in interactive testnet demo loaded with pre-configured NU7 fixtures, sample gift slips, simulated nullifier sweeps, and instant faucet integration (`npx zcash-faucet`).

---

## Tech Stack & Standards

- **Core Framework:** Next.js (App Router) + React 19 + TypeScript (`strict: true`)
- **Styling:** Tailwind CSS (Sharp developer & audit tool aesthetic; no purple gradients, no pill buttons, high contrast)
- **Database:** MongoDB + Mongoose (Atlas free-tier compatible with TTL indexes)
- **Validation:** Zod schemas shared across API routes, UI forms, and CSV parsers
- **Protocol & Crypto Layer:** Pure TypeScript modules in `src/lib/zcash/`
- **Protocol Standards:**
  - **ZIP 316:** Unified Addresses & Viewing Keys (Bech32m + F4Jumble)
  - **ZIP 321:** Payment Request URIs (Indexed multi-payment + Base64URL memos)
  - **ZIP 324:** URI-Encapsulated Payments / ZEC Gift Cards
  - **ZIP 259:** NU7 Consensus Parameters (25s block time, 330 action cap, branch `0x77190AD9`)
  - **ZIP 317 & ZIP 2009:** Proportional output fees (1,000 zatoshi marginal fee)
  - **ZIP 311:** `zreceipt` Payment Disclosures (optional audit badges)

---

## Local Setup & Quickstart

### Prerequisites
- Node.js >= 20.x
- npm >= 10.x
- MongoDB (local instance or MongoDB Atlas connection string)

### 1. Clone & Install
```bash
git clone https://github.com/ZecHub/zecclaim.git
cd zecclaim
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env.local
```
Update `.env.local` with your MongoDB URI:
```env
MONGODB_URI=mongodb://localhost:27017/zecclaim
NEXT_PUBLIC_ZCASH_NETWORK=testnet
NEXT_PUBLIC_ZCASH_LIGHTNODE_HOST=zebra.openlightnodes.org
NEXT_PUBLIC_ZCASH_LIGHTNODE_PORT=443
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 2-Minute Judge Walkthrough (NU7 Demo Sandbox)

To verify all cryptographic and protocol behaviors without waiting for live testnet block confirmations:

1. **Seed Demo Fixtures:**
   ```bash
   npm run seed:nu7
   ```
2. **Access the Judge Sandbox:**
   Navigate to [http://localhost:3000](http://localhost:3000) and click **"Enter 2-Min NU7 Judge Sandbox"** (or open `/proof/demo-nu7-campaign`).
3. **Verify Lane 1 (Offline Gift Slips & ACK):**
   - View generated printable QR check-in slips (`CARD-01` through `CARD-10`).
   - Trigger the **"Simulate Winner Sweep"** action. Notice how the watch-only UFVK detects the spent nullifier.
   - Enter the winner's memo `ACK-7824` code at `/ack/demo-nu7-campaign` to confirm non-custodial receipt.
4. **Verify Lane 2 (Online Preflight & Batch Export):**
   - Open a blind claim link at `/claim/sample-token-1`.
   - Test preflight rejection: paste a transparent address (`t1...`) or mixed UA to observe instantaneous ZIP 316 blocking.
   - Paste a valid shielded Orchard/Ironwood UA: witness instant verification.
   - Go to Admin view (`/admin/demo-nu7-campaign`), lock the queue, and observe **<= 300 Action Batch Chunking** with ZIP 2009 fee breakdown.
   - Inspect the exported multi-recipient ZIP 321 URI and generated `zingo-cli` script configured for `zebra.openlightnodes.org:443`.
5. **Verify 1-Click Scrub & DAO Proof Portal:**
   - Click **"Execute 1-Click PII Scrub"**.
   - Observe permanent deletion of raw recipient addresses from MongoDB and publication of the immutable `sha256PurgedSetHash` attestation on the public portal.

---

## Documentation Index

Detailed architectural and cryptographic specifications are located in the `docs/` directory:

- [AGENTS.md](file:///Users/tusharsinghchouhan/Desktop/zecclaim/AGENTS.md) — Standing operational rules & strict invariants
- [docs/PRD.md](file:///Users/tusharsinghchouhan/Desktop/zecclaim/docs/PRD.md) — Product Requirements Document & User Stories
- [docs/ARCHITECTURE.md](file:///Users/tusharsinghchouhan/Desktop/zecclaim/docs/ARCHITECTURE.md) — System Architecture, Schemas & API Contracts
- [docs/PROTOCOL_SPECS.md](file:///Users/tusharsinghchouhan/Desktop/zecclaim/docs/PROTOCOL_SPECS.md) — Mathematical & Zcash Protocol Implementation Specs
- [docs/SECURITY_AND_TRUST.md](file:///Users/tusharsinghchouhan/Desktop/zecclaim/docs/SECURITY_AND_TRUST.md) — Threat Model & Cryptographic Trust Boundaries
- [docs/DESIGN_SYSTEM.md](file:///Users/tusharsinghchouhan/Desktop/zecclaim/docs/DESIGN_SYSTEM.md) — Visual Design System & Component Guidelines
- [docs/BUILD_PLAN.md](file:///Users/tusharsinghchouhan/Desktop/zecclaim/docs/BUILD_PLAN.md) — Phased Implementation & Milestone Roadmap

---

## License

MIT © ZecHub & ZecClaim Contributors. Free and open source for the Zcash ecosystem.
