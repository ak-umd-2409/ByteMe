import { industryInfo } from "../business/industry.ts";
import { analyzeBusiness, OnboardingError, type OnboardingDeps } from "../business/onboarding.ts";
import { getPlacesProvider, PlacesError, type PlacesProvider } from "../business/places.ts";
import { applyCorrections, type ProfileCorrections } from "../business/profile.ts";
import type { ListingsCheck } from "../business/listings.ts";
import type { OnboardingProfile, ReviewAnalysis, WebsiteAnalysis } from "../business/types.ts";
import { PUBLIC_SNAPSHOTS } from "../../data/real/index.ts";
import { disabledProvider, getLlmProvider, type LlmProvider } from "../llm/client.ts";
import { PROBLEMS } from "../problems/catalog.ts";
import { discoverProblems, polishExplanations } from "../problems/discover.ts";
import { calculateImpact } from "../problems/impact.ts";
import { toRecommendationInput } from "../problems/toRecommendation.ts";
import type { ProblemKey } from "../problems/types.ts";
import { loadConfig, type AppConfig } from "../shared/config.ts";
import { log } from "../shared/logger.ts";
import type { Result } from "../shared/validate.ts";
import { paybackFor } from "../problems/payback.ts";
import { rulesForProfile } from "../rules/forProfile.ts";
import { paybackBody, analyzeBody, confirmBody, detailsQuery, discoverBody, impactBody, searchQuery } from "./schemas.ts";

/**
 * Framework-free API handlers for Parts 2 and 3. Each returns `{ status, body }`
 * so they can be unit-tested without Next.js; app/api/** routes wrap them.
 *
 * Error body shape (all endpoints): { error: { code, message, details? } }
 */
export interface ApiResponse {
  status: number;
  body: unknown;
}

export interface ApiDeps {
  config: AppConfig;
  places: PlacesProvider;
  llm: LlmProvider;
  onboarding?: Partial<OnboardingDeps>;
  now?: () => Date;
}

export function defaultDeps(): ApiDeps {
  const config = loadConfig();
  return { config, places: getPlacesProvider(config), llm: getLlmProvider(config) };
}

export const errorResponse = (status: number, code: string, message: string, details?: string[]): ApiResponse => ({
  status,
  body: { error: { code, message, ...(details?.length ? { details: details.slice(0, 20) } : {}) } },
});

const invalid = (result: Result<unknown>) =>
  result.ok ? null : errorResponse(400, "invalid_request", "Some fields are missing or invalid.", result.errors);

const modeOf = (deps: ApiDeps) => ({
  places: deps.places.kind,
  llm: deps.llm === disabledProvider ? "off" : "on",
});

/** GET /api/business/search?q=&near= */
export async function handleSearch(query: Record<string, string | undefined>, deps: ApiDeps): Promise<ApiResponse> {
  const parsed = searchQuery.parse({ q: query.q, near: query.near || undefined });
  if (!parsed.ok) return invalid(parsed)!;
  try {
    const matches = await deps.places.search(parsed.value.q, parsed.value.near);
    return {
      status: 200,
      body: {
        query: parsed.value.q,
        matches,
        mode: modeOf(deps),
        sampleData: matches.some((m) => m.provider === "mock"),
        realSnapshot: matches.some((m) => m.provider === "public_snapshot"),
        // Live Google search is off: say so, and offer the real businesses we saved instead of guessing.
        liveSearch: deps.places.kind === "google_places",
        saved:
          deps.places.kind === "google_places"
            ? []
            : PUBLIC_SNAPSHOTS.map((x) => ({ placeId: x.placeId, name: x.details.name, address: x.details.address.formatted, capturedAt: x.capturedAt })),
      },
    };
  } catch (error) {
    if (error instanceof PlacesError) return errorResponse(502, "places_unavailable", error.message);
    throw error;
  }
}

/** GET /api/business/details?placeId= */
export async function handleDetails(query: Record<string, string | undefined>, deps: ApiDeps): Promise<ApiResponse> {
  const parsed = detailsQuery.parse({ placeId: query.placeId });
  if (!parsed.ok) return invalid(parsed)!;
  try {
    const details = await deps.places.details(parsed.value.placeId);
    if (!details) return errorResponse(404, "not_found", "We couldn't find that business.");
    return { status: 200, body: { business: details, mode: modeOf(deps), sampleData: details.provider === "mock" } };
  } catch (error) {
    if (error instanceof PlacesError) return errorResponse(502, "places_unavailable", error.message);
    throw error;
  }
}

/** POST /api/onboarding/analyze */
export async function handleAnalyze(body: unknown, deps: ApiDeps): Promise<ApiResponse> {
  const parsed = analyzeBody.parse(body);
  if (!parsed.ok) return invalid(parsed)!;
  try {
    const analysis = await analyzeBusiness(parsed.value, {
      places: deps.places,
      llm: deps.llm,
      websiteMaxPages: deps.config.websiteMaxPages,
      timeoutMs: deps.config.httpTimeoutMs,
      userAgent: deps.config.userAgent,
      ...deps.onboarding,
    });
    return { status: 200, body: analysis };
  } catch (error) {
    if (error instanceof OnboardingError) return errorResponse(error.status, error.status === 404 ? "not_found" : "invalid_request", error.message);
    if (error instanceof PlacesError) return errorResponse(502, "places_unavailable", error.message);
    throw error;
  }
}

/** POST /api/onboarding/confirm */
export async function handleConfirm(body: unknown, deps: ApiDeps): Promise<ApiResponse> {
  const parsed = confirmBody.parse(body);
  if (!parsed.ok) return invalid(parsed)!;
  const profile = applyCorrections(parsed.value.profile as unknown as OnboardingProfile, (parsed.value.corrections ?? {}) as ProfileCorrections, {
    confirm: parsed.value.confirm ?? true,
    now: deps.now?.(),
  });
  return { status: 200, body: { profile, readyForRecommendations: profile.missingForRecommendations.filter((f) => f !== "owner.techComfort").length === 0 } };
}

/** POST /api/problems/discover */
export async function handleDiscover(body: unknown, deps: ApiDeps): Promise<ApiResponse> {
  const parsed = discoverBody.parse(body);
  if (!parsed.ok) return invalid(parsed)!;
  const input = parsed.value;
  const profile = input.profile as unknown as OnboardingProfile;
  let discovery = discoverProblems(
    {
      profile,
      reviews: input.reviews as unknown as ReviewAnalysis,
      website: input.website as unknown as WebsiteAnalysis | null,
      listings: (input.listings ?? null) as unknown as ListingsCheck | null,
      assumptions: input.assumptions as Partial<Record<ProblemKey, Record<string, number>>> | undefined,
    },
    deps.now?.(),
  );
  if (input.polish !== false && deps.llm !== disabledProvider) discovery = await polishExplanations(discovery, deps.llm);
  const recommendationInput = toRecommendationInput(profile, discovery, { includeHypotheses: input.includeHypotheses });
  log.info("problems.discovered", { problems: discovery.problems.length, readyForPart4: recommendationInput.ok });
  return { status: 200, body: { discovery, recommendationInput, rules: rulesForProfile(profile, discovery) } };
}

/** POST /api/problems/payback — "pays for itself in X days" for a list of tool prices. */
export async function handlePayback(body: unknown): Promise<ApiResponse> {
  const parsed = paybackBody.parse(body);
  if (!parsed.ok) return invalid(parsed)!;
  const { industry, items, assumptions } = parsed.value;
  const results = items.map((item) =>
    paybackFor(item as { problemKey: ProblemKey; monthlyCost: number }, industry, (assumptions as Partial<Record<ProblemKey, Record<string, number>>> | undefined)?.[item.problemKey as ProblemKey] ?? {}),
  );
  return { status: 200, body: { results, note: "Estimates only. Based on the same numbers as the problem's estimate; not a promise of results." } };
}

/** POST /api/problems/impact — recalculate one estimate when the owner edits an input. */
export async function handleImpact(body: unknown): Promise<ApiResponse> {
  const parsed = impactBody.parse(body);
  if (!parsed.ok) return invalid(parsed)!;
  const def = PROBLEMS[parsed.value.problemKey];
  if (!def.impactModel) return errorResponse(422, "not_estimated", def.noImpactReason ?? "We don't estimate money for this problem.");
  const result = calculateImpact(def.impactModel, industryInfo(parsed.value.industry), parsed.value.overrides ?? {});
  if (!result.ok) return errorResponse(400, "invalid_assumptions", "Some numbers are outside the allowed range.", result.errors);
  return { status: 200, body: { problemKey: parsed.value.problemKey, impact: result.estimate } };
}
