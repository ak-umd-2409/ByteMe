import { createHash } from "node:crypto";

/**
 * Small in-memory TTL cache with request de-duplication.
 *
 * Used for expensive external calls (Places, website fetches, LLM). It is per
 * server instance, which is fine for a prototype; swap in Supabase/Redis behind
 * the same interface for production (see docs/PARTS_2_3_API.md).
 */
export interface Cache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs: number): void;
  delete(key: string): void;
  clear(): void;
  size(): number;
}

export function createMemoryCache(maxEntries = 500): Cache {
  const store = new Map<string, { value: unknown; expires: number }>();
  return {
    get<T>(key: string): T | undefined {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (hit.expires <= Date.now()) {
        store.delete(key);
        return undefined;
      }
      // Refresh recency for simple LRU eviction.
      store.delete(key);
      store.set(key, hit);
      return hit.value as T;
    },
    set<T>(key: string, value: T, ttlMs: number) {
      if (ttlMs <= 0) return;
      store.delete(key);
      store.set(key, { value, expires: Date.now() + ttlMs });
      while (store.size > maxEntries) {
        const oldest = store.keys().next().value;
        if (oldest === undefined) break;
        store.delete(oldest);
      }
    },
    delete: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    size: () => store.size,
  };
}

/** Stable short hash for cache keys built from arbitrary inputs. */
export function hashKey(...parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Return a cached value or compute it once. Concurrent callers with the same
 * key share one in-flight promise. Failed computations are never cached.
 */
export async function cached<T>(
  cache: Cache,
  key: string,
  ttlMs: number,
  compute: () => Promise<T>,
): Promise<T> {
  const hit = cache.get<T>(key);
  if (hit !== undefined) return hit;
  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;
  const run = compute()
    .then((value) => {
      cache.set(key, value, ttlMs);
      return value;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}

/** Process-wide cache shared by route handlers. */
export const sharedCache: Cache = createMemoryCache(1_000);
