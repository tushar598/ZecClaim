# ZecClaim Product Requirements Document (PRD)

**Status:** Locked Specification (Phase 0)  
**Target Deployment:** Post-NU7 Zcash (November 2026 Consensus)  
**Network Parameters:** 25-second blocks, 330-action block cap, Ironwood shielded pool, ZIP 2009 1,000-zat marginal fee  
**Repository:** `https://github.com/ZecHub/zecclaim`

---

## 1. Executive Summary & Problem Space

Organizing physical Zcash meetups, university onboarding workshops, and online developer bounties currently presents a severe UX and accounting dilemma for ZecHub and global Zcash community organizers:

1. **No Shielded Smart Contracts or Relative Timelocks:** Zcash intentionally avoids stateful execution. Shielded pools (Sapling, Orchard, Ironwood) do not support `OP_CHECKSEQUENCEVERIFY` or programmatic escrow scripts.
2. **Transparent Fallback Destroys Privacy:** Using transparent multisig escrow permanently deanonymizes attendees on public block explorers.
3. **Interactive Multisig (FROST) Is Impractical:** FROST 2-of-3 threshold setups require multiple rounds of interactive key generation and signing between untrusted parties, which is completely unusable for casual meetup attendees or anonymous bounty hunters.
4. **Transparent Address Leakage & Contamination:** Newbies routinely paste transparent `t1...` addresses or multi-receiver Unified Addresses that expose them to public transaction tracking.
5. **PII and Database Risk:** Storing attendee names alongside public Zcash addresses creates permanent honey-pots for surveillance.

**ZecClaim** solves this by operating strictly as the **non-custodial preflight, issuance coordination, and DAO audit layer** over open Zcash standards (ZIP 316, ZIP 321, ZIP 324, and Campaign UFVK auditing).

---

## 2. Personas & Core User Stories

### Persona A: Community Organizer / DAO Treasury Manager (e.g., ZecHub)
- *Story A1:* As an organizer hosting an in-person meetup, I want to import a batch of 10 to 50 pre-generated ZIP 324 gift cards (or have the DAO pre-mint them) and print check-in slips with public card IDs, so attendees can sweep funds in seconds without me ever storing or logging their secret keys on the server.
- *Story A2:* As an organizer distributing online hackathon bounties, I want to generate blind, single-use claim links (or import a cleaned Luma registration CSV) where winners submit their addresses without connecting social accounts, so no social-handle-to-address graph is ever stored.
- *Story A3:* As a DAO treasurer, I want all payout claims auto-chunked into safe, single-transaction batches (<= 300 actions) formatted for 1-click execution in Zingo PC or `zingo-cli`, complete with accurate ZIP 2009 fee calculations.
- *Story A4:* As an organizer completing a payout cycle, I want to hit "Execute 1-Click Scrub" to wipe all recipient addresses from the database while generating an immutable SHA-256 cryptographic attestation proof on the DAO portal.

### Persona B: Event Attendee / Bounty Winner (Recipient)
- *Story B1 (Offline):* As a first-time Zcash user at a meetup, I want to scan a printed QR slip using Vizor (>= 0.0.57) or Zodl (>= 3.16), receive instant shielded ZEC with ~50s (2 blocks) confirmation, and see my secret `ACK-XXXX` memo code to verify redemption on the community portal.
- *Story B2 (Online):* As an anonymous bounty recipient opening a claim link, I want instant client-side feedback if I accidentally paste a transparent `t1...` address or mixed Unified Address, so my privacy is never compromised.
- *Story B3:* As a recipient, I want guarantees that the platform does not log my IP, require OAuth logins, or link my identity to my shielded address.

### Persona C: DAO Auditor / Public Community Member
- *Story C1:* As a ZecHub DAO member auditing event expenditures, I want to visit the public Proof Portal and view an immutable ledger anchored by the campaign's watch-only Unified Full Viewing Key (`uview...`), displaying exact inflows, spent nullifiers, verified `ACK` receipts, and refunded clawbacks.
- *Story C2:* As a donor, I want to verify that unused funds after the 7-day clawback period were returned to the DAO treasury address rather than retained by the local host.

---

## 3. Detailed Workflow Specifications

### 3.1 Campaign Trust Anchor (Shared Requirement)
Before distributing any gift card slip (Lane 1) or claim link (Lane 2), the organizer must anchor the campaign:
1. Generate an isolated Ironwood account in their local wallet (e.g., Zingo PC).
2. Register the read-only **Unified Full Viewing Key (`uview...`)**, funding `txid`, expected slot count, total ZEC, and clawback expiry block height.
3. The server computes and stores `campaignId = SHA-256(ufvk + fundingTxid).slice(0, 16)` and sets up watch-only sync.

---

### 3.2 Lane 1: Offline Meetups & Zero-Wallet Onboarding (Bearer Preset QRs — ZIP 324)

```text
[ Organizer / DAO ]                  [ ZecClaim Portal ]                   [ Event Attendee ]
         |                                    |                                    |
         | 1. Imports ZIP 324 CSV batch       |                                    |
         |    (amount + sweep buffer)         |                                    |
         |----------------------------------->|                                    |
         |                                    |                                    |
         | 2. Generates Printable Slip PDF    |                                    |
         |    (Displays CARD-ID, wallet guide)|                                    |
         |<-----------------------------------|                                    |
         |                                    |                                    |
         | 3. Hands physical slip to attendee |                                    |
         |------------------------------------------------------------------------>|
         |                                    |                                    |
         |                                    | 4. Sweeps QR via Vizor/Zodl        |
         |                                    |    (Wallet detects note in ~50s)   |
         |                                    |                                    |
         |                                    | 5. Attendee reads note memo:       |
         |                                    |    "ACK-7824"                      |
         |                                    |                                    |
         | 6. Watches note nullifier spent    | 6. Submits "ACK-7824"              |
         |    via Campaign UFVK               |----------------------------------->|
         |----------------------------------->|                                    |
         |                                    | 7. Verifies Nullifier + ACK match: |
         |                                    |    State -> "ACK Confirmed"        |
```

- **Batch Size:** Up to 50 cards per transaction (software wallets) or 30 cards (hardware devices).
- **Sweep Buffer:** Each card is pre-funded with card amount + ZIP 2009 sweep buffer (minimum 2,000 zatoshi).
- **Public Slip Contents:** Public Card ID (`CARD-01`), QR code, wallet compatibility badge (`Vizor >= 0.0.57 | Zodl >= 3.16 | ~50s (2 blocks)`). Zero seed phrases or secret keys are stored on the server.
- **Nullifier-Gated ACK Verification:**
  - The secret `ACK-XXXX` code is **never** printed on the slip and never part of the URL.
  - It exists **only inside the encrypted note memo** on-chain.
  - The attendee reads the memo in their wallet after sweeping and enters it into `/ack/[campaignId]`.
  - The portal accepts the submission **only if** the campaign UFVK has recorded the spend of that card's nullifier.
- **Dispute Tripwire:** If an attendee scans a slip and their wallet reports "Already Swept", the attendee can flag the card ID on the portal. The UFVK timestamp proves whether the card was swept before or during the event.
- **Clawback Reconciliation:** After the expiry height (e.g., 7 days post-event), the organizer sweeps any unspent nullifiers back to the DAO treasury address and records the clawback tx on the portal.

---

### 3.3 Lane 2: Online Bounties & Async Payouts (Direct Shielded Batch)

```text
[ Organizer ]                        [ Contributor / Winner ]             [ ZecClaim Portal ]
      |                                         |                                  |
      | 1. Generates single-use claim tokens    |                                  |
      |    (stores only SHA-256 hash in DB)     |                                  |
      |--------------------------------------------------------------------------->|
      |                                         |                                  |
      | 2. Distributes blind link               |                                  |
      |---------------------------------------->|                                  |
      |                                         | 3. Opens /claim/[token]          |
      |                                         |--------------------------------->|
      |                                         |                                  |
      |                                         | 4. Pastes Address:               |
      |                                         |    Client ZIP 316 Preflight:     |
      |                                         |    - Hard-rejects t1...          |
      |                                         |    - Hard-rejects mixed UAs      |
      |                                         |    - Verifies Orchard/Ironwood   |
      |                                         |                                  |
      |                                         | 5. Submits Valid Shielded UA     |
      |                                         |--------------------------------->|
      |                                         |    (Server re-validates ZIP 316) |
      |                                         |    (Locks claim slot)            |
      |                                         |                                  |
      | 6. Locks Queue & Generates Batch        |                                  |
      |--------------------------------------------------------------------------->|
      |                                         |                                  |
      | 7. Exports Chunked Batch (<= 300 actions)|                                 |
      |    - Multi-recipient ZIP 321 URIs       |                                  |
      |    - Ready-to-run zingo-cli script      |                                  |
      |<---------------------------------------------------------------------------|
      |                                         |                                  |
      | 8. Signs & broadcasts locally in Zingo  |                                  |
      |                                         |                                  |
      | 9. Hits "Execute 1-Click Scrub"         |                                  |
      |--------------------------------------------------------------------------->|
      |                                         |    Permanently wipes addresses   |
      |                                         |    Emits SHA-256 Attestation     |
```

- **Zero-Identity Tokens:** Claim links use cryptographic CSPRNG tokens (`claim_tok_<64-hex>`). The server computes and stores only `SHA-256(token + pepper)`. When a user visits `/claim/[token]`, the token is verified in-flight.
- **Strict ZIP 316 Preflight:**
  - `t1...` and `t3...` transparent addresses are blocked with non-technical guidance.
  - Multi-receiver Unified Addresses containing transparent receivers (`0x00` P2PKH or `0x01` P2SH) are blocked.
  - Sapling addresses (`zs1...`) trigger a visible migration recommendation banner.
  - Modern Orchard/Ironwood Unified Addresses (`u1...`) are accepted with a "Verified Shielded" green indicator.
- **Auto-Chunked Batch Export (<= 300 Actions):**
  - When the queue is locked, the engine batches recipient payouts such that each transaction has `totalActions <= 300` (safe 30-action buffer below NU7's 330 block limit).
  - Fees are calculated under ZIP 2009: `fee = max(2, actions) * 1000 zatoshis`.
  - Outputs two execution formats:
    1. **ZIP 321 Multi-Payment URI:** Tested for scanning/pasting into Zingo PC.
    2. **`zingo-cli` Batch Script:** Pre-configured with target node `zebra.openlightnodes.org:443` and consensus branch `0x77190AD9`.

---

### 3.4 Proof Portal & 1-Click PII Scrub

- **Public Proof Portal (`/proof/[campaignId]`):**
  - Read-only UFVK-anchored financial ledger.
  - Displays: Total Funded ZEC, Confirmed Nullifier Spends, Pending Claims, Verified Memo ACK Receipts, Disputed Cards, and Clawed-Back Funds.
  - Optional ZIP 311 `zreceipt` badge support for recipients wishing to attach cryptographic output disclosures.
- **1-Click DB Scrub:**
  - Upon campaign payout completion, the organizer executes the DB Scrub.
  - The server:
    1. Computes `sha256PurgedSetHash = SHA-256(sort(allSubmittedAddresses).join(","))`.
    2. Sets `recipientAddress = "[PURGED]"` for all claim slots.
    3. Records a permanent `ScrubAttestation` document with `timestamp`, `addressesPurgedCount`, and `sha256PurgedSetHash`.
  - Automatic MongoDB TTL indexes (default 7 days) ensure database records self-delete even if the organizer forgets to scrub manually.

---

## 4. Explicit Non-Goals (Out of Scope)

1. **Not a Custodial Wallet:** ZecClaim never holds keys or submits transactions on-chain.
2. **No Smart Contract Emulation:** We do not claim or attempt to build on-chain smart contract escrow in shielded pools.
3. **No Social-to-Address Graphing:** We deliberately refuse GitHub, X, or Discord OAuth login integrations.
4. **No Transparent Payout Fallback:** We will not support sending to transparent addresses, even as a fallback option.
5. **No General-Purpose Block Explorer:** ZecClaim only monitors registered campaign UFVK accounts, not the general Zcash blockchain.
