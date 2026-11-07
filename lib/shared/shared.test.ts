import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cached, createMemoryCache, hashKey } from "./cache.ts";
import { loadConfig } from "./config.ts";
import { redact } from "./logger.ts";
import { createRateLimiter } from "./rateLimit.ts";
import { isPrivateAddress, normalizeWebsiteUrl, robotsAllows, safeFetch, SafeFetchError } from "./safeFetch.ts";
import { parseJsonLoose, v } from "./validate.ts";
import { fakeFetch, publicResolve } from "../testing/fakes.ts";

describe("validate", () => {
  const schema = v.object({ name: v.string({ min: 1, max: 5 }), n: v.optional(v.number({ min: 0, max: 10 })) });

  it("accepts valid input", () => {
    assert.deepEqual(schema.parse({ name: "abc" }), { ok: true, value: { name: "abc" } });
  });

  it("rejects unknown fields, wrong types and out-of-range numbers with paths", () => {
    const result = schema.parse({ name: "toolongname", n: 11, extra: 1 });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some((e) => e.startsWith("name")));
      assert.ok(result.errors.some((e) => e.startsWith("n")));
      assert.ok(result.errors.some((e) => e.includes("extra")));
    }
  });

  it("rejects NaN and Infinity", () => {
    assert.equal(v.number().parse(Number.NaN).ok, false);
    assert.equal(v.number().parse(Number.POSITIVE_INFINITY).ok, false);
  });

  it("parses fenced JSON and returns null for garbage", () => {
    assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
    assert.equal(parseJsonLoose("Sure! Here you go: {not json"), null);
    assert.equal(parseJsonLoose(null), null);
  });
});

describe("cache", () => {
  it("dedupes concurrent computations and expires entries", async () => {
    const cache = createMemoryCache(10);
    let runs = 0;
    const compute = async () => {
      runs += 1;
      return runs;
    };
    const [a, b] = await Promise.all([cached(cache, "k", 60_000, compute), cached(cache, "k", 60_000, compute)]);
    assert.equal(a, 1);
    assert.equal(b, 1);
    assert.equal(runs, 1);
    assert.equal(await cached(cache, "short", -1, compute), 2);
    assert.equal(await cached(cache, "short", -1, compute), 3, "expired entries are recomputed");
  });

  it("does not cache failures", async () => {
    const cache = createMemoryCache(10);
    await assert.rejects(cached(cache, "x", 60_000, async () => Promise.reject(new Error("boom"))));
    assert.equal(await cached(cache, "x", 60_000, async () => "ok"), "ok");
  });

  it("hashKey is stable and does not leak inputs", () => {
    assert.equal(hashKey("a", 1), hashKey("a", 1));
    assert.notEqual(hashKey("a", 1), hashKey("a", 2));
    assert.ok(!hashKey("secret-value").includes("secret"));
  });
});

describe("config and logging", () => {
  it("treats missing keys as mock mode and blank keys as missing", () => {
    const config = loadConfig({ GOOGLE_PLACES_API_KEY: "  ", LLM_MAX_CALLS_PER_HOUR: "nope" });
    assert.equal(config.googlePlacesApiKey, null);
    assert.equal(config.openRouterApiKey, null);
    assert.equal(config.llmMaxCallsPerHour, 200);
  });

  it("redacts secrets from log fields", () => {
    const out = redact({ apiKey: "sk-123", nested: { authorization: "Bearer x" }, ok: "fine" });
    assert.equal(JSON.stringify(out).includes("sk-123"), false);
    assert.equal(JSON.stringify(out).includes("Bearer x"), false);
    assert.equal((out as { ok: string }).ok, "fine");
  });
});

describe("rate limiter", () => {
  it("allows a burst then blocks with a retry hint", () => {
    const check = createRateLimiter({ capacity: 2, refillPerMinute: 1 });
    assert.equal(check("ip").allowed, true);
    assert.equal(check("ip").allowed, true);
    const blocked = check("ip");
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSec >= 1);
    assert.equal(check("other-ip").allowed, true, "buckets are per client");
  });
});

describe("safeFetch", () => {
  it("recognises private, loopback and metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254", "::1", "fd00::1", "0.0.0.0"]) {
      assert.equal(isPrivateAddress(ip), true, ip);
    }
    assert.equal(isPrivateAddress("93.184.216.34"), false);
  });

  it("normalises bare domains and rejects non-web schemes", () => {
    assert.equal(normalizeWebsiteUrl("mikes-heating.com")?.toString(), "https://mikes-heating.com/");
    assert.equal(normalizeWebsiteUrl("javascript:alert(1)"), null);
    assert.equal(normalizeWebsiteUrl("file:///etc/passwd"), null);
  });

  it("blocks hosts that resolve to private addresses", async () => {
    const { impl, calls } = fakeFetch({});
    await assert.rejects(
      safeFetch("https://internal.test/", { fetchImpl: impl, resolveHost: async () => ["10.1.2.3"] }),
      (error: unknown) => error instanceof SafeFetchError && error.code === "blocked_host",
    );
    assert.equal(calls.length, 0, "no request is sent to a blocked host");
  });

  it("re-checks every redirect hop", async () => {
    const { impl } = fakeFetch({
      "https://shop.test/": { status: 302, body: "", headers: { location: "http://localhost/admin" } },
    });
    await assert.rejects(
      safeFetch("https://shop.test/", {
        fetchImpl: impl,
        resolveHost: async (host) => (host === "localhost" ? ["127.0.0.1"] : ["93.184.216.34"]),
      }),
      (error: unknown) => error instanceof SafeFetchError && error.code === "blocked_host",
    );
  });

  it("refuses oversized responses", async () => {
    const { impl } = fakeFetch({ "https://big.test/": { body: "x".repeat(5_000) } });
    await assert.rejects(
      safeFetch("https://big.test/", { fetchImpl: impl, resolveHost: publicResolve, maxBytes: 1_000 }),
      (error: unknown) => error instanceof SafeFetchError && error.code === "too_large",
    );
  });

  it("honours robots.txt for our agent and for *", () => {
    const robots = "User-agent: *\nDisallow: /private\n\nUser-agent: mainstreetai\nDisallow: /book\n";
    assert.equal(robotsAllows(robots, "/book/now"), false);
    assert.equal(robotsAllows(robots, "/services"), true);
    assert.equal(robotsAllows("User-agent: *\nDisallow: /\n", "/"), false);
    assert.equal(robotsAllows("", "/anything"), true);
  });
});
