# AGENTS.md — ZecClaim Standing Operational Directives

> **Notice to all AI agents, engineers, and contributors:**
> These rules are non-negotiable architectural and protocol invariants. Every turn, edit, and feature implementation must strictly adhere to these instructions.

---

## 1. Prime Invariant: 100% Non-Custodial Architecture

1. **Zero Secret Handling on Server:**
   - The server, API routes, database, background workers, and logs must **NEVER** receive, process, parse, store, or log private spending keys, seed phrases, viewing keys with spending authority, or pooled user funds.
   - Any endpoint receiving a private key or mnemonic must immediately fail and trigger a security alert.

2. **Client-Side Self-Custody Boundaries:**
   - **Lane 1 (Offline Meetups / ZIP 324):** Voucher cards are pre-generated offline by the organizer or pre-minted by ZecHub DAO in a Split-Custody workflow. The server receives only public voucher metadata (`cardId`, `amountZat`, `claimUrlTokenHash`). The card's secret seed/URI is transferred directly to physical paper / PDF or desk screen, never persisted on the server.
   - **Lane 2 (Online Bounties / ZIP 321):** Recipients submit their own public shielded Unified Addresses. The server aggregates verified addresses and generates client-executable payment artifacts (**ZIP 321 URIs** and **`zingo-cli` scripts**). The organizer signs and broadcasts transactions from their own local wallet (e.g., Zingo PC or `zingo-cli`). The server never broadcasts payout transactions.

3. **Campaign Trust Anchor:**
   - All campaigns must register a read-only **Unified Full Viewing Key (`uview...` / UFVK)**, funding `txid`, expected total ZEC, and clawback expiry block height **before** any claim link or QR is distributed.
   - Viewing keys provide incoming and outgoing view capability for auditing, but cannot spend funds (ZIP 310 / ZIP 326).
   - Public responses expose only the UFVK's SHA-256 fingerprint unless the organizer opted in (`publishUfvk`): the full key's OVK decrypts every payout, recipients included.

4. **On-Chain Checks (never claim more than the chain says):**
   - Funding, payout, sweep and clawback txids are looked up through lightwalletd (`src/lib/chain/txCheck.ts`) and stored as a `ChainTxCheck` (status, height, shape). UI copy restates that result and nothing more: shielded amounts and recipients are never "verified".
   - Lane 2 recipients count as paid only with a recorded payout txid found on-chain. Clawback requires the live chain tip past the expiry height. If the node is unreachable, these writes fail (503) rather than skipping the check (demo campaign excepted, labeled simulated).
   - There is no spend simulation and no nullifier watcher: ZecClaim cannot see gift-card sweeps (each card is its own key). Never reintroduce either.

5. **Recipient Addresses Never Go Public:**
   - Recipient addresses are never shown on the proof portal or returned by any public endpoint (`/api/proof`, `GET /api/campaigns/[id]`, the claim page, which shows only a masked hint). Not in full, truncated, hashed per recipient, or decrypted from a payout.
   - Only the organizer console shows them, behind the organizer secret (`POST /api/campaigns/[id]/addresses`), and only until the scrub.
   - The clawback address is the organizer's own and stays public by design.

---

## 2. Strict ZIP 316 Address Validation Rules

ZecClaim strictly enforces post-NU7 shielded privacy standards. Both client-side preflight components and server-side API handlers must execute identical ZIP 316 validation via `src/lib/zcash/zip316.ts`:

1. **Hard-Reject Transparent Addresses:**
   - Any address starting with `t1...` (P2PKH) or `t3...` (P2SH) must be **instantly rejected**.
   - Error message must be non-technical and actionable:
     `"Transparent addresses (t1...) are not supported. Please use a modern shielded Unified Address (u1...) from a supported wallet like Zingo, Zodl, or Ywallet."`

2. **Hard-Reject Transparent Receivers in Unified Addresses:**
   - Under ZIP 316, a Unified Address (`u1...`) can pack multiple receivers (Typecodes: `0x00` P2PKH, `0x01` P2SH, `0x02` Sapling, `0x03` Orchard).
   - ZecClaim enforces a **strict shielded-only policy**. If a decoded Unified Address contains a transparent receiver (`0x00` or `0x01`), it must be **hard-rejected**.
   - Rationale: Sending to a UA with a transparent fallback risks wallet degradation and public linkability on block explorers.

3. **Sapling Handling:**
   - Legacy Sapling addresses (`zs1...`) are accepted with a prominent UI warning encouraging migration to modern Unified Addresses.
   - UA addresses containing only Sapling receivers (`0x02`) are valid but flagged as legacy.

4. **Required Receiver:**
   - Modern Unified Addresses must contain an **Orchard receiver** (`0x03`). Ironwood reuses the Orchard receiver format; the ZIP 316 registry assigns no separate Ironwood typecode (`0x04` is unassigned and must be ignored like any unknown item).

5. **ZIP 316 Consumer Rules:**
   - Reject items that are not in strictly ascending typecode order (this also rejects duplicates).
   - Reject unrecognized MUST-understand metadata items (`0xE0`-`0xFC`), e.g. address expiry.
   - Legacy Sapling (`zs1...`) addresses must be fully Bech32-decoded (43-byte payload), never accepted by prefix alone.
   - Campaign UFVKs (`uview`, `uviewtest`, `uvf`, `uvftest`) must pass the same Bech32m + F4Jumble + item checks.

---

## 3. UI & Design Rules (Tactile Neomorphism, Light + Dark)

The UI follows the tactile neomorphic reference design (floating app shell, sidebar rail, soft raised/inset surfaces, mint accent). Full spec: `docs/DESIGN_SYSTEM.md`.

1. **Themes:**
   - **Light is the default** (the reference look): `#F2F5F8` surfaces on a `#E9EEF3` canvas.
   - **Dark is opt-in** via the header theme toggle (stored per viewer, `data-theme="dark"` on `<html>`; `?theme=dark|light` also works).
   - Never hard-code colors in components. Use the CSS-variable tokens (`bg-surface`, `text-ink`, `text-muted`, `border-line`, `text-rose-fg`, ...) so both themes come from one set of class names.

2. **Surfaces & Accent:**
   - Panels use `.neo-card` / `.neo-card-sm`, wells and inputs use `.neo-inset` / `.neo-field`, the window uses `.neo-shell`.
   - Mint `#14C39A` is the single brand accent. The primary CTA is the mint-outlined `.neo-btn-mint`; destructive actions use `.neo-btn-danger`.
   - Rounded corners (8-22px) and round icon buttons are part of the system.

3. **Status Badges (semantic, both themes):**
   - `Verified Shielded`: mint tint. `Rejected Transparent` / disputes: rose tint. On-chain evidence (`chain` variant, txid found by lightwalletd): cyan tint.
   - `ACK Confirmed`: solid mint. `Clawed Back`: slate tint. `PII Purged`: violet tint. Warnings / testnet / demo: amber tint.

4. **Content Rules (unchanged):**
   - **NO fake metrics or mock testimonials.** Every number shown must come from campaign records or protocol math.
   - **NO vague marketing hero fluff.** State what the product does.
   - **NO em dashes (`—`) in UI copy.** Use colons, parentheses, or simple hyphens.
   - **Never claim verification that did not happen.** Simulated data must be labeled (Demo badges, "Simulated" audit tags).
   - **Fixture data lives only in the judge sandbox** (`/sandbox`, `NEXT_PUBLIC_ZECCLAIM_SANDBOX`). Real forms never generate keys, txids or addresses, the home page never seeds anything, and navigation never defaults to the sandbox campaign.
   - Overview sections must earn their place: explain the idea or let a judge use the working product.

---

## 4. Zod Validation & TypeScript Typing

1. **End-to-End Schema Enforcement:**
   - Every API request body, query parameter, CSV row import, and form submission must be parsed through a Zod schema defined in `src/lib/validators/`.
   - Never use raw `req.json()` without `.parse()` or `.safeParse()`.

2. **TypeScript Strict Mode:**
   - `strict: true` is enabled in `tsconfig.json`.
   - Never use `any`. Use `unknown` with type guards or exact Zod inferred types (`z.infer<typeof schema>`).
   - Pure protocol code in `src/lib/zcash/` must be decoupled from React and Next.js APIs so it runs identically in Node.js, edge workers, and client browsers.

---

## 5. Post-NU7 Zcash Protocol Constants

Code touching fee calculations, batching, block delays, or lightnode connections must use these exact parameters:

| Parameter | Value | Standard Reference |
| :--- | :--- | :--- |
| Block Spacing | **25.0 seconds** (1/3 of pre-NU7 75s) | ZIP 259 |
| Block Action Limit | **330 Actions** | ZIP 259 |
| ZecClaim Safe Batch Chunk Cap | **300 Actions** (30-action margin) | ZecClaim Spec |
| Marginal Fee per Action | **1,000 zatoshi** (0.00001000 ZEC) | ZIP 2009 |
| Grace Actions | **2 actions** | ZIP 317 |
| Minimum Sweep Fee | **2,000 zatoshi** (0.00002000 ZEC) | ZIP 317 / ZIP 2009 |
| NU7 Consensus Branch ID | **`0x77190AD9`** | ZIP 259 |
| Default Lightnode Endpoint | `zebra.openlightnodes.org:443` | Zcash India Lightnode |
| Standard Memo Byte Limit | **512 bytes** (Base64URL encoded) | ZIP 321 |

---

## 6. Commit, Verification, and Documentation Maintenance

1. **Verification Before Turn Completion:**
   - All tests must pass: `npm run test`
   - Typechecking must pass: `npm run typecheck`
   - Linting must pass: `npm run lint` (ESLint flat config, `eslint.config.mjs`)
   - `npm run build` must succeed without secrets at build time (no pepper-dependent work at module import).
   - `zecclaimUI/` is a temporary design reference: it is git-ignored and excluded from tsc, vitest and eslint.

2. **Continuous Documentation Sync:**
   - Whenever an API endpoint is added or changed, update `docs/ARCHITECTURE.md`.
   - Whenever a database model or index changes, update `docs/ARCHITECTURE.md`.
   - Whenever protocol parameters or cryptographic assumptions are refined, update `docs/PROTOCOL_SPECS.md` and `docs/SECURITY_AND_TRUST.md`.
   - Never leave dead documentation or contradictory specs across files.
