import { describe, it, expect, afterEach, vi } from "vitest";
import mongoose from "mongoose";
import { connectToDatabase, DatabaseUnavailableError } from "@/lib/db/mongodb";
import { errorResponse } from "@/lib/http";

const original = { uri: process.env.MONGODB_URI, env: process.env.NODE_ENV, fallback: process.env.ZECCLAIM_ALLOW_MEMORY_FALLBACK };

afterEach(() => {
  vi.restoreAllMocks();
  process.env.MONGODB_URI = original.uri;
  if (original.uri === undefined) delete process.env.MONGODB_URI;
  vi.stubEnv("NODE_ENV", original.env ?? "test");
  if (original.fallback === undefined) delete process.env.ZECCLAIM_ALLOW_MEMORY_FALLBACK;
  global.mongooseCache = { conn: null, promise: null };
});

describe("database fail-closed policy", () => {
  it("uses the in-memory store when no MONGODB_URI is configured", async () => {
    delete process.env.MONGODB_URI;
    expect(await connectToDatabase()).toBeNull();
  });

  it("throws DatabaseUnavailableError in production when MONGODB_URI is set but unreachable", async () => {
    process.env.MONGODB_URI = "mongodb://unreachable.invalid:27017/zecclaim";
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(mongoose, "connect").mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(connectToDatabase()).rejects.toBeInstanceOf(DatabaseUnavailableError);
    const res = errorResponse(new DatabaseUnavailableError(), "x");
    expect(res.status).toBe(503);
  });

  it("also fails closed in development (no split state between MongoDB and memory)", async () => {
    process.env.MONGODB_URI = "mongodb://unreachable.invalid:27017/zecclaim";
    vi.spyOn(mongoose, "connect").mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubEnv("NODE_ENV", "development");
    await expect(connectToDatabase()).rejects.toBeInstanceOf(DatabaseUnavailableError);
  });

  it("falls back to memory only when explicitly allowed", async () => {
    process.env.MONGODB_URI = "mongodb://unreachable.invalid:27017/zecclaim";
    vi.spyOn(mongoose, "connect").mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubEnv("NODE_ENV", "production");
    process.env.ZECCLAIM_ALLOW_MEMORY_FALLBACK = "true";
    expect(await connectToDatabase()).toBeNull();
  });
});
