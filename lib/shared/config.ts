/**
 * Environment-based configuration for Parts 2 and 3.
 *
 * Every external service is optional. When a key is missing the app falls back
 * to clearly labelled mock providers (Places) or rule-based logic (LLM), so the
 * product still works end to end on a laptop with no secrets.
 */
export interface AppConfig {
  /** Google Places API (New) key. Null means "use the mock Places provider". */
  googlePlacesApiKey: string | null;
  /** SerpApi key. Used only to fill in Google review text when Google's own API sends none. */
  serpApiKey: string | null;
  /** OpenRouter key. Null means "LLM disabled; rules only". */
  openRouterApiKey: string | null;
  openRouterModel: string;
  /** Force rules-only mode even when a key exists (demo safety switch). */
  llmDisabled: boolean;
  /** Stop all AI calls once this many US dollars have been spent (OpenRouter's reported cost). */
  llmBudgetUsd: number;
  /** Hard cap on LLM calls per process per hour, to protect the $25 budget. */
  llmMaxCallsPerHour: number;
  httpTimeoutMs: number;
  /** Max website pages fetched per analysis. */
  websiteMaxPages: number;
  userAgent: string;
  /** Also offer the fictional sample businesses in search (DEMO_SAMPLE_BUSINESSES=1). */
  sampleBusinesses: boolean;
  /** Signs the journey context token (JOURNEY_SECRET). Null = unsigned, still validated on the way back in. */
  journeySecret: string | null;
}

type Env = Record<string, string | undefined>;

const clean = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const intOr = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

export function loadConfig(env: Env = process.env): AppConfig {
  return {
    googlePlacesApiKey: clean(env.GOOGLE_PLACES_API_KEY),
    serpApiKey: clean(env.SERPAPI_KEY) ?? clean(env.SERPAPI_API_KEY),
    openRouterApiKey: clean(env.OPENROUTER_API_KEY),
    openRouterModel: clean(env.OPENROUTER_MODEL) ?? "openai/gpt-4o-mini",
    llmDisabled: env.LLM_DISABLED === "1" || env.LLM_DISABLED === "true",
    llmMaxCallsPerHour: intOr(env.LLM_MAX_CALLS_PER_HOUR, 200, 0, 10_000),
    llmBudgetUsd: Math.min(Math.max(Number(env.LLM_BUDGET_USD) || 20, 0), 25),
    httpTimeoutMs: intOr(env.HTTP_TIMEOUT_MS, 8_000, 1_000, 30_000),
    websiteMaxPages: intOr(env.WEBSITE_MAX_PAGES, 6, 1, 15),
    sampleBusinesses: env.DEMO_SAMPLE_BUSINESSES === "1" || env.DEMO_SAMPLE_BUSINESSES === "true",
    journeySecret: clean(env.JOURNEY_SECRET),
    userAgent:
      clean(env.SCANNER_USER_AGENT) ??
      "MainStreetAI-Scanner/0.1 (+University of Maryland AI for Small Business prototype)",
  };
}
