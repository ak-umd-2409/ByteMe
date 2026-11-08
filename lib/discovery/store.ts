/**
 * Where discovery keeps its queue and decisions.
 *
 * - Upstash Redis (REST) when KV_REST_API_URL + KV_REST_API_TOKEN are set (Vercel
 *   adds these when you connect "Upstash for Redis" from the Marketplace), or the
 *   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN pair.
 * - A local JSON file (.data/discovery.json) in development.
 * - Memory in tests, and as a last resort (resets when the server restarts; the
 *   admin page says so).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { emptyState, type DiscoveryState } from "./types.ts";

export interface DiscoveryStore {
  kind: "redis" | "file" | "memory";
  /** Plain words for the admin page. */
  describe: string;
  load(): Promise<DiscoveryState>;
  save(state: DiscoveryState): Promise<void>;
}

const KEY = "mainstreet:discovery:v1";

function valid(x: unknown): x is DiscoveryState {
  const s = x as DiscoveryState;
  return Boolean(s) && s.version === 1 && Array.isArray(s.candidates) && typeof s.records === "object" && Array.isArray(s.runs);
}

export function memoryStore(initial: DiscoveryState = emptyState()): DiscoveryStore {
  let state = structuredClone(initial);
  return {
    kind: "memory",
    describe: "Saved in memory only: decisions are lost when the server restarts. Connect Upstash Redis to keep them.",
    load: async () => structuredClone(state),
    save: async (next) => {
      state = structuredClone(next);
    },
  };
}

export function fileStore(path: string): DiscoveryStore {
  return {
    kind: "file",
    describe: `Saved in ${path} (local development).`,
    load: async () => {
      if (!existsSync(path)) return emptyState();
      try {
        const parsed = JSON.parse(readFileSync(path, "utf8"));
        return valid(parsed) ? parsed : emptyState();
      } catch {
        return emptyState();
      }
    },
    save: async (state) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
    },
  };
}

export function redisStore(url: string, token: string, fetchImpl: typeof fetch = fetch): DiscoveryStore {
  const call = async (command: unknown[]) => {
    const res = await fetchImpl(url.replace(/\/$/, ""), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(command),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Storage error (${res.status})`);
    return (await res.json()) as { result?: unknown; error?: string };
  };
  return {
    kind: "redis",
    describe: "Saved in Upstash Redis.",
    load: async () => {
      const { result, error } = await call(["GET", KEY]);
      if (error) throw new Error(`Storage error: ${error}`);
      if (typeof result !== "string") return emptyState();
      try {
        const parsed = JSON.parse(result);
        return valid(parsed) ? parsed : emptyState();
      } catch {
        return emptyState();
      }
    },
    save: async (state) => {
      const { error } = await call(["SET", KEY, JSON.stringify(state)]);
      if (error) throw new Error(`Storage error: ${error}`);
    },
  };
}

// One store per server process. Kept on globalThis because Next.js bundles each
// route and page separately, and a memory store must be shared between them.
const holder = globalThis as typeof globalThis & { __mainstreetDiscoveryStore?: DiscoveryStore };

/** The store for this deployment, chosen from the environment. */
export function getStore(env: NodeJS.ProcessEnv = process.env): DiscoveryStore {
  if (holder.__mainstreetDiscoveryStore) return holder.__mainstreetDiscoveryStore;
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  let store: DiscoveryStore;
  if (url && token) store = redisStore(url, token);
  else if (env.NODE_ENV !== "production" && env.NODE_ENV !== "test") store = fileStore(".data/discovery.json");
  else store = memoryStore();
  holder.__mainstreetDiscoveryStore = store;
  return store;
}
