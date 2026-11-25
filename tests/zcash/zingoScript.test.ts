import { describe, it, expect } from "vitest";
import { generateZingoCliScript, viewingKeyAuditCommands } from "@/lib/zcash/zingoScript";
import { PayoutChunk } from "@/types";

describe("zingo-cli Batch Script Generator", () => {
  const mockChunks: PayoutChunk[] = [
    {
      batchIndex: 0,
      recipients: [
        { address: "u1testrecipient1", amountZat: 50_000_000, memo: "Memo 1" },
        { address: "u1testrecipient2", amountZat: 25_000_000 },
      ],
      actionsCount: 3,
      estimatedFeeZat: 3000,
      zip321Uri: "zcash:u1testrecipient1?amount=0.50000000",
    },
    {
      batchIndex: 1,
      recipients: [
        { address: "u1testrecipient3", amountZat: 10_000_000, memo: "Memo 3" },
      ],
      actionsCount: 2,
      estimatedFeeZat: 2000,
      zip321Uri: "zcash:u1testrecipient3?amount=0.10000000",
    },
  ];

  it("generates executable bash script with safe flags and lightnode parameters for mainnet", () => {
    const script = generateZingoCliScript(mockChunks, {
      campaignTitle: "ZecHub India Hackathon",
      network: "mainnet",
    });

    expect(script).toContain("#!/usr/bin/env bash");
    expect(script).toContain("set -euo pipefail");
    expect(script).toContain("zebra.openlightnodes.org:443");
    expect(script).toContain("0x77190AD9"); // NU7 Consensus Branch ID
    expect(script).toContain("zingo-cli --server https://zebra.openlightnodes.org:443 --chain mainnet --waitsync");
    // zingolib v8: a bare `sync` command fails (it needs a subcommand); --waitsync replaces it.
    expect(script).not.toMatch(/\$ZINGO sync\b/);
    // zingo-cli has no --regtest flag; passing one aborts the script under `set -e`.
    expect(script).not.toContain("--regtest");
    expect(script).toContain("Broadcasting Chunk 1/2");
    expect(script).toContain("Broadcasting Chunk 2/2");
    expect(script).toContain("$ZINGO quicksend");
    expect(script).toContain("u1testrecipient1");
    expect(script).toContain("u1testrecipient3");
  });

  it("generates script for testnet with testnet node and --chain testnet", () => {
    const script = generateZingoCliScript(mockChunks, {
      campaignTitle: "Testnet Campaign",
      network: "testnet",
    });

    expect(script).toContain("testnet.zec.rocks:443");
    expect(script).toContain("zingo-cli --server https://testnet.zec.rocks:443 --chain testnet --waitsync");
  });

  it("supports custom lightnode host and port", () => {
    const script = generateZingoCliScript(mockChunks, {
      campaignTitle: "Custom Node Payout",
      lightnodeHost: "custom.lightnode.org",
      lightnodePort: 8443,
    });

    expect(script).toContain("https://custom.lightnode.org:8443");
  });

  it("safely escapes single quotes in memos to prevent bash command injection", () => {
    const maliciousChunks: PayoutChunk[] = [
      {
        batchIndex: 0,
        recipients: [
          {
            address: "u1testrecipient1",
            amountZat: 50_000_000,
            memo: "Alice's Payout: '$(rm -rf /)'",
          },
        ],
        actionsCount: 2,
        estimatedFeeZat: 2000,
        zip321Uri: "zcash:u1testrecipient1",
      },
    ];

    const script = generateZingoCliScript(maliciousChunks, {
      campaignTitle: "Organizer's \"Campaign\"\nmalicious_command\r$TEST",
    });

    // Verify single quotes are escaped with '\''
    expect(script).toContain("Alice'\\''s Payout");
    // Verify campaign title newlines are stripped and special chars are escaped
    expect(script).not.toContain("\nmalicious_command");
    expect(script).toContain("Organizer's \\\"Campaign\\\" malicious_command \\$TEST");
  });
});

describe("Viewing-key audit commands (proof portal guide)", () => {
  it("opens a view-only testnet wallet a few blocks before the funding height, without the key in the text", () => {
    const cmd = viewingKeyAuditCommands({ network: "testnet", campaignId: "7b69ef4d237cf190", startHeight: 4_661_249 });
    expect(cmd.birthday).toBe(4_661_239);
    expect(cmd.openWallet).toContain("--chain testnet");
    expect(cmd.openWallet).toContain("--server https://testnet.zec.rocks:443");
    expect(cmd.openWallet).toContain('--data-dir "$HOME/zecclaim-audit-7b69ef4d237cf190"');
    expect(cmd.openWallet).toContain('--birthday 4661239 --viewkey "$UFVK" --waitsync value_transfers');
    expect(cmd.fingerprint).toContain("read -rs UFVK");
    expect(cmd.fingerprint).toContain(`printf '%s' "$UFVK" | shasum -a 256`);
    // Reopening an existing wallet needs neither the key nor a birthday.
    expect(cmd.reopenWallet).not.toMatch(/--viewkey|--birthday/);
    for (const text of [cmd.fingerprint, cmd.openWallet, cmd.reopenWallet]) expect(text).not.toMatch(/uview/);
  });

  it("falls back to birthday 0 without a known height, uses mainnet flags, and keeps the folder name inert", () => {
    const cmd = viewingKeyAuditCommands({ network: "mainnet", campaignId: "abc$(rm -rf ~)/../x", startHeight: null });
    expect(cmd.birthday).toBe(0);
    expect(cmd.openWallet).toContain("--chain mainnet --server https://zebra.openlightnodes.org:443");
    expect(cmd.openWallet).toContain('"$HOME/zecclaim-audit-abcrm-rfx"');
  });
});
