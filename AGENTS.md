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
   - Modern Unified Addresses must contain an **Orchard receiver** (`0x03`) or **Ironwood receiver** (post-NU7 shielded pool).

---

## 3. Strict UI & Design Rules (Zero Cliché Policy)

To preserve the utility-focused, high-contrast developer and DAO audit aesthetic:

1. **Prohibited Visual Patterns:**
   - **NO purple gradients** (`bg-gradient-to-r from-purple-500...`).
   - **NO pill-shaped buttons** (`rounded-full`). All interactive elements must have sharp, crisp corners (`rounded-none` or `rounded-sm`).
   - **NO fake metrics or mock testimonials** (e.g., "$10M disbursed", "Trusted by 50,000 users", fake 5-star quotes).
   - **NO vague marketing hero fluff** (e.g., "The future of web3 payments unlocked").
   - **NO em dashes (`—`) in UI copy**. Use clean colons, parentheses, or simple hyphens.

2. **Permitted Color & Surface Palette:**
   - Dark mode slate/black surfaces: `#020617` (slate-950), `#0f172a` (slate-900), `#1e293b` (slate-800).
   - High-contrast crisp border lines: `border-slate-800`, `border-slate-700`.
   - Restrained Zcash amber accent: `#f59e0b` (amber-500) and `#d97706` (amber-600) strictly for active states, CTA borders, and primary status indicators.
   - Crisp status badges:
     - `Verified Shielded`: Emerald-500/10 with Emerald-500 text and sharp border.
     - `Rejected Transparent`: Rose-500/10 with Rose-500 text and sharp border.
     - `Spent Nullifier`: Cyan-500/10 with Cyan-500 text and sharp border.
     - `ACK Confirmed`: Amber-500/10 with Amber-500 text and sharp border.
     - `Clawed Back`: Slate-500/10 with Slate-400 text and sharp border.

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
   - Linting must pass: `npm run lint`

2. **Continuous Documentation Sync:**
   - Whenever an API endpoint is added or changed, update `docs/ARCHITECTURE.md`.
   - Whenever a database model or index changes, update `docs/ARCHITECTURE.md`.
   - Whenever protocol parameters or cryptographic assumptions are refined, update `docs/PROTOCOL_SPECS.md` and `docs/SECURITY_AND_TRUST.md`.
   - Never leave dead documentation or contradictory specs across files.
