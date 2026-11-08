import { cached, hashKey, sharedCache, type Cache } from "../shared/cache.ts";
import { loadConfig, type AppConfig } from "../shared/config.ts";
import { getKv, type Kv } from "../shared/kv.ts";
import { log } from "../shared/logger.ts";
import { getLedger, type Ledger } from "./ledger.ts";
import { parseJsonLoose, type Schema } from "../shared/validate.ts";
import type { FetchLike } from "../shared/safeFetch.ts";

/**
 * LLM access, used only for classification, extraction and wording.
 *
 * The app never depends on it: when there is no key, the budget is spent, the
 * call fails, or the output does not match its schema, `llmJson` returns
 * `{ ok: false }` and callers continue with rule-based results.
 */
export interface LlmRequest {
  /** Short task name, used for logs and cache keys. */
  task: string;
  system: string;
  user: string;
  maxTokens?: number;
}

export interface LlmProvider {
  readonly name: string;
  /** Raw model text, or null when unavailable. */
  complete(request: LlmRequest): Promise<string | null>;
}

export type LlmResult<T> =
  | { ok: true; value: T; provider: string }
  | { ok: false; reason: "disabled" | "unavailable" | "malformed" | "invalid" | "budget" };

export const disabledProvider: LlmProvider = {
  name: "disabled",
  complete: async () => null,
};

/** Hourly call budget, shared by every task in the process. */
export function createBudget(maxPerHour: number) {
  let windowStart = Date.now();
  let used = 0;
  return {
    take(now = Date.now()): boolean {
      if (now - windowStart >= 3_600_000) {
        windowStart = now;
        used = 0;
      }
      if (used >= maxPerHour) return false;
      used += 1;
      return true;
    },
    remaining: () => Math.max(0, maxPerHour - used),
  };
}

export function createOpenRouterProvider(
  config: Pick<AppConfig, "openRouterApiKey" | "openRouterModel" | "llmMaxCallsPerHour"> & { llmBudgetUsd?: number },
  fetchImpl: FetchLike = fetch,
  ledger: Ledger = getLedger(),
): LlmProvider {
  const budget = createBudget(config.llmMaxCallsPerHour);
  const capUsd = config.llmBudgetUsd ?? 20;
  return {
    name: `openrouter:${config.openRouterModel}`,
    async complete(request) {
      if (!config.openRouterApiKey) return null;
      // Dollar cap across the whole key (shared when Upstash is connected).
      const spent = await ledger.spent();
      if (spent >= capUsd) {
        log.warn("llm.spend_cap_reached", { task: request.task, spent, capUsd });
        return null;
      }
      if (!budget.take()) {
        log.warn("llm.budget_exhausted", { task: request.task });
        return null;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      try {
        const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${config.openRouterApiKey}`,
            "content-type": "application/json",
            "x-title": "MainStreet AI",
          },
          body: JSON.stringify({
            model: config.openRouterModel,
            temperature: 0,
            max_tokens: request.maxTokens ?? 900,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: request.system },
              { role: "user", content: request.user },
            ],
          }),
        });
        if (!response.ok) {
          log.warn("llm.http_error", { task: request.task, status: response.status });
          return null;
        }
        const data = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
          usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
        };
        // OpenRouter reports what each call cost (US dollars) in usage.cost.
        const cost = typeof data.usage?.cost === "number" ? data.usage.cost : 0;
        await ledger.add(cost, request.task);
        log.info("llm.call", { task: request.task, model: config.openRouterModel, cost, inTokens: data.usage?.prompt_tokens, outTokens: data.usage?.completion_tokens });
        return data.choices?.[0]?.message?.content ?? null;
      } catch (error) {
        log.warn("llm.request_failed", { task: request.task, error });
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

let defaultProvider: LlmProvider | null = null;

/** The provider configured from the environment (OpenRouter or disabled). */
export function getLlmProvider(config: AppConfig = loadConfig()): LlmProvider {
  if (config.llmDisabled || !config.openRouterApiKey) return disabledProvider;
  defaultProvider ??= createOpenRouterProvider(config);
  return defaultProvider;
}

/**
 * Ask for JSON, validate it against `schema`, cache successful answers.
 * Malformed or schema-invalid output is discarded, never "repaired".
 */
export async function llmJson<T>(
  provider: LlmProvider,
  schema: Schema<T>,
  request: LlmRequest,
  opts: { cache?: Cache; ttlMs?: number; kv?: Kv | null } = {},
): Promise<LlmResult<T>> {
  if (provider === disabledProvider) return { ok: false, reason: "disabled" };
  const cache = opts.cache ?? sharedCache;
  const kv = opts.kv === undefined ? getKv() : opts.kv;
  const key = `llm:${request.task}:${provider.name}:${hashKey(request.system, request.user)}`;
  const ttlMs = opts.ttlMs ?? 24 * 3_600_000;
  try {
    return await cached(cache, key, ttlMs, async () => {
      // A saved answer (Upstash) survives restarts, so the same page or reviews are never paid for twice.
      if (kv) {
        try {
          const saved = await kv.get(`mainstreet:${key}`);
          if (saved) {
            const parsed = schema.parse(JSON.parse(saved));
            if (parsed.ok) return { ok: true as const, value: parsed.value, provider: provider.name };
          }
        } catch (error) {
          log.warn("llm.saved_cache_read_failed", { task: request.task, error });
        }
      }
      const text = await provider.complete(request);
      if (text === null) throw new LlmSkip("unavailable");
      const json = parseJsonLoose(text);
      if (json === null) throw new LlmSkip("malformed");
      const parsed = schema.parse(json);
      if (!parsed.ok) {
        log.warn("llm.schema_rejected", { task: request.task, errors: parsed.errors.slice(0, 5) });
        throw new LlmSkip("invalid");
      }
      if (kv) {
        // Keep answers a week: long enough for a hackathon, short enough to pick up changed pages.
        kv.set(`mainstreet:${key}`, JSON.stringify(parsed.value), Math.max(ttlMs, 7 * 86_400_000) / 1000).catch((error) =>
          log.warn("llm.saved_cache_write_failed", { task: request.task, error }),
        );
      }
      return { ok: true as const, value: parsed.value, provider: provider.name };
    });
  } catch (error) {
    if (error instanceof LlmSkip) return { ok: false, reason: error.reason };
    log.warn("llm.unexpected_error", { task: request.task, error });
    return { ok: false, reason: "unavailable" };
  }
}

class LlmSkip extends Error {
  reason: "unavailable" | "malformed" | "invalid";
  constructor(reason: LlmSkip["reason"]) {
    super(reason);
    this.reason = reason;
  }
}
