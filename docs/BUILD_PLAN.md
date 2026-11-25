# ZecClaim Phased MVP Implementation Plan

**Objective:** Autonomous, test-driven roadmap from Phase 0 to Production Deployment  
**Current Milestone:** Phase 6 Completed (on-chain checks, honest Lane 1, production hardening)  

> **Status note (November 2026):** Phases 0-5 below are the original plan and are kept as history. Two planned items were dropped after review because they could not work as designed: the UFVK nullifier watcher for Lane 1 (a gift card is its own key, outside the campaign UFVK) and the demo spend simulation. Phase 6 replaced them with lightwalletd checks; see the Phase 6 section at the end and `docs/ARCHITECTURE.md` section 7 for the roadmap.  

---

## Overview of Implementation Phases

| Phase | Title | Focus Area | Deliverables & Verification |
| :---: | :--- | :--- | :--- |
| **0** | **Architecture & Scaffolding** | Spec, Folders, Docs, Contracts | Complete documentation suite, directory layout, unit test harness. |
| **1** | **Zcash Protocol & Crypto Core** | Pure TS Library (`src/lib/zcash/`) | Full ZIP 316 decoder, ZIP 321 builder, ZIP 317/2009 chunker + unit tests. |
| **2** | **Database & Campaign Anchoring** | MongoDB Models & UFVK Anchor API | Mongoose models, `/api/campaigns`, `/api/proof`, watch-only UFVK sync adapter. |
| **3** | **Lane 2: Direct Batch Payouts** | Blind Claims, Preflight, Export | `/claim/[token]`, client & server preflight, auto-chunking <=300 actions, scrub attestation. |
| **4** | **Lane 1: Offline Meetup Slips** | ZIP 324 CSV, Slips, Memo ACK | Vizor CSV parser, printable QR slip sheets, nullifier tracking, `/ack/[campaignId]`. |
| **5** | **DAO Proof Portal & Judge Sandbox** | Public Verification & Demo Mode | Full `/proof/[campaignId]`, `seed-nu7-demo.ts`, 2-min interactive judge walkthrough. |

---

## Detailed Phase Breakdown

### Phase 0: Architecture, Docs & Scaffolding (CURRENT PHASE)
- **Goal:** Lock all protocol invariants, create directory scaffolding, establish design system, and write authoritative documentation.
- **Tasks:**
  1. Scaffold full repository tree according to exact prompt specifications.
  2. Setup `package.json`, `tsconfig.json`, `tailwind.config.ts`, and `.env.example`.
  3. Author all 8 documentation files (`AGENTS.md`, `README.md`, and `docs/*.md`).
  4. Create stub files for all library modules, components, routes, and tests.
  5. Emit mandatory Phase-0 Verification Report.

### Phase 1: Core Zcash Protocol & Crypto Library
- **Goal:** Implement and unit-test the pure TypeScript protocol modules in `src/lib/zcash/`.
- **Tasks:**
  1. `zip316.ts`: Implement Bech32m decoding, F4Jumble inverse unjumbling, receiver TLV parsing, and policy enforcement (hard-reject `0x00`/`0x01`, verify `0x03`/`0x04`, warn `0x02`).
  2. `zip321.ts`: Multi-payment URI serialization (`zcash:<addr>?amount=...&address.1=...`) with RFC 4648 Base64URL 512-byte memo encoding.
  3. `zip317.ts`: ZIP 2009 fee calculator (`marginal_fee = 1000 zatoshis`, `grace_actions = 2`) and `<=` 300 action auto-chunking.
  4. `zip324.ts`: Parse Vizor group gift-card CSV exports, generate slip metadata, and compute `ack_hash`.
  5. `tests/zcash/*.test.ts`: Write automated unit tests for all crypto functions.

### Phase 2: Database Layer & Campaign Trust Anchor API
- **Goal:** MongoDB connection caching and campaign lifecycle endpoints.
- **Tasks:**
  1. `src/lib/db/mongodb.ts`: Resilient cached connection for Next.js serverless functions.
  2. `src/lib/db/models/`: Implement Mongoose schemas (`Campaign`, `ClaimSlot`, `VoucherCard`, `AuditEvent`, `ScrubAttestation`).
  3. `src/app/api/campaigns/`: Anchor campaign with UFVK, funding `txid`, expiry height.
  4. `src/lib/zcash/ufvkWatcher.ts`: Lightnode querying for note commitments and nullifier spends.

### Phase 3: Lane 2 Online Bounties & Batch Export
- **Goal:** Zero-identity claim submission, preflight validation, batch chunking, and 1-click scrub.
- **Tasks:**
  1. Blind token generation via CSPRNG (`src/lib/security/tokens.ts`).
  2. `/claim/[token]`: Interactive claim page with real-time `AddressPreflightInput`.
  3. `/api/claims/submit`: Server-side ZIP 316 validation gate.
  4. `/api/batch/lock`: Queue locking and <= 300 action chunk generation.
  5. Export artifacts: Multi-recipient ZIP 321 URIs and Mumbai-targeted `zingo-cli` script.
  6. `/api/scrub`: Address wipe and `sha256PurgedSetHash` attestation generation.

### Phase 4: Lane 1 Offline Meetups & Gift Card Slips
- **Goal:** Ingest Vizor CSV batches, render printable QR slips, and verify memo `ACK` codes.
- **Tasks:**
  1. `/api/vouchers/import`: Ingestion and validation of ZIP 324 CSVs.
  2. Slip generation UI: High-contrast printable PDF / grid slips with `CARD-01` IDs.
  3. Nullifier spend listener: Detect spent notes via campaign UFVK.
  4. `/ack/[campaignId]`: Memo `ACK-XXXX` submission and validation against on-chain spend state.
  5. Dispute tripwire handling for already-swept cards.

### Phase 5: ZecHub DAO Proof Portal & 2-Minute Judge Sandbox
- **Goal:** Public transparency portal and interactive testnet evaluation flow.
- **Tasks:**
  1. `/proof/[campaignId]`: Public audit dashboard with UFVK inflows, nullifier table, and scrub attestations.
  2. `scripts/seed-nu7-demo.ts`: Pre-seeds a complete testnet campaign with mock nullifier sweeps and preflight fixtures.
  3. Judge Walkthrough sandbox mode with step-by-step interactive simulator.

---

### Phase 6: On-Chain Checks & Honest Lane 1 (COMPLETED)
- **Goal:** Replace every simulated or self-reported claim that the chain can check.
- **Delivered:**
  1. `src/lib/zcash/lightwalletd.ts` + `src/lib/chain/txCheck.ts`: lightwalletd gRPC lookups (tx status, height, shape) with a fake-node test harness.
  2. Funding txid checked at anchoring and re-checked on the proof portal; anchor height recorded; expiry height validated.
  3. `POST /api/batch/payout`: payout txids recorded and checked (room for every recipient, no transparent outputs); "distributed" and the scrub depend on it.
  4. Lane 1 receipts by memo code with optional on-chain sweep txid; disputes on any card; clawback gated on the live chain tip and an on-chain clawback txid. Spend simulation and the fake UFVK watcher removed.
  5. UFVK fingerprint instead of the full key by default; shared MongoDB rate limits; fail-closed database in production; TTL deletion of ledger records removed.
- **Next (roadmap):** viewing-key decryption (WASM) to verify funding amounts and payout recipients; per-card nullifier derivation in the browser for automatic sweep detection.
