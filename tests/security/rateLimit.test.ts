import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { checkRateLimit, clientIp, resetRateLimit } from "@/lib/security/rateLimit";

delete process.env.MONGODB_URI;

describe("fixed-window rate limiter (memory backend)", () => {
  beforeEach(() => resetRateLimit());

  it("allows `limit` hits per window, then refuses with the time left", async () => {
    for (let i = 0; i < 3; i++) expect((await checkRateLimit("t:a", 3, 60_000)).allowed).toBe(true);
    const blocked = await checkRateLimit("t:a", 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.resetInMs).toBeGreaterThan(0);
    expect((await checkRateLimit("t:b", 3, 60_000)).allowed).toBe(true);
  });

  it("prefers the platform x-real-ip header over x-forwarded-for", () => {
    const r = new NextRequest("http://localhost/x", { headers: { "x-real-ip": "203.0.113.9", "x-forwarded-for": "1.1.1.1, 2.2.2.2" } });
    expect(clientIp(r)).toBe("203.0.113.9");
    const f = new NextRequest("http://localhost/x", { headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" } });
    expect(clientIp(f)).toBe("1.1.1.1");
  });
});
