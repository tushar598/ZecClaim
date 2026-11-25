import type { CompactTxShape, ZcashNetwork } from "@/types";

/**
 * Minimal lightwalletd client (server-only).
 *
 * Talks to the `cash.z.wallet.sdk.rpc.CompactTxStreamer` gRPC service that every Zcash light
 * wallet uses (zcash/lightwallet-protocol `service.proto` / `compact_formats.proto`). Only four
 * read-only calls are needed, so the protobuf messages are encoded and decoded by hand here
 * instead of shipping a protobuf toolchain.
 *
 * What this can tell ZecClaim without any key: whether a txid is mined or in the mempool, at
 * which height, and the transaction's *shape* (transparent inputs / outputs and the number of
 * Sapling outputs, Orchard actions and Ironwood actions). It cannot reveal amounts, recipients
 * or memos of shielded outputs.
 */

const SERVICE = "/cash.z.wallet.sdk.rpc.CompactTxStreamer";

export const DEFAULT_LIGHTWALLETD: Record<ZcashNetwork, string> = {
  testnet: "testnet.zec.rocks:443",
  mainnet: "zebra.openlightnodes.org:443", // Zcash India lightnode
};

export function lightwalletdEndpoint(network: ZcashNetwork): string {
  const override = network === "mainnet" ? process.env.ZCASH_LIGHTWALLETD_MAINNET : process.env.ZCASH_LIGHTWALLETD_TESTNET;
  return override?.trim() || DEFAULT_LIGHTWALLETD[network];
}

/* ------------------------------------------------------------------------------------------ */
/* Protobuf wire format (varint + length-delimited only)                                       */
/* ------------------------------------------------------------------------------------------ */

export type ProtoValue = bigint | Uint8Array;
export type ProtoMessage = Map<number, ProtoValue[]>;

export function encodeVarint(value: bigint | number): Uint8Array {
  let n = BigInt(value);
  if (n < 0n) throw new Error("varint must be non-negative");
  const out: number[] = [];
  do {
    let byte = Number(n & 0x7fn);
    n >>= 7n;
    if (n > 0n) byte |= 0x80;
    out.push(byte);
  } while (n > 0n);
  return Uint8Array.from(out);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export function encodeVarintField(field: number, value: bigint | number): Uint8Array {
  return concat([encodeVarint((field << 3) | 0), encodeVarint(value)]);
}

export function encodeBytesField(field: number, value: Uint8Array): Uint8Array {
  return concat([encodeVarint((field << 3) | 2), encodeVarint(value.length), value]);
}

function readVarint(buf: Uint8Array, pos: number): [bigint, number] {
  let result = 0n;
  let shift = 0n;
  for (let i = 0; i < 10; i++) {
    if (pos >= buf.length) throw new Error("Truncated varint");
    const byte = buf[pos++];
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return [result, pos];
    shift += 7n;
  }
  throw new Error("Varint too long");
}

export function decodeMessage(buf: Uint8Array): ProtoMessage {
  const fields: ProtoMessage = new Map();
  let pos = 0;
  while (pos < buf.length) {
    let key: bigint;
    [key, pos] = readVarint(buf, pos);
    const field = Number(key >> 3n);
    const wireType = Number(key & 7n);
    let value: ProtoValue;
    if (wireType === 0) {
      [value, pos] = readVarint(buf, pos);
    } else if (wireType === 2) {
      let len: bigint;
      [len, pos] = readVarint(buf, pos);
      const end = pos + Number(len);
      if (end > buf.length) throw new Error("Truncated length-delimited field");
      value = buf.subarray(pos, end);
      pos = end;
    } else if (wireType === 1) {
      value = buf.subarray(pos, pos + 8);
      pos += 8;
    } else if (wireType === 5) {
      value = buf.subarray(pos, pos + 4);
      pos += 4;
    } else {
      throw new Error(`Unsupported protobuf wire type ${wireType}`);
    }
    const list = fields.get(field) ?? [];
    list.push(value);
    fields.set(field, list);
  }
  return fields;
}

const firstVarint = (m: ProtoMessage, field: number): bigint | null => {
  const v = m.get(field)?.[0];
  return typeof v === "bigint" ? v : null;
};
const firstBytes = (m: ProtoMessage, field: number): Uint8Array | null => {
  const v = m.get(field)?.[0];
  return v instanceof Uint8Array ? v : null;
};
const firstString = (m: ProtoMessage, field: number): string => {
  const v = firstBytes(m, field);
  return v ? new TextDecoder().decode(v) : "";
};
const countField = (m: ProtoMessage, field: number) => m.get(field)?.length ?? 0;

/* ------------------------------------------------------------------------------------------ */
/* Transaction ids                                                                             */
/* ------------------------------------------------------------------------------------------ */

/** Display txid (block-explorer hex) -> protocol-order bytes used on the wire. */
export function txidToProtocolBytes(txidHex: string): Uint8Array {
  if (!/^[0-9a-fA-F]{64}$/.test(txidHex)) throw new Error("Transaction ID must be 64 hex characters");
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(txidHex.slice(i * 2, i * 2 + 2), 16);
  return bytes.reverse();
}

export function protocolBytesToTxid(bytes: Uint8Array): string {
  return Array.from(bytes)
    .reverse()
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ------------------------------------------------------------------------------------------ */
/* Compact transaction shape                                                                   */
/* ------------------------------------------------------------------------------------------ */

export type { CompactTxShape };

/**
 * CompactTx fields (compact_formats.proto): 1 index, 2 txid, 3 fee, 4 spends, 5 outputs,
 * 6 actions (Orchard), 7 vin, 8 vout, 9 ironwoodActions.
 */
export function parseCompactTx(buf: Uint8Array): { txid: string; index: number; shape: CompactTxShape } {
  const m = decodeMessage(buf);
  const txidBytes = firstBytes(m, 2);
  if (!txidBytes || txidBytes.length !== 32) throw new Error("CompactTx without a 32-byte txid");
  let transparentOutputZat = 0;
  for (const out of m.get(8) ?? []) {
    if (out instanceof Uint8Array) transparentOutputZat += Number(firstVarint(decodeMessage(out), 1) ?? 0n);
  }
  const fee = firstVarint(m, 3);
  return {
    txid: protocolBytesToTxid(txidBytes),
    index: Number(firstVarint(m, 1) ?? 0n),
    shape: {
      transparentInputs: countField(m, 7),
      transparentOutputs: countField(m, 8),
      transparentOutputZat,
      saplingSpends: countField(m, 4),
      saplingOutputs: countField(m, 5),
      orchardActions: countField(m, 6),
      ironwoodActions: countField(m, 9),
      feeZat: fee === null ? null : Number(fee),
    },
  };
}

/** CompactBlock field 7 = repeated CompactTx vtx. */
export function parseCompactBlockTxs(buf: Uint8Array) {
  const m = decodeMessage(buf);
  return (m.get(7) ?? []).filter((v): v is Uint8Array => v instanceof Uint8Array).map(parseCompactTx);
}

/* ------------------------------------------------------------------------------------------ */
/* Transport + client                                                                          */
/* ------------------------------------------------------------------------------------------ */

export class LightwalletdNotFoundError extends Error {}

export interface LightwalletdTransport {
  unary(method: string, request: Uint8Array, timeoutMs: number): Promise<Uint8Array>;
}

type TransportFactory = (endpoint: string) => LightwalletdTransport;

const grpcClients = new Map<string, unknown>();

const grpcTransportFactory: TransportFactory = (endpoint) => ({
  async unary(method, request, timeoutMs) {
    const grpc = await import("@grpc/grpc-js");
    let client = grpcClients.get(endpoint) as InstanceType<typeof grpc.Client> | undefined;
    if (!client) {
      const credentials = process.env.ZCASH_LIGHTWALLETD_INSECURE === "true"
        ? grpc.credentials.createInsecure()
        : grpc.credentials.createSsl();
      client = new grpc.Client(endpoint, credentials);
      grpcClients.set(endpoint, client);
    }
    return new Promise<Uint8Array>((resolve, reject) => {
      client.makeUnaryRequest(
        `${SERVICE}/${method}`,
        (arg: Uint8Array) => Buffer.from(arg),
        (b: Buffer) => new Uint8Array(b),
        request,
        new grpc.Metadata(),
        { deadline: Date.now() + timeoutMs },
        (err, value) => {
          if (err) {
            const notFound = err.code === grpc.status.NOT_FOUND || /not found|no such mempool or blockchain transaction/i.test(err.details ?? err.message);
            reject(notFound ? new LightwalletdNotFoundError(err.details || err.message) : err);
          } else {
            resolve(value ?? new Uint8Array());
          }
        }
      );
    });
  },
});

let transportFactory: TransportFactory = grpcTransportFactory;
let customTransport = false;

/** Test hook: replace the network transport. Pass null to restore gRPC. */
export function setLightwalletdTransportFactory(factory: TransportFactory | null) {
  transportFactory = factory ?? grpcTransportFactory;
  customTransport = factory !== null;
}
export const hasCustomLightwalletdTransport = () => customTransport;

export interface LightwalletdInfo {
  chainName: string; // "main" | "test"
  blockHeight: number;
  consensusBranchId: string;
  vendor: string;
  version: string;
}

/** lightwalletd sentinel for "mined on a fork that is not the main chain". */
const FORK_HEIGHT = 0xffffffffffffffffn;

export class LightwalletdClient {
  private transport: LightwalletdTransport;

  constructor(public readonly endpoint: string, private readonly timeoutMs = 8000) {
    this.transport = transportFactory(endpoint);
  }

  async getInfo(): Promise<LightwalletdInfo> {
    const m = decodeMessage(await this.transport.unary("GetLightdInfo", new Uint8Array(), this.timeoutMs));
    return {
      version: firstString(m, 1),
      vendor: firstString(m, 2),
      chainName: firstString(m, 4),
      consensusBranchId: firstString(m, 6),
      blockHeight: Number(firstVarint(m, 7) ?? 0n),
    };
  }

  async getLatestHeight(): Promise<number> {
    const m = decodeMessage(await this.transport.unary("GetLatestBlock", new Uint8Array(), this.timeoutMs));
    return Number(firstVarint(m, 1) ?? 0n);
  }

  /** Returns null when the server does not know the transaction. */
  async getTransaction(txidHex: string): Promise<{ height: number | null; state: "MINED" | "MEMPOOL" | "FORK" } | null> {
    const request = encodeBytesField(3, txidToProtocolBytes(txidHex)); // TxFilter.hash
    try {
      const m = decodeMessage(await this.transport.unary("GetTransaction", request, this.timeoutMs));
      const height = firstVarint(m, 2) ?? 0n;
      if (height === 0n) return { height: null, state: "MEMPOOL" };
      if (height === FORK_HEIGHT) return { height: null, state: "FORK" };
      return { height: Number(height), state: "MINED" };
    } catch (err) {
      if (err instanceof LightwalletdNotFoundError) return null;
      throw err;
    }
  }

  async getBlockTxs(height: number) {
    const request = encodeVarintField(1, height); // BlockID.height
    return parseCompactBlockTxs(await this.transport.unary("GetBlock", request, this.timeoutMs));
  }

  /** CompactBlock field 5 = block header time (Unix seconds). Null if the node omits it. */
  async getBlockTime(height: number): Promise<number | null> {
    const request = encodeVarintField(1, height);
    const m = decodeMessage(await this.transport.unary("GetBlock", request, this.timeoutMs));
    const time = firstVarint(m, 5);
    return time && time > 0n ? Number(time) : null;
  }
}
