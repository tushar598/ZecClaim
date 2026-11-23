# ZecClaim Design System & UI Specification

**Aesthetic Direction:** High-Contrast Developer & DAO Audit Tool  
**Visual Style:** Sharp-cornered, dense data hierarchy, restrained Zcash amber accents, terminal-grade precision  
**Status:** Canonical Reference for all UI/UX implementations  

---

## 1. Strict Anti-Cliché Rules & Prohibitions

To ensure ZecClaim looks and feels like a serious, professional cryptographic financial tool rather than generic web3 marketing fluff, the following patterns are **permanently banned**:

1. **NO Purple Gradients:** Banned across all cards, backgrounds, headers, and buttons.
2. **NO Pill-Shaped Buttons:** Banned `rounded-full` buttons. All buttons, cards, dialogs, inputs, and badges must use sharp corners (`rounded-none` or `rounded-sm`).
3. **NO Fake Metrics or Mock Testimonials:** Zero fictional counters like "$10,000,000 Payouts Processed" or "Trusted by 100+ DAOs". Only live on-chain data is permitted.
4. **NO Vague Marketing Hero Copy:** Prohibited phrases like "Unlocking the Future of Privacy". Use descriptive, functional headers like "Non-Custodial Batch Payout & Proof Portal".
5. **NO Em Dashes in UI Copy:** Never use `—`. Use colons, parentheses, or simple hyphens (`-`).

---

## 2. Color Palette & Semantic Tokens

### 2.1 Surfaces & Backgrounds
- **Primary App Canvas:** `bg-slate-950` (`#020617`)
- **Card & Container Surface:** `bg-slate-900` (`#0f172a`)
- **Elevated Sub-Panel:** `bg-slate-800/80` (`#1e293b`)
- **Borders & Dividers:** `border-slate-800` (subtle) / `border-slate-700` (focused)

### 2.2 Accent Palette (Restrained Zcash Amber)
- **Amber Primary:** `bg-amber-500` (`#f59e0b`) / `text-amber-500`
- **Amber Hover:** `hover:bg-amber-400` (`#fbbf24`)
- **Amber Focus Ring:** `ring-amber-500/30`
- **Amber Tinted Surface:** `bg-amber-500/10` with `border-amber-500/30`

### 2.3 Semantic Status Colors & Badges

| Status Name | Background | Text Color | Border Color | Usage / Meaning |
| :--- | :--- | :--- | :--- | :--- |
| **Verified Shielded** | `bg-emerald-500/10` | `text-emerald-400` | `border-emerald-500/30` | Valid Orchard or Ironwood Unified Address |
| **Rejected Transparent**| `bg-rose-500/10` | `text-rose-400` | `border-rose-500/30` | Blocked transparent `t1...` or mixed UA |
| **Sapling Warning** | `bg-amber-500/10` | `text-amber-400` | `border-amber-500/30` | Valid legacy Sapling address with migration prompt |
| **Spent Nullifier** | `bg-cyan-500/10` | `text-cyan-400` | `border-cyan-500/30` | Note nullifier spend confirmed on-chain |
| **ACK Confirmed** | `bg-amber-500/10` | `text-amber-400` | `border-amber-500/30` | Encrypted memo ACK verified by recipient |
| **Clawed Back** | `bg-slate-500/10` | `text-slate-400` | `border-slate-600/40` | Unspent funds returned to DAO treasury |
| **PII Purged** | `bg-violet-500/10` | `text-violet-400` | `border-violet-500/30` | Addresses wiped with cryptographic attestation |

---

## 3. Typography Hierarchy

- **UI & Headings:** `font-sans` (Inter or system sans-serif), clean letter-spacing (`tracking-tight`).
- **Code, Addresses, TxIDs, UFVKs & Amounts:** `font-mono` (JetBrains Mono, Menlo, monospace), strict tabular numbers (`tabular-nums`).

| Level | Tailwind Classes | Usage |
| :--- | :--- | :--- |
| **Display Header** | `text-2xl font-bold tracking-tight text-white` | Page titles, Campaign names |
| **Section Header** | `text-lg font-semibold tracking-tight text-slate-200` | Table headers, Card titles |
| **Metric Value** | `text-2xl font-mono font-bold text-amber-500` | Total ZEC, Action Counts, Confirmed Slots |
| **Body Text** | `text-sm text-slate-300 leading-relaxed` | Descriptions, instructions, helper notes |
| **Microcopy / Meta** | `text-xs font-mono text-slate-500` | Block heights, timestamps, hashes |

---

## 4. Reusable Sharp Component Specifications

### 4.1 Sharp Button (`components/ui/button.tsx`)
- Sharp corners: `rounded-none` or `rounded-sm`.
- Focus states: `focus:outline-none focus:ring-1 focus:ring-amber-500`.
- Variants:
  - `primary`: `bg-amber-500 text-slate-950 hover:bg-amber-400 font-medium px-4 py-2`
  - `secondary`: `bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 px-4 py-2`
  - `danger`: `bg-rose-950/40 text-rose-300 hover:bg-rose-900/50 border border-rose-800 px-4 py-2`
  - `outline`: `border border-slate-700 text-slate-300 hover:border-slate-500 px-4 py-2`

### 4.2 Sharp Card (`components/ui/card.tsx`)
- `bg-slate-900 border border-slate-800 p-6 rounded-none`
- Crisp top border accent option: `border-t-2 border-t-amber-500`

### 4.3 Address Preflight Input (`components/zcash/AddressPreflightInput.tsx`)
- Live keystroke validation using `src/lib/zcash/zip316.ts`.
- Sub-field validation badges:
  - Green indicator when valid Orchard/Ironwood UA is detected.
  - Red indicator with explanatory popup when `t1...` or mixed UA is typed.
  - Amber warning box when legacy `zs1...` is detected.
