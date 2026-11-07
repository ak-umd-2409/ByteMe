import type { LlmProvider } from "../llm/client.ts";
import { log } from "../shared/logger.ts";
import type { FetchLike, ResolveHost } from "../shared/safeFetch.ts";
import { findSnapshot } from "../../data/real/index.ts";
import { classifyIndustry } from "./industry.ts";
import { baseListings, checkListings, describeHours, parseHours, type ListingsCheck } from "./listings.ts";
import type { PublicSnapshot } from "./snapshot.ts";
import type { PlacesProvider } from "./places.ts";
import { buildProfile, type ManualBusiness } from "./profile.ts";
import { rulesForProfile } from "../rules/forProfile.ts";
import type { RulesReport } from "../rules/maryland.ts";
import { locationContext, type LocationContext } from "./location.ts";
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
  /** The business as it appears on Google, its website and public directories. */
  listings: ListingsCheck;
  /** Set when the business comes from a captured public snapshot (data/real). */
  snapshot: { capturedAt: string; note: string; sources: PublicSnapshot["sources"]; about: PublicSnapshot["about"] } | null;
  /** Plain-English notes about anything we couldn't do. */
  warnings: string[];
  mode: { places: "google_places" | "mock" | "public_snapshot" | "none"; llm: "on" | "off" };
  /** Spec 2.9–2.11: county, rural, nearest SBDC office, languages nearby, internet. */
  location: LocationContext;
  /** Spec 2.8: rules that affect which AI tools fit. /api/problems/discover returns an updated copy. */
  rules: RulesReport;
}

export interface OnboardingDeps {
  places: PlacesProvider;
  llm?: LlmProvider;
  fetchImpl?: FetchLike;
  resolveHost?: ResolveHost;
  websiteMaxPages?: number;
  timeoutMs?: number;
  userAgent?: string;
  /** Injectable clock for capture dates (tests). */
  now?: () => Date;
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
  const snapshot: PublicSnapshot | null = details?.provider === "public_snapshot" ? findSnapshot(details.placeId) : null;
  if (!details) warnings.push("No Google listing was used, so ratings and Google reviews aren't included.");
  if (details?.provider === "mock") warnings.push("Mock mode: this is a fictional sample business, not live Google data.");
  if (snapshot) warnings.push(`Real public data captured ${formatDate(snapshot.capturedAt)}. Google reviews need a Google API key, so they aren't included.`);

  const pasted = request.pastedReviews ? splitPastedReviews(request.pastedReviews) : [];
  const llmOn = Boolean(deps.llm && deps.llm.name !== "disabled");
  const reviewsPromise = analyzeReviews([...(details?.reviews ?? []), ...pasted], { llm: llmOn ? deps.llm : undefined });

  const websiteUrl = request.websiteUrl ?? details?.website ?? request.manual?.website ?? null;
  // Snapshots carry what could be read without crawling (their sites may block scanners).
  const scanPromise =
    websiteUrl && !(snapshot && !request.websiteUrl)
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
  const website = scan?.analysis ?? snapshot?.website ?? null;
  if (!websiteUrl) warnings.push("No website was found, so we couldn't check for online booking, prices or policies.");
  else if (website && !website.reachable) warnings.push(`We couldn't read the website: ${website.problem ?? "unknown error"}`);

  const industry = classifyIndustry({
    primaryType: details?.primaryType,
    types: details?.types,
    name: details?.name ?? request.manual?.name,
    categoryText: details?.primaryTypeLabel ?? request.manual?.category,
  }).key;
  const technology = detectTechnology(scan?.raw ?? [], { onGoogleMaps: Boolean(details) && !snapshot, industry });
  if (snapshot) technology.detected.unshift(...structuredClone(snapshot.detectedTech));

  const capturedAt = (deps.now?.() ?? new Date()).toISOString().slice(0, 10);
  const listings = checkListings(snapshot ? structuredClone(snapshot.listings) : baseListings(details, website, capturedAt));

  const profile = buildProfile({
    details,
    manual: request.manual,
    website,
    technology,
    reviews,
    owner: request.owner,
  });
  applyListingHours(profile, listings);
  log.info("onboarding.analyzed", {
    places: profile.sources.places,
    website: profile.sources.website,
    reviews: reviews.reviewCount,
    tools: technology.detected.length,
    listingIssues: listings.issues.length,
  });
  return {
    profile,
    reviews,
    website,
    technology,
    listings,
    snapshot: snapshot ? { capturedAt: snapshot.capturedAt, note: snapshot.captureNote, sources: snapshot.sources, about: snapshot.about } : null,
    warnings,
    mode: { places: details ? details.provider : "none", llm: llmOn ? "on" : "off" },
    location: locationContext(profile.business.address.value),
    rules: rulesForProfile(profile),
  };
}

/** When the profile has no hours of its own, use what most listings say, and flag disagreement. */
function applyListingHours(profile: OnboardingProfile, listings: ListingsCheck) {
  const field = listings.fields.find((f) => f.field === "hours");
  const top = field?.values[0];
  if (!field || !top) return;
  // Keep a Google/owner value unless listings disagree; a website line alone isn't a full schedule.
  const hasOwn = profile.business.hours.value?.length && profile.business.hours.source !== "website";
  if (hasOwn && field.status !== "differs") return;
  if (profile.business.hours.source === "owner") return;
  const sample = listings.listings.find((l) => l.id === top.listingIds[0]);
  const parsed = sample?.hours ? parseHours(sample.hours) : null;
  profile.business.hours = {
    value: [parsed ? describeHours(parsed) : top.display],
    source: "public_listings",
    confidence: field.status === "differs" ? "low" : "medium",
    evidence:
      field.status === "differs"
        ? `${top.listingIds.length} of ${listings.listings.filter((l) => l.hours).length} listings say this; others disagree`
        : `From ${top.listingIds.length} listing${top.listingIds.length === 1 ? "" : "s"}`,
    editable: true,
    needsOwnerInput: field.status === "differs",
  };
}

const formatDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
