/**
 * In-memory token bucket rate limiter, keyed by client (usually IP).
 * Protects the Places quota and the LLM budget when judges hit the live app.
 */
export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

interface Bucket {
  tokens: number;
  updated: number;
}

export function createRateLimiter(opts: { capacity: number; refillPerMinute: number; maxKeys?: number }) {
  const buckets = new Map<string, Bucket>();
  const perMs = opts.refillPerMinute / 60_000;
  const maxKeys = opts.maxKeys ?? 5_000;
  return function check(key: string, now = Date.now()): RateLimitResult {
    const bucket = buckets.get(key) ?? { tokens: opts.capacity, updated: now };
    bucket.tokens = Math.min(opts.capacity, bucket.tokens + (now - bucket.updated) * perMs);
    bucket.updated = now;
    buckets.delete(key);
    buckets.set(key, bucket);
    if (buckets.size > maxKeys) {
      const oldest = buckets.keys().next().value;
      if (oldest !== undefined) buckets.delete(oldest);
    }
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true, retryAfterSec: 0 };
    }
    return { allowed: false, retryAfterSec: Math.ceil((1 - bucket.tokens) / perMs / 1000) };
  };
}

/** Best-effort client key from proxy headers (Vercel sets x-forwarded-for). */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "anonymous";
}
