/**
 * Durable key-value storage (Upstash Redis over REST), used for things that should
 * survive a server restart: AI answers and AI spend. Same env vars as the discovery
 * queue: KV_REST_API_URL + KV_REST_API_TOKEN (or the UPSTASH_REDIS_REST_* pair).
 * Returns null when not configured; callers then fall back to memory.
 */
export interface Kv {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  incrByFloat(key: string, by: number): Promise<number>;
}

export function redisKv(url: string, token: string, fetchImpl: typeof fetch = fetch): Kv {
  const call = async (command: (string | number)[]) => {
    const res = await fetchImpl(url.replace(/\/$/, ""), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(command),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Storage error (${res.status})`);
    const body = (await res.json()) as { result?: unknown; error?: string };
    if (body.error) throw new Error(`Storage error: ${body.error}`);
    return body.result;
  };
  return {
    get: async (key) => {
      const r = await call(["GET", key]);
      return typeof r === "string" ? r : null;
    },
    set: async (key, value, ttlSeconds) => {
      await call(ttlSeconds ? ["SET", key, value, "EX", Math.max(1, Math.round(ttlSeconds))] : ["SET", key, value]);
    },
    incrByFloat: async (key, by) => Number(await call(["INCRBYFLOAT", key, by])),
  };
}

const holder = globalThis as typeof globalThis & { __mainstreetKv?: Kv | null };

/** The shared durable store for this deployment, or null when none is configured (tests: always null). */
export function getKv(env: NodeJS.ProcessEnv = process.env): Kv | null {
  if (env.NODE_ENV === "test") return null;
  if (holder.__mainstreetKv !== undefined) return holder.__mainstreetKv;
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  holder.__mainstreetKv = url && token ? redisKv(url, token) : null;
  return holder.__mainstreetKv;
}
