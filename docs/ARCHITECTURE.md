# ZecClaim System Architecture & Technical Specification

**Version:** 1.0.0 (Phase 0 Scaffold)  
**Deployment Environment:** Vercel (Next.js App Router) + MongoDB Atlas (Free Tier)  
**Security Boundary:** 100% Non-Custodial  

---

## 1. High-Level Architecture Overview

ZecClaim is designed as a stateless, non-custodial coordination layer. Private spending keys never touch the network; the application acts exclusively as a preflight validator, batch aggregator, and cryptographic audit witness.

```mermaid
flowchart TD
    subgraph ClientLayer["Client & Organizer Environment"]
        Org["Organizer / DAO (Zingo PC / zingo-cli)"]
        Att["Attendee / Winner (Browser / Vizor / Zodl)"]
    end

    subgraph AppLayer["ZecClaim Application (Next.js App Router)"]
        UI["React 19 Server & Client Components"]
        ZIPPreflight["Client-Side ZIP 316 Preflight Engine"]
        APIRoutes["Next.js Route Handlers (/api/*)"]
        CryptoCore["Pure TS Protocol Library (src/lib/zcash/)"]
    end

    subgraph DataLayer["Storage & Cache Layer"]
        Mongo[("MongoDB Atlas (TTL Indexes + Purge Attestation)")]
    end

    subgraph ZcashNetwork["Post-NU7 Zcash Network (Nov 2026)"]
        Node["Mumbai Lightnode (zebra.openlightnodes.org:443)"]
        Chain["Zcash Blockchain (25s Blocks | NU7 Branch 0x77190AD9)"]
    end

    Org -- "1. Registers UFVK Anchor" --> APIRoutes
    Org -- "2. Imports ZIP 324 CSV / Luma" --> APIRoutes
    Att -- "3. Pastes Shielded Address" --> ZIPPreflight
    ZIPPreflight -- "4. Submits Valid UA" --> APIRoutes
    APIRoutes -- "5. Validates & Stores" --> Mongo
    APIRoutes -- "6. Reads Nullifiers" --> Node
    Node -- "Reads blocks" --> Chain
    APIRoutes -- "7. Exports <= 300 Action Batch" --> Org
    Org -- "8. Signs & Broadcasts locally" --> Chain
    Org -- "9. Executes 1-Click Scrub" --> APIRoutes
```

---

## 2. Lane Workflows (Mermaid Sequence Diagrams)

### 2.1 Lane 1: Offline Meetups & Zero-Wallet Onboarding (ZIP 324 Bearer QRs)

```mermaid
sequenceDiagram
    autonumber
    actor DAO as ZecHub DAO / Organizer
    participant Portal as ZecClaim Server
    participant DB as MongoDB Atlas
    actor User as Meetup Attendee
    participant Wallet as Vizor / Zodl Wallet
    participant Lightnode as Mumbai Lightnode

    DAO->>Portal: POST /api/campaigns (Registers UFVK, Funding TxID, Expiry)
    Portal->>DB: Save Campaign (UFVK anchor)
    DAO->>Portal: POST /api/vouchers/import (Imports ZIP 324 CSV batch)
    Portal->>DB: Save VoucherCards (Public cardId, amount, hash)
    DAO->>Portal: GET /admin/[campaignId]/slips (Generate printable PDF/desk QRs)
    DAO->>User: Hands physical slip (Displays CARD-01, QR, wallet notice)
    User->>Wallet: Scans QR code
    Wallet->>Lightnode: Broadcasts sweep transaction (~50s / 2 blocks)
    Wallet-->>User: Displays confirmed note with memo "ACK-9241"
    Portal->>Lightnode: ufvkWatcher polls note nullifier spends
    Lightnode-->>Portal: Confirms nullifier spend for CARD-01
    User->>Portal: POST /api/vouchers/ack (Submits cardId: CARD-01, memo: ACK-9241)
    Portal->>Portal: Verifies nullifier spent AND memo matches hash
    Portal->>DB: Update VoucherCard -> state: "ACK_CONFIRMED"
    Portal-->>User: Success: Proof recorded on DAO Portal
```

### 2.2 Lane 2: Online Bounties & Async Payouts (Direct Shielded Batch)

```mermaid
sequenceDiagram
    autonumber
    actor Org as Organizer
    participant Portal as ZecClaim Server
    participant DB as MongoDB Atlas
    actor Winner as Bounty Winner
    participant Wallet as Zingo PC / zingo-cli
    participant Lightnode as Mumbai Lightnode

    Org->>Portal: POST /api/claims/generate (Creates blind claim slots)
    Portal->>DB: Stores SHA-256(token + pepper) in ClaimSlots
    Org->>Winner: Sends blind claim link (/claim/tok_abc123)
    Winner->>Portal: Opens /claim/tok_abc123
    Winner->>Portal: Pastes Zcash Address
    Note over Winner,Portal: Client ZIP 316 Preflight: Reject t1..., reject mixed UAs
    Winner->>Portal: POST /api/claims/submit (address: u1...)
    Portal->>Portal: Server ZIP 316 Preflight: Re-verify Orchard/Ironwood
    Portal->>DB: Update ClaimSlot -> recipientAddress: u1..., state: "CLAIMED"
    Org->>Portal: POST /api/batch/lock (Locks payout queue)
    Portal->>Portal: Auto-chunks into <= 300 Actions batches with ZIP 2009 fees
    Portal-->>Org: Returns ZIP 321 URIs + ready-to-run zingo-cli script
    Org->>Wallet: Imports ZIP 321 or executes zingo-cli script
    Wallet->>Lightnode: Signs & broadcasts shielded transaction
    Org->>Portal: POST /api/scrub (Executes 1-Click DB Scrub)
    Portal->>Portal: Computes sha256PurgedSetHash
    Portal->>DB: Wipes addresses to "[PURGED]" + Stores ScrubAttestation
    Portal-->>Org: Emits immutable Public Scrub Attestation
```

---

## 3. Database Architecture & Mongoose Schemas

All models reside in `src/lib/db/models/` and are built for MongoDB Atlas free tier with auto-indexing.

### 3.1 `Campaign` Schema
Stores the campaign anchor, registered viewing key, and parameters.
```typescript
interface ICampaign {
  campaignId: string;             // SHA-256(ufvk + fundingTxid).slice(0, 16)
  title: string;                  // e.g., "ZecHub India Hackathon Nov 2026"
  description?: string;
  lane: "OFFLINE_ZIP324" | "ONLINE_BATCH" | "HYBRID";
  ufvk: string;                   // Unified Full Viewing Key ("uview...")
  fundingTxid: string;            // 64-character hex transaction ID
  totalFundedZat: number;         // Total funded amount in satoshis
  slotCount: number;              // Total number of claim slots or vouchers
  clawbackAddress: string;        // DAO treasury address for returning unspent funds
  clawbackExpiryHeight: number;   // Block height after which unspent funds are clawed back
  status: "ACTIVE" | "LOCKED" | "COMPLETED" | "CLAWED_BACK";
  createdAt: Date;
  updatedAt: Date;
}
```

### 3.2 `ClaimSlot` Schema (Lane 2)
Stores blind claim tokens and submitted shielded addresses prior to scrubbing.
```typescript
interface IClaimSlot {
  campaignId: string;
  tokenHash: string;              // SHA-256(token + pepper) - token itself never saved
  amountZat: number;              // Disbursement amount per slot
  slotIndex: number;              // Order index (0..N-1)
  status: "UNCLAIMED" | "SUBMITTED" | "BATCHED" | "PURGED";
  recipientAddress?: string;      // Shielded UA string (replaced with "[PURGED]" on scrub)
  addressPoolType?: "ORCHARD" | "IRONWOOD" | "SAPLING";
  submittedAt?: Date;
  batchIndex?: number;            // Which <=300 action batch this slot was assigned to
  purgeHash?: string;             // Included in scrub attestation
  createdAt: Date;
}
```

### 3.3 `VoucherCard` Schema (Lane 1)
Stores public card metadata for ZIP 324 gift cards. **No secret seeds or private keys are stored.**
```typescript
interface IVoucherCard {
  campaignId: string;
  cardId: string;                 // e.g., "CARD-01", "CARD-02"
  amountZat: number;              // Face value of card in zatoshi
  feeBufferZat: number;           // Explicit sweep fee buffer (minimum 2,000 zat)
  nullifierHex?: string;          // Extracted note nullifier for watch-only tracking
  ackCodeHash: string;            // SHA-256(ACK-XXXX) stored inside encrypted memo
  state: "UNCLAIMED" | "SPENT" | "ACK_CONFIRMED" | "DISPUTED" | "CLAWED_BACK";
  spentAtHeight?: number;         // Detected spend height from UFVK
  spentTxid?: string;
  ackSubmittedAt?: Date;
  disputeReason?: string;
  createdAt: Date;
}
```

### 3.4 `AuditEvent` Schema
Records append-only public accounting events verified via UFVK.
```typescript
interface IAuditEvent {
  campaignId: string;
  eventType: 
    | "CAMPAIGN_ANCHORED" 
    | "SLOT_CLAIMED" 
    | "NULLIFIER_SPENT" 
    | "ACK_VERIFIED" 
    | "DISPUTE_FLAGGED" 
    | "BATCH_LOCKED" 
    | "PII_SCRUBBED" 
    | "CLAWBACK_RECONCILED";
  details: Record<string, unknown>;
  blockHeight?: number;
  txid?: string;
  timestamp: Date;
}
```

### 3.5 `ScrubAttestation` Schema
Permanent proof of address destruction.
```typescript
interface IScrubAttestation {
  campaignId: string;
  addressesPurgedCount: number;
  sha256PurgedSetHash: string;    // SHA-256 hash of sorted, concatenated purged addresses
  executedAt: Date;
  receiptTxid?: string;           // Optional payout transaction ID associated with batch
}
```

---

## 4. TTL Index & Data Retention Strategy

To strictly minimize liability and data retention:
1. **Automatic Expiry:** `ClaimSlot` collection contains a compound TTL index:
   ```typescript
   ClaimSlotSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 }); // 7 days
   ```
2. **Explicit Scrub Override:** When the organizer triggers the 1-Click Scrub API, the raw `recipientAddress` field is immediately rewritten to `"[PURGED]"` and the hash is committed to `ScrubAttestation`. The TTL index acts as an automated fallback if the organizer fails to trigger the scrub manually.

---

## 5. API Endpoint Contracts

| Route | Method | Description | Request Body / Params |
| :--- | :--- | :--- | :--- |
| `/api/campaigns` | `POST` | Anchor new campaign with UFVK | `CreateCampaignSchema` |
| `/api/campaigns/[id]` | `GET` | Get campaign details & status | `campaignId` |
| `/api/claims/validate` | `POST` | Validate blind claim token | `{ token: string }` |
| `/api/claims/submit` | `POST` | Server ZIP 316 preflight & lock slot | `{ token: string, address: string }` |
| `/api/batch/lock` | `POST` | Lock queue & chunk into <=300 actions | `{ campaignId: string }` |
| `/api/batch/export` | `GET` | Download ZIP 321 URIs or zingo script | `?campaignId=xxx&format=zip321\|zingo` |
| `/api/vouchers/import` | `POST` | Ingest Vizor CSV manifest | `{ campaignId: string, cards: [...] }` |
| `/api/vouchers/ack` | `POST` | Submit memo ACK code for spent card | `{ campaignId: string, cardId: string, ackCode: string }` |
| `/api/vouchers/dispute` | `POST` | Flag already-redeemed gift card | `{ campaignId: string, cardId: string, details: string }` |
| `/api/proof/[id]` | `GET` | Public audit ledger & stats | `campaignId` |
| `/api/scrub` | `POST` | 1-Click PII wipe & attestation | `{ campaignId: string }` |

---

## 6. Client vs. Server Responsibility Matrix

| Feature / Responsibility | Client / Browser | Server / Next.js API | Local Wallet (Zingo / zingo-cli) |
| :--- | :---: | :---: | :---: |
| Private Key / Seed Management | ❌ Never | ❌ Never | ✅ Exclusively |
| ZIP 316 Preflight (Immediate Feedback) | ✅ Full Bech32m + F4Jumble | ❌ (Client First) | ❌ |
| ZIP 316 Preflight (Enforcement Gate) | ❌ | ✅ Full Bech32m + F4Jumble | ❌ |
| Token CSPRNG Generation | ❌ | ✅ Secure Salt/Hash | ❌ |
| Payout Transaction Broadcast | ❌ Never | ❌ Never | ✅ Exclusively |
| Batch Auto-Chunking (<=300 actions) | ❌ | ✅ ZIP 2009 Calculator | ❌ |
| Watch-Only UFVK Sync | ❌ | ✅ Lightnode Query | ❌ |
| 1-Click PII Purge & Attestation | ❌ | ✅ Cryptographic Hash | ❌ |
