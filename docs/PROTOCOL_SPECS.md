# ZecClaim Protocol Specifications & Mathematical Reference

**Standards Baseline:** ZIP 316, ZIP 321, ZIP 324, ZIP 259 (NU7), ZIP 317, ZIP 2009, lightwalletd `CompactTxStreamer`  
**Consensus Target:** Post-NU7 Zcash (November 2026)  
**Implementation Language:** Pure TypeScript (Cross-platform: Browser, Node.js, Edge)  

---

## 1. ZIP 316: Unified Address Decoding & Receiver Inspection

### 1.1 Specification & Encoding
Under **ZIP 316**, a Unified Address (`u1...` on mainnet, `utest1...` on testnet) is encoded using Bech32m with an unjumbled payload:
1. Decode Bech32m string into Human-Readable Part (HRP) and raw 5-bit bytes.
2. Verify HRP:
   - Mainnet: `"u"`
   - Testnet: `"utest"`
3. Reconstruct 8-bit byte array from 5-bit groups.
4. Execute **F4Jumble Inverse**:
   - F4Jumble is a 4-round Feistel construction using BLAKE2b.
   - Unjumbles the raw payload into a sequence of TLV (Type-Length-Value) receiver tuples:
     $$\text{Receiver} = (\text{typecode}, \text{length}, \text{data})$$

### 1.2 Receiver Typecodes & Policies

Under **ZIP 316** and **ZIP 2005**, the Ironwood shielded pool reuses Orchard's underlying address format, receiver structure, and note cryptography. Ironwood does not define a new standalone receiver typecode; addresses for Ironwood are received using standard Orchard receivers (Typecode `0x03`, 43 bytes). The pool distinction exists at the transaction-bundle and circuit level.

| Typecode | Pool / Receiver Type | Wire Length | ZecClaim Policy | Action / Rationale |
| :---: | :---: | :---: | :---: | :--- |
| `0x00` | P2PKH (Transparent) | 20 bytes | **HARD REJECT** | Rejects mixed UA to prevent transparent pool leakage. |
| `0x01` | P2SH (Transparent) | 20 bytes | **HARD REJECT** | Rejects mixed UA to prevent transparent script leakage. |
| `0x02` | Sapling Shielded | 43 bytes | **WARN & ACCEPT** | Legacy shielded pool; prompts user to prefer modern UA. |
| `0x03` | Orchard & Ironwood Shielded | 43 bytes | **VERIFIED OK** | Modern shielded pool (NU5+ and NU7 Ironwood). |
| `0x04`-`0xBF` | Unassigned | any | **IGNORED** | Unknown items are skipped as ZIP 316 requires. A UA whose only item is unknown has no supported receiver and is rejected. |
| `0xE0`-`0xFC` | MUST-understand metadata | any | **REJECT** | Includes address expiry (`0xE0`, `0xE1`), which ZecClaim does not process. |

**Structural consumer rules (enforced for UAs and UFVKs):** items must appear in strictly ascending typecode order (so duplicates are rejected), every known item must have its exact length, and the 16-byte HRP padding must match after F4Jumble inversion.

**Legacy Sapling:** `zs1` / `ztestsapling1` addresses are Bech32 (not Bech32m) encodings of a 43-byte payload (11-byte diversifier + 32-byte `pk_d`) and are fully decoded; a prefix match alone is never accepted.

**Unified Full Viewing Keys (trust anchor):** HRPs `uview` / `uviewtest` (Revision 0) and `uvf` / `uvftest` (Revision 2). Item lengths: P2PKH FVK 65 bytes, Sapling FVK 128 bytes, Orchard FVK 96 bytes. At least one shielded FVK is required, the key's network must match the campaign, and incoming viewing keys (`uivk`) or anything shaped like a seed phrase or spending key is refused. Format validity does not prove the key controls the funding transaction.

### 1.3 Validation State Machine
```text
Raw Address String
       |
       +---> Starts with "t1" / "t3"? --------> HARD REJECT ("Transparent addresses prohibited")
       |
       +---> Valid Bech32 "zs1" / "ztestsapling1" (43 bytes)? --> WARN ("Legacy Sapling address")
       |
       +---> Starts with "u1" / "utest1"?
                 |
                 v
             Bech32m Decode & F4Jumble Unjumble
                 |
                 +---> Contains Typecode 0x00 or 0x01? --> HARD REJECT ("Mixed UA with transparent receiver")
                 |
                 +---> Unordered / duplicate / MUST-understand item? --> HARD REJECT
                 |
                 +---> Contains Typecode 0x03? -----------> PASS ("Verified Shielded UA")
                 |
                 +---> Contains only Typecode 0x02? -----> WARN ("Sapling-only UA")
                 |
                 +---> Unknown / Invalid Length? --------> HARD REJECT ("Malformed Unified Address")
```

---

## 2. ZIP 321: Multi-Recipient Payment Request URIs

### 2.1 URI Syntax Specification
Under **ZIP 321**, a multi-payment request URI takes the form:
```text
zcash:<address>?amount=<amount>&memo=<base64url>&address.1=<addr2>&amount.1=<amt2>&memo.1=<memo2>...
```
Where:
- Primary recipient (index 0) uses un-indexed query parameters (`address`, `amount`, `memo`).
- Additional recipients (index $i \ge 1$) use dot-indexed parameters (`address.i`, `amount.i`, `memo.i`).
- `amount`: String representation in decimal ZEC (e.g., `0.50000000`).
- `memo`: Standard 512-byte raw note memo, encoded strictly using **Base64URL** (RFC 4648 §5, without padding `=`).

### 2.2 Memo Constraints
- Maximum raw payload: **512 bytes**.
- Encrypted note memos begin with a protocol prefix (e.g., `ZecClaim:` or `ACK-XXXX`).
- Base64URL encoding replaces `+` with `-` and `/` with `_`, stripping trailing `=`.

---

## 3. ZIP 317 & ZIP 2009: Post-NU7 Fee & Action Math

### 3.1 Consensus Parameters (NU7 — November 2026)
- **Consensus Branch ID:** `0x77190AD9` (ZIP 259)
- **Block Target Spacing:** $T_{\text{target}} = 25.0 \text{ seconds}$ (reduced from 75s)
- **Block Action Cap:** $A_{\text{max\_block}} = 330 \text{ actions}$ (ZIP 259)
- **Marginal Fee ($M$):** $1,000 \text{ zatoshi}$ ($0.00001000 \text{ ZEC}$) (ZIP 2009)
- **Grace Actions ($G$):** $2 \text{ actions}$ (ZIP 317)
- **P2P Sweep Buffer:** $\ge 2,000 \text{ zatoshi}$ ($0.00002000 \text{ ZEC}$)

### 3.2 Action Calculation Formula
For a transaction with:
- $N_{\text{in}}$ shielded inputs (spend notes)
- $N_{\text{out}}$ shielded outputs (recipient notes)

$$\text{Actions} = \max(N_{\text{in}}, N_{\text{out}})$$

For batch disbursements where the funding account provides 1 or 2 inputs and pays $K$ recipients:
$$\text{Actions}_{\text{batch}} \approx K + 1 \text{ (change note)}$$

### 3.3 Fee Calculation Formula (ZIP 2009)
$$\text{Fee}(\text{Actions}) = \max(G, \text{Actions}) \times M = \max(2, \text{Actions}) \times 1000 \text{ zatoshi}$$

*Example: Paying 50 recipients in 1 transaction:*
- Outputs: 50 recipients + 1 change = 51 outputs $\to$ 51 actions.
- Fee: $51 \times 1,000 \text{ zat} = 51,000 \text{ zat} = 0.00051 \text{ ZEC}$.

### 3.4 Safe Batch Chunking Algorithm (<= 300 Actions)
To safely fit within NU7's 330-action block cap while leaving a 30-action buffer for mempool fluctuations:
$$\text{ChunkSize}_{\text{max}} = 298 \text{ recipients} + 1 \text{ input} + 1 \text{ change} = 300 \text{ actions}$$

```typescript
function chunkPayouts(recipients: Recipient[], maxActions: number = 300): Chunk[] {
  const maxRecipientsPerTx = maxActions - 2; // reserve 1 for input, 1 for change
  const chunks: Chunk[] = [];
  for (let i = 0; i < recipients.length; i += maxRecipientsPerTx) {
    const slice = recipients.slice(i, i + maxRecipientsPerTx);
    const actions = Math.max(1, slice.length + 1);
    const feeZat = Math.max(2, actions) * 1000;
    chunks.push({
      batchIndex: chunks.length,
      recipients: slice,
      actionsCount: actions,
      estimatedFeeZat: feeZat,
    });
  }
  return chunks;
}
```

---

## 4. ZIP 324 Gift-Card CSV & Receipt State Machine

### 4.1 Ingestion CSV Format (parsed in the browser)
```csv
card_id,amount_zec,sweep_fee_buffer_zat,claim_url,ack_hash
CARD-01,0.05000000,2000,https://link.vizor.cash/payment-links/open#key=...,8f31b2...
```
- `card_id`: public slip identifier (`CARD-01`).
- `amount_zec`: spendable card value. `sweep_fee_buffer_zat`: fee allowance, minimum 2,000 zatoshi.
- `claim_url` (also `link` / `uri`): the gift-card link. Its `#key=` fragment is the card's spending secret; it stays in browser memory to draw the QR slip and is stripped before anything is sent.
- `ack_hash`: SHA-256 of the `ACK-XXXXXXXX` code written in the card's encrypted memo.

The server receives `{ cardId, amountZec, feeBufferZat, claimToken (link without fragment), ackHash }` and refuses any value containing `#key=` or `%23key=`.

### 4.2 Receipt, Dispute and Clawback

ZecClaim cannot detect a gift card being swept: the card's note belongs to the card's own key, not to the campaign UFVK. The states record what recipients reported and what the chain confirmed:

1. The attendee sweeps the card in Vizor (>= 0.0.57) or Zodl (>= 3.16) and reads the memo code.
2. On `/ack/[campaignId]` they submit `cardId`, `ackCode` and, optionally, the sweep `txid` from their wallet.
3. Accepted when the card is `UNCLAIMED` or `DISPUTED` and $\text{SHA-256}(ackCode) = ack\_hash$. If a sweep txid is given it must be found on the campaign's network, mined at or after the campaign's `anchorHeight`, and not already used for another card. The card becomes `ACK_CONFIRMED`.
4. Anyone may file one public dispute per card (`UNCLAIMED` or `ACK_CONFIRMED`). An unclaimed card becomes `DISPUTED`; a confirmed card stays confirmed with the dispute shown next to it.
5. After `clawbackExpiryHeight` (checked against the live chain tip), the organizer records a clawback txid that must exist on-chain; remaining `UNCLAIMED` cards become `CLAWED_BACK`.

Per-IP (20/min) and per-card (10/min) limits bound guessing of memo codes.

---

## 5. Zingo-CLI Batch Execution Script Specification

For organizers signing and broadcasting with zingo-cli (zingolib v8):
```bash
#!/usr/bin/env bash
# ZecClaim Payout Script (NU7, branch 0x77190AD9)
set -euo pipefail

ZINGO="zingo-cli --server https://zebra.openlightnodes.org:443 --chain mainnet --waitsync"   # or testnet.zec.rocks + --chain testnet

echo "[1/3] Syncing the wallet and checking the balance..."
$ZINGO balance

echo "[2/3] Broadcasting chunk 1 (45 actions, 45,000 zat fee)..."
$ZINGO quicksend '[{"address": "u1...", "amount": 50000000, "memo": "ZecClaim: Hackathon"}, ...]'   # amounts in zatoshis
echo "Record the txid printed above as transaction 1 of this batch run in ZecClaim."

# Between chunks: wait for the previous change note to confirm; --waitsync syncs before the next send.
sleep 90

echo "[3/3] All batch payout chunks sent."
```

Flags verified against zingolib v8.0.0 (`zingo-cli/src/lib.rs`, `commands.rs`): `--chain mainnet|testnet|regtest` (no `--regtest` flag); the CLI syncs at startup and `--waitsync` blocks the command until that sync completes; `sync` alone is not a command (it needs `run`, `status`, ...), so the script does not call it; `quicksend` takes a JSON array with amounts in zatoshis; `export_ufvk` prints the wallet's UFVK for the campaign anchor.

### 5.1 Budget and Fee Reservation

Lane 2 slot amounts are computed after reserving the batch fee: `perSlot = floor((budget - estimateBatchFeeZat(slots)) / slots)`, where `estimateBatchFeeZat` applies the same 298-recipient chunking as the exporter. Imports that would make `cards (value + sweep buffer) + slots + batch fee + open card plan` exceed the declared funding are refused.

**Amount modes.** Claim links and planned gift cards each take one of three modes (`src/lib/campaign/amountPlan.ts`, the form's preview, mirrored by the server):

| Mode | Claim links | Planned gift cards |
| :--- | :--- | :--- |
| Split evenly | `perSlot` above (default) | `perCard = floor((budget - 2,000 x cards) / cards)` |
| Fixed amount | `slotAmountZat` on every link | the same amount on every card |
| Custom | `slotAmountsZat[i]` for link `i` (length = `slotCount`) | `cardPlanZat[i]` for card `i` |

The `budget` of a split: Lane 2 only, the whole funding. Lane 1 only, the whole funding. Hybrid, both split: cards take `funding - floor(funding / 2)`, links split `funding - cardPlanReserve`. Hybrid, one side split: it splits what the other side leaves (links also leave their batch fee). Hybrid without a card plan keeps the historical rule: links split half, and the form keeps fixed or custom links within half.

**Card plan.** `cardPlanReserve = sum(amount + 2,000)` (each card's value plus the ZIP 317 / ZIP 2009 minimum sweep buffer). ZecClaim never mints a card, so the plan is the organizer's commitment: an imported card must take an open plan entry of exactly its amount (`round(amount_zec x 10^8)`, card IDs are not compared), otherwise the whole import is refused (409, listing what is still open). Open entries stay reserved against Luma imports. The proof portal publishes the plan and how many registered cards match it.

---

## 6. On-Chain Checks (lightwalletd `CompactTxStreamer`)

Implementation: `src/lib/zcash/lightwalletd.ts` (protobuf codec + gRPC transport) and `src/lib/chain/txCheck.ts`.

| Call | Request | Used for |
| :--- | :--- | :--- |
| `GetLightdInfo(Empty)` | | `chainName` must be `main` / `test` for the campaign's network (cached 10 min). |
| `GetLatestBlock(ChainSpec)` | | Chain tip: confirmations, `anchorHeight`, clawback expiry (cached 15 s). |
| `GetTransaction(TxFilter{hash=3})` | txid bytes in protocol order (display hex reversed) | `RawTransaction.height`: 0 = mempool, `2^64-1` = fork only, other = mined height. gRPC NOT_FOUND = unknown txid. |
| `GetBlock(BlockID{height=1})` at the tip | tip height | `CompactBlock.time` (field 5, Unix seconds): the tip block's timestamp, used to turn a clawback date into a height (section 6.1). Fetched once per new tip. |
| `GetBlock(BlockID{height=1})` | mined height | `CompactTx` with the same txid gives the shape: field 4 Sapling spends, 5 Sapling outputs, 6 Orchard actions, 7 transparent inputs, 8 transparent outputs (with values), 9 Ironwood actions, 3 fee when the server knows it. |

Default endpoints: `testnet.zec.rocks:443` and `zebra.openlightnodes.org:443` (override with `ZCASH_LIGHTWALLETD_TESTNET` / `ZCASH_LIGHTWALLETD_MAINNET`).

**Payout consistency rule.** A chunk paying $K$ recipients is consistent with its recorded transaction when
$$\text{saplingOutputs} + \text{orchardActions} + \text{ironwoodActions} \ge K \quad\land\quad \text{transparentOutputs} = 0.$$
Transparent inputs are flagged too (publicly linkable funding). This is a necessary condition only: amounts and recipients are encrypted.

**Funding rule.** A campaign is anchored only if its funding txid is found on the campaign's network (MINED or MEMPOOL) and, once mined, has $\text{saplingOutputs} + \text{orchardActions} + \text{ironwoodActions} \ge 1$. Each funding txid anchors at most one campaign per network.

### 6.1 Clawback Date to Block Height

Organizers choose a date and time $t$; the chain enforces a height. With the live tip height $H_{tip}$ and its block timestamp $t_{tip}$ (`CompactBlock.time`), at the NU7 target spacing of 25 s:
$$H_{expiry} = H_{tip} + \max\left(1, \left\lceil \frac{t - t_{tip}}{25\,\text{s}} \right\rceil\right)$$
The conversion runs on the server at anchoring (`src/lib/chain/blockTime.ts`), so the visitor's clock does not matter; $t$ must be at least one hour and at most one year after $t_{tip}$. Displays convert back with $t \approx t_{tip} + (H - H_{tip}) \cdot 25\,\text{s}$ and always label the result as an estimate. Observed spacing in November 2026 over 2,000 blocks: about 25.3 s on mainnet (a one-week clawback opens roughly 2 hours late) and about 23.2 s on testnet (roughly 13 hours early). The height is what counts; every page shows the date as an estimate recomputed from the live tip.
