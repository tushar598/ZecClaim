import { describe, it, expect, afterEach } from "vitest";
import {
  LightwalletdClient,
  decodeMessage,
  encodeBytesField,
  encodeVarint,
  encodeVarintField,
  parseCompactTx,
  protocolBytesToTxid,
  txidToProtocolBytes,
} from "@/lib/zcash/lightwalletd";
import { checkIsStale, checkTransaction, getChainTip } from "@/lib/chain/txCheck";
import { isFullyShielded, payoutProblems, shapeSummary, shieldedOutputCapacity } from "@/lib/chain/describe";
import { restoreChain, txid, useFakeChain } from "../helpers/fakeChain";
import type { ChainTxCheck } from "@/types";

afterEach(() => restoreChain());

describe("protobuf wire codec", () => {
  it("round-trips varints, including values above 2^53", () => {
    for (const n of [0n, 1n, 127n, 128n, 300n, 4_655_118n, 0xffffffffffffffffn]) {
      const decoded = decodeMessage(encodeVarintField(2, n));
      expect(decoded.get(2)?.[0]).toBe(n);
    }
    expect(Array.from(encodeVarint(300))).toEqual([0xac, 0x02]);
  });

  it("decodes repeated length-delimited fields", () => {
    const buf = new Uint8Array([...encodeBytesField(9, new Uint8Array([1, 2])), ...encodeBytesField(9, new Uint8Array([3]))]);
    const m = decodeMessage(buf);
    expect(m.get(9)?.length).toBe(2);
  });

  it("rejects truncated input", () => {
    expect(() => decodeMessage(new Uint8Array([0x0a, 0x05, 0x01]))).toThrow(/Truncated/);
  });
});

describe("txid byte order", () => {
  it("reverses the display hex into protocol order and back", () => {
    const display = "50f4246721fa5ff61e04e7a7158ca9285b0b20f89460ed33ceb59fb0a3853e8c";
    const bytes = txidToProtocolBytes(display);
    expect(bytes[0]).toBe(0x8c);
    expect(bytes[31]).toBe(0x50);
    expect(protocolBytesToTxid(bytes)).toBe(display);
  });

  it("refuses malformed txids", () => {
    expect(() => txidToProtocolBytes("abc")).toThrow();
  });
});

describe("compact transaction shape", () => {
  it("counts per-pool actions and transparent outputs (CompactTx fields 4-9)", () => {
    const id = txid(7);
    const buf = new Uint8Array([
      ...encodeVarintField(1, 2),
      ...encodeBytesField(2, txidToProtocolBytes(id)),
      ...encodeBytesField(9, new Uint8Array(4)),
      ...encodeBytesField(9, new Uint8Array(4)),
      ...encodeBytesField(9, new Uint8Array(4)),
      ...encodeBytesField(8, encodeVarintField(1, 12_345)),
      ...encodeBytesField(7, new Uint8Array(2)),
    ]);
    const parsed = parseCompactTx(buf);
    expect(parsed.txid).toBe(id);
    expect(parsed.index).toBe(2);
    expect(parsed.shape).toMatchObject({ ironwoodActions: 3, orchardActions: 0, transparentOutputs: 1, transparentOutputZat: 12_345, transparentInputs: 1, feeZat: null });
    expect(isFullyShielded(parsed.shape)).toBe(false);
    expect(shieldedOutputCapacity(parsed.shape)).toBe(3);
  });
});

describe("LightwalletdClient against a fake node", () => {
  it("maps the mempool sentinel (height 0) and unknown txids", async () => {
    useFakeChain({ tip: 100, txs: { [txid(1)]: { height: 0 } } });
    const client = new LightwalletdClient("fake:443");
    expect(await client.getTransaction(txid(1))).toEqual({ height: null, state: "MEMPOOL" });
    expect(await client.getTransaction(txid(2))).toBeNull();
    expect(await client.getLatestHeight()).toBe(100);
  });
});

describe("checkTransaction", () => {
  it("reports MINED with height, confirmations and shape", async () => {
    useFakeChain({ tip: 1_000, txs: { [txid(5)]: { height: 990, shape: { ironwoodActions: 4 } } } });
    const check = await checkTransaction("testnet", txid(5));
    expect(check.status).toBe("MINED");
    expect(check.height).toBe(990);
    expect(check.confirmations).toBe(11);
    expect(check.shape?.ironwoodActions).toBe(4);
    expect(shapeSummary(check.shape)).toBe("4 Ironwood actions; no transparent inputs or outputs");
  });

  it("reports NOT_FOUND, MEMPOOL and UNREACHABLE without throwing", async () => {
    useFakeChain({ tip: 10, txs: { [txid(1)]: { height: 0 } } });
    expect((await checkTransaction("testnet", txid(9))).status).toBe("NOT_FOUND");
    expect((await checkTransaction("testnet", txid(1))).status).toBe("MEMPOOL");
    useFakeChain({ tip: 10, txs: {}, unreachable: true });
    const down = await checkTransaction("testnet", txid(1));
    expect(down.status).toBe("UNREACHABLE");
    expect(down.note).toMatch(/UNAVAILABLE/);
  });

  it("refuses a node that serves the wrong chain", async () => {
    useFakeChain({ chainName: "main", tip: 10, txs: { [txid(1)]: { height: 5 } } });
    const check = await checkTransaction("testnet", txid(1));
    expect(check.status).toBe("UNREACHABLE");
    expect(check.note).toMatch(/not testnet/);
    expect((await getChainTip("testnet")).height).toBeNull();
  });

  it("is SKIPPED when chain checks are disabled and no fake node is installed", async () => {
    const check = await checkTransaction("testnet", txid(1));
    expect(check.status).toBe("SKIPPED");
  });
});

describe("payout evaluation", () => {
  const base: ChainTxCheck = {
    status: "MINED", txid: txid(1), network: "testnet", height: 5, tipHeight: 6, confirmations: 2,
    shape: { transparentInputs: 0, transparentOutputs: 0, transparentOutputZat: 0, saplingSpends: 0, saplingOutputs: 0, orchardActions: 0, ironwoodActions: 3, feeZat: null },
    checkedAt: new Date().toISOString(), endpoint: "fake", note: null,
  };

  it("accepts a fully shielded tx with room for every recipient", () => {
    expect(payoutProblems(base, 2)).toEqual([]);
  });

  it("flags too few shielded outputs and any transparent output", () => {
    const leaky = { ...base, shape: { ...base.shape!, ironwoodActions: 2, transparentOutputs: 1 } };
    const problems = payoutProblems(leaky, 3);
    expect(problems.some((p) => /room for 2 shielded outputs/.test(p))).toBe(true);
    expect(problems.some((p) => /transparent output/.test(p))).toBe(true);
  });

  it("treats deep MINED checks as final and fresh ones as stale after the interval", () => {
    expect(checkIsStale({ ...base, confirmations: 20 }, 1)).toBe(false);
    expect(checkIsStale({ ...base, checkedAt: new Date(Date.now() - 120_000).toISOString() }, 60_000)).toBe(true);
    expect(checkIsStale(null, 60_000)).toBe(true);
  });
});
