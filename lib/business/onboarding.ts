import type { LlmProvider } from "../llm/client.ts";
import { log } from "../shared/logger.ts";
import type { FetchLike, ResolveHost } from "../shared/safeFetch.ts";
import { classifyIndustry } from "./industry.ts";
import type { PlacesProvider } from "./places.ts";
import { buildProfile, type ManualBusiness } from "./profile.ts";
import { analyzeReviews, splitPastedReviews } from "./reviews.ts";
import { detectTechnology } from "./techDetect.ts";
import type {
  OnboardingProfile,
  OwnerInputs,
  ReviewAnalysis,
  TechnologyReport,
  WebsiteAnalysis,
} from "./types.ts";
import { scanWebsite } from "./website.ts";

/**
 * Part 2 pipeline: one call turns a business (Google place or typed-in
 * details) into a profile plus the review, website and technology analyses
 * that Part 3 uses as evidence.
 */
export interface AnalyzeRequest {
  placeId?: string;
  manual?: ManualBusiness;
  /** Overrides the website found on Google. */
  websiteUrl?: string;
  pastedReviews?: string;
  owner?: OwnerInputs;
}

export interface OnboardingAnalysis {
  profile: OnboardingProfile;
  reviews: ReviewAnalysis;
  website: WebsiteAnalysis | null;
  technology: TechnologyReport;
  /** Plain-English notes about anything we couldn't do. */
  warnings: string[];
  mode: { places: "google_places" | "mock" | "none"; llm: "on" | "off" };
}

export interface OnboardingDeps {
  places: PlacesProvider;
  llm?: LlmProvider;
  fetchImpl?: FetchLike;
  resolveHost?: ResolveHost;
  websiteMaxPages?: number;
  timeoutMs?: number;
  userAgent?: string;
}

export class OnboardingError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function analyzeBusiness(request: AnalyzeRequest, deps: OnboardingDeps): Promise<OnboardingAnalysis> {
  const warnings: string[] = [];
  if (!request.placeId && !request.manual?.name) throw new OnboardingError("Choose a business or type its name.", 400);

  const details = request.placeId ? await deps.places.details(request.placeId) : null;
  if (request.placeId && !details) throw new OnboardingError("We couldn't find that business. Try searching again.", 404);
  if (!details) warnings.push("No Google listing was used, so ratings and Google reviews aren't included.");
  if (details?.provider === "mock") warnings.push("Mock mode: this is a fictional sample business, not live Google data.");

  const pasted = request.pastedReviews ? splitPastedReviews(request.pastedReviews) : [];
  const llmOn = Boolean(deps.llm && deps.llm.name !== "disabled");
  const reviewsPromise = analyzeReviews([...(details?.reviews ?? []), ...pasted], { llm: llmOn ? deps.llm : undefined });

  const websiteUrl = request.websiteUrl ?? details?.website ?? request.manual?.website ?? null;
  const scanPromise = websiteUrl
    ? scanWebsite(websiteUrl, {
        fetchImpl: deps.fetchImpl,
        resolveHost: deps.resolveHost,
        maxPages: deps.websiteMaxPages,
        timeoutMs: deps.timeoutMs,
        userAgent: deps.userAgent,
        llm: llmOn ? deps.llm : undefined,
      })
    : Promise.resolve(null);

  const [reviews, scan] = await Promise.all([reviewsPromise, scanPromise]);
  if (!websiteUrl) warnings.push("No website was found, so we couldn't check for online booking, prices or policies.");
  else if (scan && !scan.analysis.reachable) warnings.push(`We couldn't read the website: ${scan.analysis.problem ?? "unknown error"}`);

  const industry = classifyIndustry({
    primaryType: details?.primaryType,
    types: details?.types,
    name: details?.name ?? request.manual?.name,
    categoryText: details?.primaryTypeLabel ?? request.manual?.category,
  }).key;
  const technology = detectTechnology(scan?.raw ?? [], { onGoogleMaps: Boolean(details), industry });

  const profile = buildProfile({
    details,
    manual: request.manual,
    website: scan?.analysis ?? null,
    technology,
    reviews,
    owner: request.owner,
  });
  log.info("onboarding.analyzed", {
    places: profile.sources.places,
    website: profile.sources.website,
    reviews: reviews.reviewCount,
    tools: technology.detected.length,
  });
  return {
    profile,
    reviews,
    website: scan?.analysis ?? null,
    technology,
    warnings,
    mode: { places: details ? (details.provider === "mock" ? "mock" : "google_places") : "none", llm: llmOn ? "on" : "off" },
  };
}
