import mongoose from "mongoose";

/**
 * Cached Mongoose connection shared by every route handler in the process (hot reloads and
 * serverless invocations reuse it).
 */

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  maintained?: boolean;
}

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache || { conn: null, promise: null };

if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

/**
 * Thrown when MONGODB_URI is configured but the database cannot be reached. Routes map it to
 * HTTP 503. Falling back to a per-process memory store instead would split state (a campaign
 * written to MongoDB, its claim link looked up in memory), so that only happens when the
 * operator opts in with ZECCLAIM_ALLOW_MEMORY_FALLBACK=true.
 */
export class DatabaseUnavailableError extends Error {
  constructor(message = "Database unavailable. Please retry shortly.") {
    super(message);
    this.name = "DatabaseUnavailableError";
  }
}

function unavailable(): null {
  if (process.env.ZECCLAIM_ALLOW_MEMORY_FALLBACK === "true") {
    console.warn("MongoDB unreachable: serving from the in-memory store (ZECCLAIM_ALLOW_MEMORY_FALLBACK=true).");
    return null;
  }
  throw new DatabaseUnavailableError();
}

/**
 * One-time maintenance per process:
 * - drops the 7-day TTL index (`createdAt_1`) that early builds put on claimslots, which
 *   silently deleted claim links and ledger rows;
 * - builds the indexes declared in the models.
 * Failures are logged, never fatal.
 */
async function maintain(conn: typeof mongoose) {
  if (cached.maintained) return;
  cached.maintained = true;
  try {
    const slots = conn.connection.db?.collection("claimslots");
    if (slots) {
      const indexes = await slots.indexes().catch(() => []);
      for (const index of indexes) {
        if (index.name && typeof index.expireAfterSeconds === "number") {
          await slots.dropIndex(index.name);
          console.warn(`Dropped TTL index ${index.name} on claimslots (claim slots are permanent ledger rows).`);
        }
      }
    }
    const { Campaign, ClaimSlot, VoucherCard, AuditEvent, ScrubAttestation, Payout, RateLimitBucket } = await import(
      "@/lib/db/models"
    );
    await Promise.all(
      [Campaign, ClaimSlot, VoucherCard, AuditEvent, ScrubAttestation, Payout, RateLimitBucket].map((m) =>
        m.createIndexes().catch((err: Error) => console.warn(`Index build for ${m.modelName} failed: ${err.message}`))
      )
    );
  } catch (err) {
    console.warn("MongoDB maintenance skipped:", err instanceof Error ? err.message : err);
  }
}

/**
 * Returns the Mongoose connection, or null when no MONGODB_URI is configured (in-memory store).
 * If MONGODB_URI is set but unreachable it throws DatabaseUnavailableError (HTTP 503), unless
 * ZECCLAIM_ALLOW_MEMORY_FALLBACK=true.
 */
export async function connectToDatabase(): Promise<typeof mongoose | null> {
  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    return null;
  }

  if (cached.conn && cached.conn.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts: mongoose.ConnectOptions = {
      bufferCommands: false,
      // Atlas needs SRV lookup + TLS + replica-set discovery; 2.5 s was too short on cold starts.
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
      maxPoolSize: 10,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).catch((err) => {
      cached.promise = null;
      console.warn("MongoDB connection could not be established:", err.message);
      return null as unknown as typeof mongoose;
    });
  }

  try {
    const conn = await cached.promise;
    if (conn && conn.connection && conn.connection.readyState === 1) {
      cached.conn = conn;
      await maintain(conn);
      return cached.conn;
    }
    cached.conn = null;
    cached.promise = null;
    return unavailable();
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) throw err;
    cached.promise = null;
    cached.conn = null;
    return unavailable();
  }
}
