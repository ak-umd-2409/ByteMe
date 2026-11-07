/**
 * Typed browser client for the Parts 2 & 3 API. Zero dependencies.
 * Import types only from the backend, so no server code reaches the client bundle.
 *
 *   const found = await api.search("mike's heating", "Frederick, MD");
 *   const draft = await api.analyze({ placeId: found.matches[0].placeId, owner: { monthlyBudget: 200 } });
 *   const { profile } = await api.confirm({ profile: draft.profile, corrections: { business: { phone: "…" } } });
 *   const { discovery, recommendationInput } = await api.discover({ profile, reviews: draft.reviews, website: draft.website });
 *   if (recommendationInput.ok) await fetch("/api/recommend", { method: "POST", body: JSON.stringify(recommendationInput.request) });
 */
import type { AnalyzeRequest, OnboardingAnalysis } from "../business/onboarding.ts";
import type { ProfileCorrections } from "../business/profile.ts";
import type { BusinessMatch, IndustryKey, OnboardingProfile, PlaceDetails, ReviewAnalysis, WebsiteAnalysis } from "../business/types.ts";
import type { RecommendationInputResult } from "../problems/toRecommendation.ts";
import type { DiscoveryResult, ImpactEstimate, ProblemKey } from "../problems/types.ts";

export type { OnboardingAnalysis, OnboardingProfile, DiscoveryResult, ImpactEstimate, ProblemKey, RecommendationInputResult };
export type ProblemCard = DiscoveryResult["problems"][number];

export interface ApiErrorBody {
  error: { code: string; message: string; details?: string[] };
}

/** Thrown for any non-2xx response. `message` is safe to show to the owner. */
export class ApiError extends Error {
  status: number;
  code: string;
  details: string[];
  retryAfterSec: number | null;
  constructor(status: number, body: ApiErrorBody | null, retryAfter: string | null) {
    super(body?.error.message ?? "Something went wrong. Please try again.");
    this.status = status;
    this.code = body?.error.code ?? "network";
    this.details = body?.error.details ?? [];
    this.retryAfterSec = retryAfter ? Number(retryAfter) : null;
  }
}

type Mode = { places: "mock" | "google_places"; llm: "on" | "off" };

async function call<T>(path: string, init?: RequestInit & { json?: unknown }, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init?.json === undefined ? "GET" : "POST",
      headers: init?.json === undefined ? undefined : { "content-type": "application/json" },
      body: init?.json === undefined ? undefined : JSON.stringify(init.json),
      signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError(0, { error: { code: "network", message: "You seem to be offline. Check your connection and try again." } }, null);
  }
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) throw new ApiError(response.status, body as ApiErrorBody | null, response.headers.get("retry-after"));
  return body as T;
}

export const api = {
  search: (q: string, near?: string, signal?: AbortSignal) =>
    call<{ query: string; matches: BusinessMatch[]; mode: Mode; sampleData: boolean }>(
      `/api/business/search?${new URLSearchParams({ q, ...(near ? { near } : {}) })}`,
      undefined,
      signal,
    ),

  details: (placeId: string, signal?: AbortSignal) =>
    call<{ business: PlaceDetails; mode: Mode; sampleData: boolean }>(`/api/business/details?${new URLSearchParams({ placeId })}`, undefined, signal),

  analyze: (request: AnalyzeRequest, signal?: AbortSignal) => call<OnboardingAnalysis>("/api/onboarding/analyze", { json: request }, signal),

  confirm: (request: { profile: OnboardingProfile; corrections?: ProfileCorrections; confirm?: boolean }, signal?: AbortSignal) =>
    call<{ profile: OnboardingProfile; readyForRecommendations: boolean }>("/api/onboarding/confirm", { json: request }, signal),

  discover: (
    request: {
      profile: OnboardingProfile;
      reviews: ReviewAnalysis;
      website: WebsiteAnalysis | null;
      assumptions?: Partial<Record<ProblemKey, Record<string, number>>>;
      includeHypotheses?: ProblemKey[];
      polish?: boolean;
    },
    signal?: AbortSignal,
  ) => call<{ discovery: DiscoveryResult; recommendationInput: RecommendationInputResult }>("/api/problems/discover", { json: request }, signal),

  impact: (request: { problemKey: ProblemKey; industry: IndustryKey; overrides?: Record<string, number> }, signal?: AbortSignal) =>
    call<{ problemKey: ProblemKey; impact: ImpactEstimate }>("/api/problems/impact", { json: request }, signal),
};

/** Formatting helpers shared by the starter components. */
export const fmt = {
  usd: (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }),
  percent: (share: number) => `${Math.round(share * 100)}%`,
  range: (r: { low: number; high: number }) => `${fmt.usd(r.low)}–${fmt.usd(r.high)}`,
};
