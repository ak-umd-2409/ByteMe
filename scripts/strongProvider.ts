/**
 * The stronger AI model, used only by the catalog scripts (card-filler and
 * Safety Check). Everything else in the app keeps the cheap default model.
 * Lives here, not in lib/shared/config.ts, so that shared file is untouched.
 *
 *   OPENROUTER_STRONG_MODEL  model id; falls back to OPENROUTER_MODEL
 *   CATALOG_MAX_CALLS        hard cap on AI calls per run (default 600)
 */
import { createOpenRouterProvider, disabledProvider, type LlmProvider } from "../lib/llm/client.ts";
import { loadConfig } from "../lib/shared/config.ts";

export interface CountingProvider {
  provider: LlmProvider;
  /** AI calls actually sent this run (cached answers don't count). */
  calls: () => number;
  model: string;
}

export function strongProvider(env: Record<string, string | undefined> = process.env): CountingProvider {
  const config = loadConfig(env);
  const model = env.OPENROUTER_STRONG_MODEL?.trim() || config.openRouterModel;
  const maxCalls = Number.parseInt(env.CATALOG_MAX_CALLS ?? "", 10);
  if (config.llmDisabled || !config.openRouterApiKey) return { provider: disabledProvider, calls: () => 0, model: "none (AI off)" };
  const inner = createOpenRouterProvider({
    openRouterApiKey: config.openRouterApiKey,
    openRouterModel: model,
    llmMaxCallsPerHour: Number.isFinite(maxCalls) && maxCalls >= 0 ? maxCalls : 600,
  });
  let calls = 0;
  const provider: LlmProvider = {
    name: inner.name,
    complete(request) {
      calls += 1;
      return inner.complete(request);
    },
  };
  return { provider, calls: () => calls, model };
}
