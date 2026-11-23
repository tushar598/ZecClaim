# ZecClaim Protocol Specifications & Mathematical Reference

**Standards Baseline:** ZIP 316, ZIP 321, ZIP 324, ZIP 259 (NU7), ZIP 317, ZIP 2009, ZIP 311  
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

| Typecode | Pool / Receiver Type | Wire Length | ZecClaim Policy | Action / Rationale |
| :---: | :---: | :---: | :---: | :--- |
| `0x00` | P2PKH (Transparent) | 20 bytes | **HARD REJECT** | Rejects mixed UA to prevent transparent pool leakage. |
| `0x01` | P2SH (Transparent) | 20 bytes | **HARD REJECT** | Rejects mixed UA to prevent transparent script leakage. |
| `0x02` | Sapling Shielded | 43 bytes | **WARN & ACCEPT** | Legacy shielded pool; prompts user to prefer modern UA. |
| `0x03` | Orchard Shielded | 43 bytes | **VERIFIED OK** | Modern shielded pool (NU5+). |
| `0x04` | Ironwood Shielded | 43 bytes | **VERIFIED OK** | Post-NU7 shielded pool (November 2026). |

### 1.3 Validation State Machine
```text
Raw Address String
       |
       +---> Starts with "t1" / "t3"? --------> HARD REJECT ("Transparent addresses prohibited")
       |
       +---> Starts with "zs1"? ---------------> WARN ("Legacy Sapling address detected")
       |
       +---> Starts with "u1" / "utest1"?
                 |
                 v
             Bech32m Decode & F4Jumble Unjumble
                 |
                 +---> Contains Typecode 0x00 or 0x01? --> HARD REJECT ("Mixed UA with transparent receiver")
                 |
                 +---> Contains Typecode 0x03 or 0x04? --> PASS ("Verified Shielded UA")
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

## 4. Vizor ZIP 324 CSV Specification & Memo ACK State Machine

### 4.1 Ingestion CSV Format
ZecClaim accepts standard Vizor / Zodl group gift card exports:
```csv
card_id,amount_zec,sweep_fee_buffer_zat,claim_token,ack_hash
CARD-01,0.05000000,2000,d8e9a2...,8f31b2...
CARD-02,0.05000000,2000,a1b4c9...,e714d5...
```
- `card_id`: Human-readable slip identifier (`CARD-01`).
- `amount_zec`: Spendable note value.
- `sweep_fee_buffer_zat`: Explicit fee allowance under ZIP 2009 (minimum 2,000 zatoshis).
- `claim_token`: Secret gift card URI/seed (stored only as SHA-256 hash in DB).
- `ack_hash`: SHA-256 hash of the unique `ACK-XXXX` string placed in the note's encrypted memo.

### 4.2 Nullifier-Gated ACK Verification
1. Attendee scans and sweeps the physical card using Vizor (>= 0.0.57) or Zodl (>= 3.16).
2. The lightnode detects the transaction. Watch-only UFVK identifies the card's note nullifier has been spent on-chain.
3. The attendee opens their wallet transaction details and reads the decrypted memo: `"ACK-9241"`.
4. The attendee navigates to `/ack/[campaignId]` and submits:
   - `cardId`: `"CARD-01"`
   - `ackCode`: `"ACK-9241"`
5. The server computes `SHA-256("ACK-9241")` and compares against `ack_hash`.
6. **Enforcement Gate:** Verification succeeds **only if**:
   $$\text{Card State} == \text{"SPENT"} \quad \land \quad \text{SHA-256}(ackCode) == ack\_hash$$
7. If confirmed, status becomes `"ACK_CONFIRMED"`.

---

## 5. Zingo-CLI Batch Execution Script Specification

For organizers signing and broadcasting via CLI against the Mumbai lightnode:
```bash
#!/usr/bin/env bash
# ZecClaim Auto-Generated Chunked Payout Script (NU7)
# Target Node: zebra.openlightnodes.org:443
# Consensus Branch ID: 0x77190AD9
set -euo pipefail

ZINGO_BIN="zingo-cli --server https://zebra.openlightnodes.org:443"

echo "[1/3] Syncing wallet against Mumbai NU7 lightnode..."
$ZINGO_BIN --regtest=false sync

echo "[2/3] Broadcasting Chunk 1 (Actions: 45 | Fee: 45,000 zat)..."
$ZINGO_BIN quicksend '{"receivers": [{"address": "u1...", "amount": 50000000, "memo": "ZecClaim Hackathon 1"}, ...]}'

echo "[3/3] Payout completed successfully."
```
