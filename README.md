# ZecClaim

> **Non-custodial shielded payouts for Zcash meetups and bounties, checked on-chain and published on a public proof portal.**
> Built for post-NU7 Zcash (November 2026): 25-second blocks, a 330-action block budget, the Ironwood pool and ZIP 2009 1,000-zatoshi marginal fees.

---

## The Problem

Paying 30 meetup attendees or 50 bounty winners in shielded ZEC is still awkward:

1. **Shielded pools have no escrow.** There are no timelocks or contracts to hold a prize pool, and transparent multisig escrow publicly links every recipient.
2. **People paste the wrong address.** One transparent address (or a Unified Address with a transparent receiver) leaks a payout onto the public chain.
3. **The community has to trust the organizer's spreadsheet.** "We paid everyone" is rarely checkable without exposing who got what.

## What ZecClaim Does

ZecClaim never holds keys or funds. It is the coordination and audit layer around the organizer's own wallet:

```text
+--------------------------------------------------------------------------------------------+
|  ANCHOR: read-only viewing key (fingerprint published) + funding txid looked up on-chain   |
+--------------------------------------------------------------------------------------------+
            |                                                        |
            v                                                        v
+-------------------------------------+      +--------------------------------------------+
| LANE 1: MEETUPS (ZIP 324 gift cards)|      | LANE 2: ONLINE BOUNTIES (claim links)      |
+-------------------------------------+      +--------------------------------------------+
| * Vizor / Zodl CSV parsed in the    |      | * Single-use links (peppered hashes)       |
|   browser; #key= never leaves it    |      | * ZIP 316 preflight: no transparent        |
| * Printable slips + desk mode       |      |   receivers, network lock                  |
| * Receipt = memo code, optional     |      | * <= 300-action batches, ZIP 321 URIs and  |
|   sweep txid checked on-chain       |      |   zingo-cli script for your own wallet     |
| * Public "card was empty" disputes  |      | * Payout txid recorded and checked:        |
| * Clawback only after the expiry    |      |   mined, room for every recipient,         |
|   height, clawback txid on-chain    |      |   no transparent outputs                   |
+-------------------------------------+      | * Address scrub once paid (SHA-256 commit) |
            |                                +--------------------------------------------+
            v                                                        v
+--------------------------------------------------------------------------------------------+
|  PROOF PORTAL: where every zatoshi sits * what the chain confirms * disputes * audit trail |
+--------------------------------------------------------------------------------------------+
```

---

## Key Features

- **Strict ZIP 316 preflight, browser and server:** Bech32m + F4Jumble decoding with the ZIP 316 consumer rules (ascending typecodes, no duplicates, MUST-understand metadata). Transparent addresses and UAs with a transparent receiver are refused; legacy Sapling is fully decoded and accepted with a warning.
- **On-chain checks without keys:** funding, payout, gift-card sweep and clawback txids are looked up through public lightwalletd nodes (`testnet.zec.rocks`, the Zcash India node `zebra.openlightnodes.org`). ZecClaim records whether each is mined, at what height, and its shape: transparent inputs and outputs, Sapling outputs, Orchard and Ironwood actions.
- **Paid means paid:** recipients count as distributed only once a payout txid is recorded and found on-chain, mined after the campaign was anchored and not claimed by another campaign. A payout with fewer shielded outputs than recipients, or with any transparent output, is flagged publicly. Winners can report a payout that never arrived; it then counts as awaiting. The address scrub waits for the payout.
- **Tiered prizes:** each claim link can pay the even split, a fixed amount, or its own custom amount, and gift-card amounts can be planned per card before minting (imports must match the plan; the proof portal shows its progress).
- **Fee-safe batches:** claim-link amounts reserve the ZIP 2009 fee, imports cannot over-allocate the funding, and each "Lock and export" run produces ZIP 321 URIs plus a `zingo-cli` script (correct `--chain` flags, confirmation waits between transactions).
- **Viewing key kept private by default:** the portal shows the UFVK's SHA-256 fingerprint. Publishing the full key (whose outgoing viewing key decrypts every payout) is an explicit opt-in.
- **Honest proof portal:** six funding buckets that always sum to the declared total, a "What the chain confirms" section, disputes, a ledger without addresses, the scrub commitment with a "still stored" count, and an audit trail. Demo data is labeled.
- **Real funding only:** a campaign is anchored only to a funding transaction found on-chain with shielded outputs, and each funding transaction anchors one campaign.
- **Clawback by date:** organizers pick a date (presets or a calendar); the server turns it into a block height from the live tip, and every page shows the estimated date next to the enforced height.
- **Recoverable, revocable links:** unused claim links can be reissued from the console (the old ones stop working). Recipients can reopen their link to follow their payout up to the on-chain transaction.
- **Production hardening:** organizer sign-in verified server-side, rate limits shared through MongoDB, fail-closed database (no silent memory fallback), CSP and `no-referrer` headers so claim tokens never leak, `noindex` on private pages, no public campaign listing.
- **Light and dark themes:** tactile neomorphic UI, light by default, toggle in the header (or `?theme=dark`).

## What Is Verified, and What Is Not

| Claim | How |
| :--- | :--- |
| Addresses are shielded | ZIP 316 decoding, browser and server |
| Funding / payout / sweep / clawback txids exist, height, confirmations | lightwalletd `GetTransaction` + `GetLatestBlock` |
| A payout is fully shielded and big enough for its recipients | lightwalletd `GetBlock` compact transaction shape |
| Clawback happened after the expiry height | live chain tip |
| A payout was mined after the campaign was anchored, and no other campaign claims it | anchor height + cross-campaign txid check |
| **Which wallet sent a payout** | **Not verified.** Shielded senders are hidden; an auditor with the viewing key can see whether it came from the campaign account. Winners can publicly report a payout that never arrived. |
| **Amounts and recipients inside shielded transactions** | **Not verified.** They are encrypted; checking them needs viewing-key decryption (planned, see `docs/ARCHITECTURE.md` section 7). |
| **That a gift card was swept by its attendee** | **Not verified.** Each card is its own key; receipts rest on the memo code plus an optional sweep txid. |

The full threat model is in [`docs/SECURITY_AND_TRUST.md`](docs/SECURITY_AND_TRUST.md).

---

## Tech Stack & Standards

- **Framework:** Next.js 15 (App Router) + React 19 + TypeScript (`strict: true`)
- **Styling:** Tailwind CSS with CSS-variable tokens (tactile neomorphism, mint accent, light and dark)
- **Database:** MongoDB + Mongoose (in-memory store for local runs and tests)
- **Validation:** Zod schemas shared by API routes, forms and CSV parsers
- **Chain access:** minimal lightwalletd gRPC client (`@grpc/grpc-js`, hand-written protobuf codec)
- **Standards:** ZIP 316 (Unified Addresses / UFVKs), ZIP 321 (payment URIs), ZIP 324 (gift cards), ZIP 259 (NU7: 25 s blocks, branch `0x77190AD9`), ZIP 317 + ZIP 2009 (fees), lightwalletd `CompactTxStreamer`

---

## Local Setup

### Prerequisites
- Node.js >= 20, npm >= 10
- Optional: MongoDB (local or Atlas). Without `MONGODB_URI` the app uses an in-memory store.
- Outbound access to port 443 for the lightwalletd lookups.

### 1. Install
```bash
git clone <this-repository-url> zecclaim
cd zecclaim
npm install
```

### 2. Configure (optional for a local demo)
```bash
cp .env.example .env.local
```
| Variable | Purpose |
| :--- | :--- |
| `MONGODB_URI` | MongoDB connection string (Atlas works). Unset = in-memory store (single process, local only). |
| `ADMIN_SECRET_PEPPER` | High-entropy secret for hashing claim tokens and organizer secrets (`openssl rand -hex 32`). **Required in production.** Changing it invalidates existing links and secrets. |
| `NEXT_PUBLIC_ZECCLAIM_SANDBOX` | `off` removes the judge sandbox (seeded fixture campaign). On by default. |
| `ZCASH_LIGHTWALLETD_TESTNET` / `ZCASH_LIGHTWALLETD_MAINNET` | Override the lightwalletd endpoints (`host:443`). |
| `ZECCLAIM_CHAIN_CHECKS` | `off` disables on-chain lookups (checks are then shown as "Not checked"). |
| `ZECCLAIM_ALLOW_MEMORY_FALLBACK` | `true` falls back to memory if MongoDB is down (default: fail closed with 503, in every environment). |

### 3. Run
```bash
npm run dev        # http://localhost:3000
npm run test       # vitest (no network: chain tests use an in-process fake lightwalletd)
npm run typecheck && npm run lint && npm run build
```

---

## 2-Minute Judge Walkthrough

### Without a wallet: the judge sandbox
`/sandbox` (linked from the home page) is one seeded testnet campaign with labeled fixture data. Its organizer secret is public and unlocks only that campaign: `sec_demo_nu7_mumbai_organizer_secret_key`.

1. **Claim with a shielded address:** open the sandbox claim link. Try the transparent or mixed example from "Will my address be accepted?" and watch it get refused, then submit a shielded one. Reopen the link: it shows the payout progress.
2. **Confirm a meetup card:** on the receipt page, "Fill CARD-03 receipt" (memo code `ACK-4T8B2N7Y`). Optionally paste any recent testnet txid as the sweep txid: it is looked up live. Then "Fill CARD-05 dispute" and flag it.
3. **Export, pay and scrub:** open the organizer console (the sandbox secret is prefilled), "Payout" tab: lock and export, copy the ZIP 321 URI or download the `zingo-cli` script, record a testnet payout txid (checked live: height, shape, problems flagged), then scrub.
4. **Audit:** the proof portal shows the funding buckets, what the chain confirms, the dispute, the ledger, the scrub hash and the event trail. Fixtures are labeled "Demo fixture", never "On-chain".

"Reset sandbox" restores the fixtures.

### Real testnet run (recommended for the demo video)
1. In Zingo (or `zingo-cli --chain testnet`), fund a testnet account used only for this campaign and run `export_ufvk`.
2. Send the prize pool to it in one shielded transaction and copy the txid.
3. `/admin/new`: paste the viewing key (the network is read from it), the txid (looked up as you type), the amount and the number of winners (or one amount per winner with "Custom per link"), and pick when the clawback opens. Create the campaign, download the backup, and send each winner a link.
4. Winners open their link and submit a `utest1...` address; the console's link table updates live.
5. "Payout" tab: lock and export, run the downloaded script, record the txid zingo-cli prints. The proof portal and each winner's link now show the payout mined, with its shielded actions and "no transparent inputs or outputs". Then scrub.

---

## Route Directory

| Route | Visibility | Description |
| :--- | :---: | :--- |
| `/` | Public | What ZecClaim does, what you need, your campaigns, how each lane works, address checker, trust model. |
| `/admin/new` | Public | Create a campaign: viewing key (network detected), funding txid checked live, amounts per claim link and per planned gift card (split evenly, fixed or custom), clawback date (converted to a block height), budget summary and checklist. Shows the organizer secret and claim links once, with backup and CSV downloads. |
| `/admin/[campaignId]` | Organizer secret | Sign-in, then: claim links (live status, reissue, CSV import), payout (export, record txid, scrub), gift cards (import, slips, clawback), activity. Tabs follow the campaign lane. |
| `/campaigns` | This browser | Campaigns created or opened here; open another by ID or link. |
| `/sandbox` | Public | Judge sandbox: the seeded fixture campaign and its four steps. |
| `/claim/[token]` | Link holder | Single-use claim with live ZIP 316 preflight; afterwards, live payout progress. |
| `/ack/[campaignId]` | Public | Lane 1 receipt (memo code + optional sweep txid) and disputes. |
| `/proof/[campaignId]` | Public | Proof portal. |

API contracts: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#5-api-endpoint-contracts).

---

## Documentation

- [AGENTS.md](AGENTS.md): standing rules and invariants
- [docs/PRD.md](docs/PRD.md): product requirements and user stories
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): architecture, data model, API contracts, on-chain checks
- [docs/PROTOCOL_SPECS.md](docs/PROTOCOL_SPECS.md): ZIP 316 / 321 / 324 / 2009 details and the lightwalletd calls
- [docs/SECURITY_AND_TRUST.md](docs/SECURITY_AND_TRUST.md): threat model, what is enforced, confirmed and trusted
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md): visual design system
- [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md): build history and roadmap

---

## License

[MIT](LICENSE). Free and open source for the Zcash ecosystem.
