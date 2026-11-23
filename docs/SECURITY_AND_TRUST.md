# ZecClaim Security & Threat Model

**Version:** 1.0.0 (Phase 0 Audit)  
**Classification:** High-Assurance Non-Custodial Protocol Design  
**Compliance Context:** Non-Custodial Coordination (Zero-VASP / Zero Money Transmission)  

---

## 1. Core Trust Invariants & Cryptographic Proofs

Security in ZecClaim is grounded in strict mathematical boundaries: what cryptography proves versus what operational assumptions remain.

```text
+---------------------------------------------------------------------------------------------------+
|                                 WHAT CRYPTOGRAPHY PROVES                                          |
+---------------------------------------------------------------------------------------------------+
| 1. Watch-only UFVK proves inflows, funding TxID, and spent note nullifiers without spending power.|
| 2. ZIP 316 Bech32m + F4Jumble proves submitted addresses are strictly shielded (no transparent).  |
| 3. Note memo ACK codes prove possession of the decrypted note memo (only the recipient holds it). |
| 4. SHA-256 scrub attestation proves exact set of submitted addresses was finalized and wiped.    |
+---------------------------------------------------------------------------------------------------+

+---------------------------------------------------------------------------------------------------+
|                                WHAT REMAINS AN OPERATIONAL TRUST ASSUMPTION                       |
+---------------------------------------------------------------------------------------------------+
| 1. Organizer Self-Sweep: Organizer holds the funding seed; could technically sweep before event.  |
| 2. Bearer Slip Exposure: Physical QR slip could be photographed before attendee sweeps it.       |
| 3. Server DB Window: Address resides in MongoDB temporarily between submission and scrub.        |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Threat Analysis & Mitigations

### Threat 1: Organizer Self-Sweep / Rogue Host (Lane 1)
- **Description:** A local meetup host creates the batch of gift cards, prints them, but sweeps the funds back into their own wallet before the attendees can scan them.
- **Mitigation & Detection:**
  1. **Dispute Tripwire:** When an attendee scans an already-swept card, Vizor displays an error. The attendee enters the public `CARD-ID` into the portal.
  2. **UFVK On-Chain Timestamping:** The public Proof Portal uses the campaign UFVK to expose the exact block height at which each nullifier was spent. If the nullifier was spent before the event check-in opened, the organizer is cryptographically caught and publicly flagged.
  3. **Split-Custody Ready Workflow:** For large events, ZecHub DAO mints the cards and pre-seals physical QR slips in scratch-off envelopes. The local host never sees the secret seed.

### Threat 2: Physical Bearer Slip Leak (Lane 1)
- **Description:** An observer at a desk glances at or photographs an unrevealed QR slip lying on a table.
- **Mitigation:**
  - Slips feature single-reveal fold designs or desk check-in dynamic screen reveal mode.
  - Cards include public IDs (`CARD-01`) separate from the secret QR payload.
  - Instant sweep recommendation: attendee is prompted to sweep immediately via Vizor/Zodl (~50s / 2 blocks).

### Threat 3: Server Address Database Compromise (Lane 2)
- **Description:** An attacker gains read access to the MongoDB instance and attempts to associate submitted Zcash addresses with event participants.
- **Mitigation:**
  1. **Zero Social Linking:** ZecClaim rejects all OAuth logins (no Twitter, GitHub, or Discord usernames in DB).
  2. **Hashed Tokens:** Claim links use CSPRNG tokens (`claim_tok_<64-hex>`). The DB stores only `SHA-256(token + pepper)`.
  3. **Automatic 7-Day TTL Expiry:** MongoDB automatically deletes all `ClaimSlot` records after 7 days via index expiration.
  4. **1-Click DB Scrub:** Immediately after the organizer broadcasts the batch payout, they trigger the 1-Click Scrub API. All addresses are overwritten with `"[PURGED]"` and a permanent cryptographic attestation hash is recorded.

### Threat 4: Accidental Transparent Address Contamination (Lane 2)
- **Description:** A recipient pastes a transparent address (`t1...`) or a multi-receiver Unified Address that includes a transparent receiver, causing the organizer's wallet to inadvertently fund transparent outputs.
- **Mitigation:**
  - **Client-Side ZIP 316 Preflight:** Blocks paste input immediately before submission.
  - **Server-Side ZIP 316 Preflight:** Hard rejection in API handler.
  - Strict typecode check ensures no `0x00` (P2PKH) or `0x01` (P2SH) receiver exists in the UA payload.

### Threat 5: Mempool Jamming or NU7 Block Overflow (Lane 2)
- **Description:** A large batch of 500 recipients is sent in a single transaction, exceeding NU7's 330-action block cap and failing consensus.
- **Mitigation:**
  - **Strict <= 300 Action Chunking:** Payouts are automatically split into discrete batches of at most 298 outputs + 1 input + 1 change = 300 actions, well below the 330-action cap.

---

## 3. Regulatory & Legal Boundary (Zero-VASP Compliance)

ZecClaim is strictly non-custodial coordination software:
1. **No Custody of Funds:** At no point does the ZecClaim server, company, or protocol developers hold, transmit, control, or possess cryptographic private keys or user funds.
2. **No Order Execution:** The server does not broadcast transactions. It exports client-side signing artifacts (`ZIP 321` URIs or shell scripts) executed locally by the user.
3. **FIU-IND / FATF Definition:** Because ZecClaim never acts as an intermediary or custodian of virtual assets, it falls outside the definition of a Virtual Asset Service Provider (VASP) or money transmitter.
