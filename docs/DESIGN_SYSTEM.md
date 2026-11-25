# ZecClaim Design System & UI Specification

**Aesthetic Direction:** Tactile neomorphism (soft raised and inset surfaces) with a single mint accent
**Themes:** Light (default, matches the reference design) and Dark (opt-in toggle)
**Status:** Canonical reference for all UI work. Implementation: `tailwind.config.ts`, `src/app/globals.css`, `src/components/ui/*`

---

## 1. Principles

1. **One shell.** Every page lives inside a floating `.neo-shell` window: a 244px sidebar rail (logo, workspace nav, network switch) and a main panel with a top bar (section links, lightnode status, theme toggle, New Campaign CTA).
2. **Depth, not borders.** Panels are raised (`.neo-card`), inputs and wells are pressed in (`.neo-inset`, `.neo-field`). Borders are reserved for dividers (`border-line`).
3. **Mint means action or success.** The mint accent marks the primary CTA, the active nav item, the active tab indicator, and positive status. Nothing else is mint.
4. **Truthful UI.** No fake metrics, no marketing fluff, no em dashes in copy, no claim of verification that did not happen. Simulated data carries a Demo or Simulated badge.
5. **Every section earns its place.** A section either explains the idea or lets someone use the working product.

---

## 2. Themes & Color Tokens

Colors are CSS variables holding RGB channels (`--c-*` in `globals.css`), exposed to Tailwind as `rgb(var(--c-x) / <alpha-value>)`, so opacity modifiers work and both themes share class names.

| Token (Tailwind) | Light | Dark | Use |
| :--- | :--- | :--- | :--- |
| `canvas` | `#E9EEF3` | `#11151B` | Page background |
| `surface` | `#F2F5F8` | `#1A1F27` | Shell, cards, buttons |
| `inset` / `rail` | `#EDF1F6` / `#EDF1F5` | `#151920` / `#161B22` | Wells, inputs / sidebar |
| `line` | `#DCE4EE` | `#2C333E` | Dividers |
| `ink` / `ink-soft` | `#232A34` / `#4C596B` | `#E6EBF1` / `#B7C1CE` | Primary / secondary text |
| `muted` / `subtle` / `faint` | `#69778A` / `#8B97A8` / `#A5B1C2` | lighter greys | Body copy, labels, placeholders |
| `mint` | `#14C39A` | `#14C39A` | Accent (fixed) |
| `mint-hover` / `mint-deep` | `#0E9F7D` / `#0D8E6F` | `#34D3AA` / `#3DDCB4` | Accent text on surfaces |
| `rose-fg`, `amber-fg`, `cyan-fg`, `violet-fg`, `slate-fg` | dark hues | light hues | Readable status text per theme |

Neomorphic shadows read `--neo-hi` (top-left highlight) and `--neo-lo` (bottom-right shade); the dark theme swaps them for a faint highlight and a deep shade.

**Theme switching:** `ThemeToggle` writes `data-theme` on `<html>` and stores the choice in `localStorage` (`zecclaim_theme`). An inline script in `<head>` (`themeScript.ts`) applies the saved theme before first paint. `?theme=dark|light` overrides and persists it.

---

## 3. Surface Classes (`globals.css`)

| Class | Purpose |
| :--- | :--- |
| `.neo-shell` | Floating app window, dialogs |
| `.neo-card`, `.neo-card-sm` | Raised panels, stat tiles, active nav item |
| `.neo-inset`, `.neo-inset-sm` | Pressed wells: inputs, code blocks, segmented controls |
| `.neo-field` | Text input / textarea / select (inset + mint focus ring) |
| `.neo-btn` | Raised neutral button |
| `.neo-btn-mint` | Signature primary CTA: mint outline, fills mint on hover |
| `.neo-btn-danger` | Destructive CTA: rose outline, fills rose on hover |
| `.neo-icon-btn` | Round or square icon buttons and icon tiles |
| `.neo-visa-mint`, `.neo-visa-dark` | Gradient brand tiles (reference card style) |

---

## 4. Typography

- **Sans:** Plus Jakarta Sans (`font-sans`), headings `font-bold tracking-[-0.015em]` to `[-0.025em]`.
- **Mono:** JetBrains Mono (`font-mono tabular-nums`) for amounts, addresses, keys, txids, block heights.

| Level | Classes |
| :--- | :--- |
| Page title | `text-[24px] sm:text-[26px] font-bold tracking-[-0.02em] text-ink` |
| Section / card title | `text-[17px] font-bold tracking-[-0.015em] text-ink` |
| Eyebrow | `text-[12px] font-semibold tracking-[0.04em] text-mint-hover` |
| Body | `text-[13px]` to `text-[15px] text-muted leading-relaxed` |
| Label | `text-[11.5px] font-semibold text-subtle` |
| Metric | `font-mono tabular-nums text-[18px]` to `text-[20px] font-bold` |

---

## 5. Components (`src/components/ui`)

- **Button / ButtonLink** (`button.tsx`): `primary` (mint outline), `solid`, `secondary`, `outline`, `danger`, `ghost`; sizes `sm` / `md` / `lg`.
- **Card** (`card.tsx`): `tone="raised" | "inset"`, with `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`.
- **Badge** (`badge.tsx`): status chips. `shielded` (Verified Shielded, mint), `transparent` (Rejected / Disputed, rose), `sapling` / `warning` (amber), `chain` (on-chain evidence, cyan), `ack` (solid mint), `clawback` (slate), `purged` (violet), `default`.
- **Fields** (`field.tsx`): `Label`, `Hint`, `Input`, `Textarea`, `Select`, `Notice` (success / error / warning / info).
- **Tabs** (`tabs.tsx`): `UnderlineTabs` (reference dock tabs with mint indicator) and `Segmented` (small inset switch).
- **Choice** (`choice.tsx`): `RadioCards`, `ChipGroup`, `CheckRow`, `FormSection` (numbered form card).
- Class names go through `cn()` (`src/lib/cn.ts`, tailwind-merge), so a `className` override such as `flex-row` always beats the component default.
- **Misc** (`misc.tsx`): `StatTile`, `IconTile`, `CopyButton`, `KeyValueRow`, `Modal`, `PageHeading`.
- **Table** (`table.tsx`): inset container, uppercase micro headers, row dividers.

---

## 6. Page Patterns

| Page | Composition |
| :--- | :--- |
| Overview `/` | Hero (idea + CTAs + "before you start" requirements), your campaigns (browser-local), how each lane works, address checker, sandbox card, trust model |
| New campaign | Numbered form sections (campaign, funding, claim links, gift-card slips, unclaimed funds) with inline validation; amount mode switch (split evenly, fixed, custom) with a per-row amount list that accepts a pasted spreadsheet column; radio cards for the lane; preset chips + date picker for the clawback with a live block-height preview; sticky summary with budget and a readiness checklist |
| Campaign created | Organizer secret (remember toggle, backup download), claim links (per-link copy, CSV), funding and clawback facts, "I saved it" confirmation before leaving |
| Organizer console | Sign-in gate, overview tiles (pool, funding check, clawback date), share links, lane-specific tabs: claim links table with reissue, payout steps 1-3, gift cards, activity. Polls every 15 s |
| My campaigns | Browser-local list with console / proof / forget actions, open-by-ID form |
| Claim link | Focused page without the workspace sidebar: campaign + exact amount, live ZIP 316 preflight; after submitting, a three-step payout timeline that refreshes every 30 s |
| Receipt (ACK) | Receipt and dispute cards side by side; sandbox fill buttons only on the sandbox campaign |
| Proof portal | Header facts (clawback estimate from the live tip), live refresh + copy link, funding allocation bar + buckets (exact amounts), chain checks, disputes, ledger table, scrub commitment, audit trail |
| Sandbox `/sandbox` | The only page pointing at fixture data: public secret, four step cards, reset |

**Amounts:** always exact (`zecExact`: up to 8 decimals, trailing zeros trimmed). Never round a fee or payout to 4 decimals.

**Print:** QR slips force black on white and hide the shell (`print:` utilities). Sample slips carry a SAMPLE watermark and encode no key.
