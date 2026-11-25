# ZecClaim Security & Threat Model

**Scope:** what ZecClaim enforces, what the chain confirms, and what still rests on trust.
**Custody:** non-custodial coordination software. No spending key, seed or signed transaction reaches the server.

---

## 1. What Is Enforced, Confirmed, or Trusted

```text
+---------------------------------------------------------------------------------------------------+
|                         ENFORCED BY ZECCLAIM (code paths with tests)                              |
+---------------------------------------------------------------------------------------------------+
| 1. ZIP 316 decoding (Bech32m + F4Jumble, item rules) in the browser and on the server; any        |
|    transparent receiver is refused. Campaign UFVKs get the same checks; seeds/spending keys too.  |
| 2. Gift-card #key= links never leave the browser; any payload carrying one is refused.            |
| 3. Claim tokens and admin secrets are stored only as peppered SHA-256 hashes. Unused links can be |
|    reissued (old hash replaced atomically); used links are never touched.                         |
| 3b. A campaign is anchored only to a funding txid found on-chain with shielded outputs, and one   |
|    funding txid anchors one campaign per network.                                                 |
| 4. Budgets reserve ZIP 2009 fees; imports cannot over-allocate the declared funding. A gift-card  |
|    plan anchored at creation reserves its amounts, and imported cards must match it.             |
| 5. Recipients count as paid only with a recorded payout txid; the scrub waits for it.             |
| 6. Clawback opens only once the chain tip passes the expiry height. Organizers pick a date; the   |
|    server converts it to a height from the live tip block's timestamp (25 s blocks).             |
| 7. The full UFVK is published only if the organizer opts in (fingerprint otherwise).              |
+---------------------------------------------------------------------------------------------------+

+---------------------------------------------------------------------------------------------------+
|                         CONFIRMED ON-CHAIN (lightwalletd, no keys)                                 |
+---------------------------------------------------------------------------------------------------+
| 1. Funding, payout, sweep and clawback txids exist on the campaign's network, and their height.   |
| 2. Their shape: transparent inputs/outputs, Sapling outputs, Orchard and Ironwood actions.        |
|    A payout with fewer shielded outputs than recipients, or any transparent output, is flagged.   |
| 3. A sweep txid was mined after the campaign was anchored.                                        |
+---------------------------------------------------------------------------------------------------+

+---------------------------------------------------------------------------------------------------+
|                         STILL TRUST-BASED                                                          |
+---------------------------------------------------------------------------------------------------+
| 1. Shielded amounts and recipients are invisible on-chain: declared funding and payout amounts    |
|    are the organizer's statement (verifying them needs viewing-key decryption, see ARCHITECTURE 7).|
| 2. ZecClaim cannot see a gift card being swept (each card is its own key). A receipt rests on the |
|    memo code, plus an optional sweep txid that proves a sweep happened, not who made it.          |
| 3. The organizer writes the memo codes, so a receipt shows liveness, not honesty.                 |
| 4. The scrub hash commits to the purged set; it cannot prove that backups no longer hold it.      |
| 5. The organizer holds the funding key and could sweep cards before the event (see Threat 1).     |
| 6. A payout's sender is hidden: ZecClaim cannot tell whether a recorded payout came from the      |
|    campaign account or another wallet, nor whom it paid (Threat 8). The viewing key shows it.     |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Threat Analysis & Mitigations

### Threat 1: Organizer self-sweep (Lane 1)
- **Description:** The host prints gift cards, then sweeps them before attendees can.
- **Mitigation:**
  1. **Public dispute tripwire:** anyone who finds a card empty files a dispute with its public `CARD-ID`; it stays on the proof portal even if the card is later confirmed.
  2. **Sweep evidence:** recipients can attach their sweep txid; ZecClaim checks it is on-chain and mined after the campaign was anchored. Cards confirmed without one show "memo code only".
  3. **Split custody (process):** a second party (e.g. a DAO) mints the cards and keeps the memo codes, so the host never sees them. ZecClaim records which cards were minted that way; it cannot enforce it.

### Threat 2: Photographed bearer slip (Lane 1)
- **Mitigation:** desk mode reveals one slip at a time; public card IDs are separate from the QR secret; attendees are told to sweep immediately (~50 s, 2 blocks). A thief who sweeps and confirms first can still be disputed by the real attendee; the card then shows "confirmed, then disputed".

### Threat 3: Database compromise (Lane 2)
- **Mitigation:** no OAuth or social identity is stored; claim tokens are peppered hashes; addresses are removed by the scrub once the payout is recorded; the proof portal shows how many addresses are still stored.

### Threat 4: Transparent address contamination (Lane 2)
- **Mitigation:** client and server ZIP 316 preflight refuse `t1`/`t3`/`tm` addresses and any UA with a `0x00`/`0x01` receiver. Recorded payout txids with transparent outputs are flagged publicly.

### Threat 5: Block overflow (Lane 2)
- **Mitigation:** batches are chunked at 298 recipients + 1 input + 1 change = 300 actions, under the 330-action NU7 block budget.

### Threat 6: `#key=` leak during CSV import (Lane 1)
- **Mitigation:** the CSV is parsed in the browser; only `{ cardId, amountZec, feeBufferZat, claimToken (link without the fragment), ackHash }` is sent, and the schemas refuse any value containing `#key=` / `%23key=`.

### Threat 7: Viewing-key over-exposure
- **Description:** a published UFVK's outgoing viewing key decrypts every payout, including recipient addresses, undoing the scrub.
- **Mitigation:** public pages show only the SHA-256 fingerprint and item types unless the organizer opts in (`publishUfvk`). Auditors receive the key directly and compare fingerprints. The proof portal's viewing-key guide (`ViewingKeyAuditCard`) shows how: hash the key locally (`shasum -a 256`), then open it in a view-only zingo-cli wallet (`--viewkey`, `--birthday` just before the funding height) on the auditor's own computer and compare its transfers with the recorded payouts. The portal deliberately has no key input: a viewing key reveals every payout, so it is never pasted into a website.

### Threat 8: Faked payout or clawback records
- **Description:** shielded transactions hide sender, recipients and amounts, so a recorded payout txid proves only that a transaction exists. An organizer could pay winners from another wallet (the campaign account keeps its funds, and its viewing key no longer shows the payouts), or record an unrelated shielded transaction as a "payout" so winners show as paid without being paid.
- **Mitigation:** payout and clawback txids must be found on the campaign's network; unknown txids are refused, and spend simulation no longer exists. A payout txid must be mined at or after the campaign's anchor height (older transactions cannot pay links issued later), must not be any campaign's funding transaction, and can be recorded by only one campaign (and only once). If the node is unreachable, recording fails (503) instead of skipping the check. The link holder, the only party who sees the payout, can publish a report (`NOT_RECEIVED` / `WRONG_AMOUNT`, fixed values so no address is published); the amount then counts as awaiting, not distributed, and the report stays public.
- **Residual trust:** a real payout sent from a wallet other than the campaign account passes every check. An auditor holding the viewing key detects it (the recorded payouts are missing from the campaign account and its funds have not moved). Checking it automatically needs viewing-key decryption (ARCHITECTURE section 7). A recipient could also file a false report; the auditor's viewing-key check settles it.

### Threat 9: Anchoring a campaign to a made-up or foreign funding transaction
- **Description:** an organizer anchors a campaign to a random txid, or reuses another campaign's funding transaction, so the portal looks funded.
- **Mitigation:** the funding txid must be found on the campaign's network (not found = 422, node unreachable = 503) and, once mined, must have at least one shielded output. A funding txid already used by another campaign on that network is refused (409). Residual trust: without viewing-key decryption ZecClaim cannot prove the transaction paid the campaign's UFVK or its amount (section 5).

### Threat 10: Claim-link and secret exposure in the browser
- **Description:** claim tokens live in the URL path; organizer secrets live in the browser.
- **Mitigation:** `Referrer-Policy: no-referrer` on every page (tokens never leak to other sites), `X-Robots-Tag: noindex` and `Cache-Control: no-store` on `/claim`, `/admin` and `/api`, a same-origin Content Security Policy with `frame-ancestors 'none'`, and `robots.txt` disallowing those paths. The organizer secret is kept in `sessionStorage` (this tab) unless the organizer opts in to "remember on this device"; the console verifies it with the server (`POST /api/campaigns/[id]/verify`) before showing any control, and signs out on any 401/403. Wrong secrets are rate limited per IP (20 per 10 minutes). Lost or leaked unused links can be reissued, which revokes the old ones.

### Threat 11: Infrastructure abuse
- **Mitigation:** rate limits are stored in MongoDB (`ratelimitbuckets`, atomic fixed windows) and therefore shared by all serverless instances; campaign creation is limited to 10 per hour per IP; chain lookups and demo resets are limited per IP. Client IP comes from the platform's `x-real-ip`, then `x-forwarded-for`.
- A configured but unreachable MongoDB returns 503 (fail closed) in every environment, instead of silently writing to a per-process memory store (which split state between MongoDB and memory and made fresh claim links look invalid). `ZECCLAIM_ALLOW_MEMORY_FALLBACK=true` overrides this explicitly. Without `MONGODB_URI` the in-memory store is one instance per process (kept on `globalThis`), for local runs only.
- There is no public campaign listing (`GET /api/campaigns` requires `campaignId`); organizers share their proof portal link.

---

## 3. Regulatory Boundary

ZecClaim never holds, transmits or controls funds or spending keys, and never broadcasts transactions: it exports ZIP 321 URIs and zingo-cli scripts that the organizer signs locally. This is the basis for treating it as non-custodial software; it is not legal advice.

---

## 4. Hardening Log (November 2026 Review)

| Issue | Fix |
| :--- | :--- |
| Public endpoints returned `ackCodeHash` (brute-forceable) and `adminSecretHash`. | All public responses go through `publicViews.ts` / `getCampaignProofData`. |
| Any on-chain shielded transaction could be recorded as a payout, including one mined before the campaign or already recorded by another campaign; winners had no way to say they were not paid. | Payouts must be mined at or after the anchor height and belong to one campaign only; link holders can publish a "not received" / "wrong amount" report, which moves the amount out of "distributed". |
| A spend-simulation endpoint let organizers fabricate SPENT/ACK history; Lane 1 depended on a nullifier watcher that was never called and could not work with the campaign UFVK. | Simulation and the fake watcher were removed. Cards are confirmed by memo code with optional on-chain sweep evidence; states record only what people reported and the chain confirmed. |
| The funding txid was never checked. | Looked up on-chain at anchoring, stored, shown and re-checked on the proof portal. |
| Exported batches counted as "distributed" and the scrub ran after export. | Distributed requires a recorded payout txid found on-chain with room for every recipient; the scrub waits for it. |
| Clawback ignored the expiry height and accepted any txid. | Requires the chain tip past expiry and a clawback txid found on-chain. |
| The full UFVK was published, letting anyone see payout recipients. | Fingerprint only unless the organizer opts in. |
| Rate limits were per instance; a database outage silently fell back to memory. | Shared MongoDB rate limits; production fails closed (503). |
| A 7-day TTL deleted claim slots, including unpaid ones and ledger history. | TTL removed; the scrub plus the public "still stored" count handle retention. |
| Disputes were limited to SPENT cards and blocked real recipients. | Disputes on any unclaimed or confirmed card, one per card; confirmation still possible after a dispute. |
| Addresses, Sapling and UFVKs were accepted by prefix; `0x04` was treated as Ironwood. | Full ZIP 316 consumer validation. |
| Campaigns could be anchored to a random, not-found funding txid (the form even generated one). | Funding must be found on-chain with shielded outputs; one funding txid per campaign; the "demo values" generator was removed. |
| In-memory store was per route module in development, so fresh claim links were "invalid"; dev silently fell back to memory when Atlas was slow (2.5 s timeout). | One store per process on `globalThis`; 10 s MongoDB timeouts; no silent fallback. Stale TTL indexes on `claimslots` are dropped at startup. |
| Lost claim links were unrecoverable; the console had no sign-in and printed the demo secret in errors. | Link reissue for unused slots; console sign-in verified server-side; uniform auth errors with per-IP failure limits. |
| No security headers; claim tokens could leak through `Referer`. | CSP, `no-referrer`, `nosniff`, `DENY` framing, HSTS, `noindex` on private routes. |

## 5. Remaining Limitations

1. ZecClaim itself does not verify amounts and recipients of shielded transactions (needs viewing-key decryption; design in `ARCHITECTURE.md` section 7). Auditors holding the key can check them in their own wallet (Threat 7).
2. Gift-card sweeps are not detected automatically (needs per-card key derivation in the browser).
3. Memo codes are written by whoever mints the cards; receipts are evidence of liveness only.
4. Chain checks trust the configured lightwalletd node (they verify its chain name, not its honesty). Point `ZCASH_LIGHTWALLETD_TESTNET` / `ZCASH_LIGHTWALLETD_MAINNET` at a node you run for stronger guarantees.
5. The scrub cannot reach database backups or logs outside ZecClaim.
