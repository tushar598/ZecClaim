---
trigger: glob
globs: "src/lib/zcash/**/*.ts, tests/zcash/**/*.ts"
description: "Zcash post-NU7 protocol, ZIP 316/321/317/324/2009, and pure-TS isolation rules."
---

# Zcash Protocol Layer Rules

1. **Pure TypeScript Isolation:** Modules in `src/lib/zcash/` must have ZERO React, Next.js, or Mongoose imports so they run identically in browser preflight, Node API routes, and unit tests.
2. **ZIP 316 Strict Policy:** Decode Bech32m + F4Jumble fully. Hard-reject transparent `t1...` AND any `u1...` Unified Address containing P2PKH (`0x00`) or P2SH (`0x01`) receivers. Warn on Sapling-only (`zs1...`). Prefer shielded Orchard/Ironwood receivers.
3. **NU7 & ZIP 2009 Limits:** Marginal fee = `1,000` zatoshis/action, grace actions = `2`, minimum sweep = `2,000` zatoshis (include configurable transition buffer for older wallets). Auto-chunk Lane 2 batches to `<= 300` Ironwood actions per tx (buffer under 330 cap).
4. **ZIP 321 & Lane 1 Integrity:** Base64URL-encode memos and enforce the 512-byte UTF-8 limit. In ZIP 324 Vizor CSV parsing, never persist ephemeral spending keys to MongoDB or logs; keep `ACK-XXXX` strictly in note memos.
5. **Mandatory Tests:** Every helper in `src/lib/zcash/` requires unit tests in `tests/zcash/` covering valid, malformed, transparent-bundled UA, and >300-action chunking edge cases.