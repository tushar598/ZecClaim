import { NextRequest } from "next/server";
import {
  LightwalletdNotFoundError,
  LightwalletdTransport,
  decodeMessage,
  encodeBytesField,
  encodeVarintField,
  protocolBytesToTxid,
  setLightwalletdTransportFactory,
  txidToProtocolBytes,
} from "@/lib/zcash/lightwalletd";
import { resetChainCaches } from "@/lib/chain/txCheck";
import type { CompactTxShape } from "@/types";

/**
 * In-process fake of the lightwalletd CompactTxStreamer service. It speaks the same protobuf
 * wire format as the real server, so the codec and client are exercised end to end.
 */
export interface FakeTx {
  /** null = not found, 0 = mempool, otherwise mined at this height */
  height: number | null;
  shape?: Partial<CompactTxShape>;
}

export interface FakeChainSpec {
  chainName?: "main" | "test";
  tip: number;
  /** Unix seconds of the tip block; earlier blocks are 25 s apart. Defaults to "now". */
  tipTime?: number;
  txs: Record<string, FakeTx>;
  unreachable?: boolean;
}

const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const repeatEmpty = (field: number, n: number) => Array.from({ length: n }, () => encodeBytesField(field, new Uint8Array()));

function compactTx(index: number, txid: string, shape: Partial<CompactTxShape> = {}) {
  const parts = [encodeVarintField(1, index), encodeBytesField(2, txidToProtocolBytes(txid))];
  if (shape.feeZat !== undefined && shape.feeZat !== null) parts.push(encodeVarintField(3, shape.feeZat));
  parts.push(...repeatEmpty(4, shape.saplingSpends ?? 0));
  parts.push(...repeatEmpty(5, shape.saplingOutputs ?? 0));
  parts.push(...repeatEmpty(6, shape.orchardActions ?? 0));
  parts.push(...repeatEmpty(7, shape.transparentInputs ?? 0));
  for (let i = 0; i < (shape.transparentOutputs ?? 0); i++) parts.push(encodeBytesField(8, encodeVarintField(1, 50_000)));
  parts.push(...repeatEmpty(9, shape.ironwoodActions ?? 0));
  return concat(parts);
}

export function fakeTransport(spec: FakeChainSpec): LightwalletdTransport {
  return {
    async unary(method, request) {
      if (spec.unreachable) throw new Error("14 UNAVAILABLE: connect ECONNREFUSED");
      switch (method) {
        case "GetLightdInfo":
          return concat([
            encodeBytesField(4, new TextEncoder().encode(spec.chainName ?? "test")),
            encodeVarintField(7, spec.tip),
          ]);
        case "GetLatestBlock":
          return encodeVarintField(1, spec.tip);
        case "GetTransaction": {
          const hash = decodeMessage(request).get(3)?.[0] as Uint8Array;
          const txid = protocolBytesToTxid(hash);
          const tx = spec.txs[txid];
          if (!tx || tx.height === null) throw new LightwalletdNotFoundError("Transaction not found");
          return concat([encodeBytesField(1, new Uint8Array([5, 0, 0, 128])), ...(tx.height > 0 ? [encodeVarintField(2, tx.height)] : [])]);
        }
        case "GetBlock": {
          const height = Number(decodeMessage(request).get(1)?.[0] as bigint);
          const vtx = Object.entries(spec.txs)
            .filter(([, tx]) => tx.height === height)
            .map(([txid, tx], i) => encodeBytesField(7, compactTx(i + 1, txid, tx.shape)));
          const tipTime = spec.tipTime ?? Math.floor(Date.now() / 1000);
          const time = tipTime - (spec.tip - height) * 25;
          return concat([encodeVarintField(1, height), encodeVarintField(5, time), ...vtx]);
        }
        default:
          throw new Error(`unexpected method ${method}`);
      }
    },
  };
}

export function useFakeChain(spec: FakeChainSpec) {
  resetChainCaches();
  setLightwalletdTransportFactory(() => fakeTransport(spec));
}

export function restoreChain() {
  resetChainCaches();
  setLightwalletdTransportFactory(null);
}

export const txid = (n: number) => n.toString(16).padStart(64, "0");

export const req = (url: string, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${url}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
