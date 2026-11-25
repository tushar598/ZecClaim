---
trigger: glob
globs: "src/app/**/*.tsx, src/components/**/*.tsx"
description: "Frontend design guardrails and UX clarity rules for ZecClaim."
---

# UI & Component Rules

1. **Visual Aesthetic:** Tactile neomorphism after the reference design: floating `.neo-shell` window, sidebar rail, raised `.neo-card` panels, inset `.neo-field` inputs, mint `#14C39A` accent, mint-outlined `.neo-btn-mint` CTA. Light theme is the default; dark theme via the header toggle.
2. **Tokens only:** Use the CSS-variable color tokens (`bg-surface`, `text-ink`, `text-muted`, `border-line`, `text-rose-fg`, ...). No raw hex in components except fixed brand art (card gradients, illustrations).
3. **Content bans:** No fake metrics or testimonials, no marketing fluff, no em dashes in UI copy, no claims of verification that did not happen. Label simulated data.
4. **Clear Protocol Feedback:** Explicit status badges (Verified Shielded, Rejected Transparent, On-chain, Confirmed, Clawed Back, Address Purged). Lane 1 slips print wallet versions (`Vizor 0.0.57+ or Zodl 3.16+ · about 50 s / 2 blocks`).
5. **Transparent Trust Boundaries:** The proof portal leads with the UFVK anchor and the funding ledger, labels data as ZecClaim records (not chain data) and states what remains trust-based.
6. **Earn the space:** Every section must explain the idea or let a judge use the working product. Remove decorative sections.
