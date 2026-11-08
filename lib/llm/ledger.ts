/**
 * AI spend ledger: adds up what OpenRouter reports each call cost (`usage.cost`, US dollars)
 * and stops new calls once the cap is reached (LLM_BUDGET_USD, default $20 of the $25 key).
 *
 * With Upstash connected the total is shared by every server instance and survives restarts.
 * Without it, each instance counts on its own (the hourly call cap still applies).
 */
import { log } from "../shared/logger.ts";
import { getKv, type Kv } from "../shared/kv.ts";

const KEY = "mainstreet:llm:spent_usd";

export interface Ledger {
  kind: "redis" | "memory";
  /** Dollars spent so far (cached for a few seconds to avoid a lookup per call). */
  spent(): Promise<number>;
  add(usd: number, task: string): Promise<void>;
}

export function memoryLedger(start = 0): Ledger {
  let total = start;
  return {
    kind: "memory",
    spent: async () => total,
    add: async (usd) => {
      total += usd;
    },
  };
}

export function kvLedger(kv: Kv, ttlMs = 15_000): Ledger {
  let cachedValue = 0;
  let cachedAt = 0;
  return {
    kind: "redis",
    async spent() {
      if (Date.now() - cachedAt < ttlMs) return cachedValue;
      try {
        cachedValue = Number((await kv.get(KEY)) ?? 0) || 0;
        cachedAt = Date.now();
      } catch (error) {
        log.warn("llm.ledger_read_failed", { error });
      }
      return cachedValue;
    },
    async add(usd, task) {
      if (!(usd > 0)) return;
      cachedValue += usd;
      try {
        cachedValue = await kv.incrByFloat(KEY, usd);
        cachedAt = Date.now();
      } catch (error) {
        log.warn("llm.ledger_write_failed", { task, error });
      }
    },
  };
}

const holder = globalThis as typeof globalThis & { __mainstreetLedger?: Ledger };

export function getLedger(): Ledger {
  if (holder.__mainstreetLedger) return holder.__mainstreetLedger;
  const kv = getKv();
  holder.__mainstreetLedger = kv ? kvLedger(kv) : memoryLedger();
  return holder.__mainstreetLedger;
}
