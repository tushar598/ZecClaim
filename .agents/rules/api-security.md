---
trigger: glob
globs: "src/app/api/**/*.ts, src/lib/db/**/*.ts, src/lib/security/**/*.ts, src/lib/validators/**/*.ts"
description: "Non-custodial API, Zod validation, token hashing, and PII scrub rules."
---

# API, Database & Security Rules

1. **Zod Everywhere:** Validate every request body, query param, and CSV import with shared Zod schemas in `src/lib/validators/` before touching Mongoose.
2. **Server-Side Preflight Mandatory:** Re-run `src/lib/zcash/zip316.ts` on the server for every submitted address; never trust client validation.
3. **Blind Token Hygiene:** Store only `SHA-256(token)` in MongoDB. Use atomic `findOneAndUpdate` on `{ tokenHash, status: "UNCLAIMED" }` to block race conditions.
4. **Evidence-Based Lane 1 Receipts:** Accept `ACK-XXXX` only if SHA-256(code) matches the card's `ackCodeHash`. An optional sweep txid must be found on-chain, mined at or after the campaign's `anchorHeight`, and unique per card. Never simulate spends.
5. **1-Click Scrub Attestation:** Scrub routes must permanently unset/delete raw recipient addresses, backstop with MongoDB TTL indexes, and persist `{ timestamp, addressesPurgedCount, sha256PurgedSetHash }` without storing any raw addresses.
6. **Zero Secret Logging:** Never log claim tokens, recipient `u1...` addresses, or Vizor URI `#key=` fragments in console or error responses.