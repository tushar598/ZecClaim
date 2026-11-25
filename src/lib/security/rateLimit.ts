import type { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { RateLimitBucket } from "@/lib/db/models";

/**
 * Fixed-window rate limiter for public endpoints (claims, ACKs, disputes, campaign creation,
 * chain lookups).
 *
 * With MongoDB configured the counters live in the `ratelimitbuckets` collection (atomic $inc,
 * TTL-expired), so every serverless instance shares them. Without a database they are kept in
 * process memory, which is only adequate for a single local instance.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInMs: number;
}

const memoryBuckets = new Map<string, { count: number; expiresAt: number }>();

function windowFor(key: string, windowMs: number, now: number) {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  return { bucketKey: `${key}@${windowStart}`, expiresAt: windowStart + windowMs };
}

function memoryHit(bucketKey: string, expiresAt: number, now: number): number {
  if (memoryBuckets.size > 10_000) {
    for (const [k, v] of memoryBuckets) if (v.expiresAt <= now) memoryBuckets.delete(k);
  }
  const entry = memoryBuckets.get(bucketKey);
  if (!entry || entry.expiresAt <= now) {
    memoryBuckets.set(bucketKey, { count: 1, expiresAt });
    return 1;
  }
  entry.count++;
  return entry.count;
}

export async function checkRateLimit(key: string, limit = 20, windowMs = 60_000): Promise<RateLimitResult> {
  const now = Date.now();
  const { bucketKey, expiresAt } = windowFor(key, windowMs, now);
  let count: number;

  const db = await connectToDatabase();
  if (db) {
    const bucket = await RateLimitBucket.findOneAndUpdate(
      { key: bucketKey },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(expiresAt) } },
      { upsert: true, new: true }
    ).lean();
    count = bucket?.count ?? 1;
  } else {
    count = memoryHit(bucketKey, expiresAt, now);
  }

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetInMs: Math.max(0, expiresAt - now),
  };
}

/** Clears in-memory counters (tests only; shared Mongo counters expire on their own). */
export function resetRateLimit() {
  memoryBuckets.clear();
}

/**
 * Client IP for rate-limit keys. Prefers the platform-set `x-real-ip` (Vercel, most proxies),
 * then the first `x-forwarded-for` hop.
 */
export function clientIp(req: NextRequest | Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
}

export function tooManyRequests(message: string, result: RateLimitResult) {
  return Response.json(
    { success: false, error: message, retryAfterSeconds: Math.ceil(result.resetInMs / 1000) },
    { status: 429, headers: { "Retry-After": String(Math.ceil(result.resetInMs / 1000)) } }
  );
}
