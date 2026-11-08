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
import type { PaybackResult } from "../problems/payback.ts";
import type { RulesReport } from "../rules/maryland.ts";
import type { Answer, JourneyAnswerResponse, JourneyQuestion, JourneyStartResponse, Opportunity } from "../journey/types.ts";

export type { OnboardingAnalysis, OnboardingProfile, DiscoveryResult, ImpactEstimate, ProblemKey, RecommendationInputResult, RulesReport, PaybackResult };
export type ProblemCard = DiscoveryResult["problems"][number];
export type { Answer, JourneyAnswerResponse, JourneyQuestion, JourneyStartResponse, Opportunity };

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
      listings?: OnboardingAnalysis["listings"] | null;
      assumptions?: Partial<Record<ProblemKey, Record<string, number>>>;
      includeHypotheses?: ProblemKey[];
      polish?: boolean;
    },
    signal?: AbortSignal,
  ) => call<{ discovery: DiscoveryResult; recommendationInput: RecommendationInputResult; rules: RulesReport }>("/api/problems/discover", { json: request }, signal),

  payback: (
    request: { industry: IndustryKey; items: { problemKey: ProblemKey; monthlyCost: number }[]; assumptions?: Partial<Record<ProblemKey, Record<string, number>>> },
    signal?: AbortSignal,
  ) => call<{ results: PaybackResult[]; note: string }>("/api/problems/payback", { json: request }, signal),

  impact: (request: { problemKey: ProblemKey; industry: IndustryKey; overrides?: Record<string, number> }, signal?: AbortSignal) =>
    call<{ problemKey: ProblemKey; impact: ImpactEstimate }>("/api/problems/impact", { json: request }, signal),
};

/** Formatting helpers shared by the starter components. */
/**
 * The simple owner journey (docs/JOURNEY_API.md). Keep `context` from the last response and send it back.
 *
 *   const { matches } = await api.search("frederick heating");
 *   let step = await journey.start(matches[0].placeId);             // what we learned + questions
 *   let result = await journey.answer(step.context, { budget: "up_to_100" });
 *   result = await journey.answer(result.context, { "impact.average_job_value": 400 });  // follow-ups
 *   if (result.recommendation.ready) await fetch("/api/recommend", { method: "POST", body: JSON.stringify(result.recommendation.request) });
 */
export const journey = {
  start: (placeId: string, pastedReviews?: string, signal?: AbortSignal) =>
    call<JourneyStartResponse>("/api/journey/start", { json: { placeId, ...(pastedReviews ? { pastedReviews } : {}) } }, signal),
  answer: (context: string, answers: Record<string, Answer>, signal?: AbortSignal) =>
    call<JourneyAnswerResponse>("/api/journey/answer", { json: { context, answers } }, signal),
  /** Whether a question should be shown, given the answers so far (handles `showIf`). */
  visible: (question: JourneyQuestion, answers: Record<string, Answer>) => {
    if (!question.showIf) return true;
    const a = answers[question.showIf.questionId];
    return Array.isArray(a) && a.some((x) => question.showIf!.includesAny.includes(x));
  },
};

export const fmt = {
  usd: (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }),
  percent: (share: number) => `${Math.round(share * 100)}%`,
  range: (r: { low: number; high: number }) => `${fmt.usd(r.low)}–${fmt.usd(r.high)}`,
};
