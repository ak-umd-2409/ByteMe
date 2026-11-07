import { hashKey } from "../shared/cache.ts";
import { industryInfo, classifyIndustry, INDUSTRIES } from "./industry.ts";
import type {
  Confidence,
  Constraint,
  Fact,
  FactSource,
  Goal,
  IndustryKey,
  OnboardingProfile,
  OwnerInputs,
  PlaceDetails,
  PostalAddress,
  ReviewAnalysis,
  TechComfort,
  TechnologyReport,
  WebsiteAnalysis,
} from "./types.ts";

/** Business details typed in by the owner when there is no Google listing. */
export interface ManualBusiness {
  name: string;
  category?: string;
  website?: string;
  phone?: string;
  address?: Partial<PostalAddress>;
}

const fact = <T>(
  value: T | null | undefined,
  source: FactSource | null,
  confidence: Confidence | null,
  evidence?: string,
  extra: Partial<Fact<T>> = {},
): Fact<T> => ({
  value: value ?? null,
  source: value === null || value === undefined ? null : source,
  confidence: value === null || value === undefined ? null : confidence,
  ...(evidence ? { evidence } : {}),
  editable: true,
  ...extra,
});

const missing = <T>(): Fact<T> => ({ value: null, source: null, confidence: null, editable: true, needsOwnerInput: true });

/** Detected technologies that matter for integrations (not analytics pixels). */
const INTEGRATION_CATEGORIES = new Set(["pos_payments", "ecommerce", "booking", "field_service", "accounting", "restaurant", "marketing", "google", "website_builder"]);
const PAYMENT_TOOLS = new Set(["Square", "Toast", "Clover", "Shopify", "QuickBooks"]);

function uniqueTools(names: string[]): string[] {
  const seen = new Map<string, string>();
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed && !seen.has(trimmed.toLowerCase())) seen.set(trimmed.toLowerCase(), trimmed);
  }
  return [...seen.values()];
}

export interface BuildProfileInput {
  details: PlaceDetails | null;
  manual?: ManualBusiness | null;
  website: WebsiteAnalysis | null;
  technology: TechnologyReport;
  reviews: ReviewAnalysis;
  owner?: OwnerInputs;
}

export function buildProfile(input: BuildProfileInput): OnboardingProfile {
  const { details, website, technology, reviews } = input;
  const manual = input.manual ?? null;
  const owner = input.owner ?? {};
  const placeSource: FactSource =
    details?.provider === "mock" ? "mock_places" : details?.provider === "public_snapshot" ? "public_listings" : "google_places";
  const fromGoogle =
    details?.provider === "mock" ? "Sample Google listing (mock)" : details?.provider === "public_snapshot" ? "Public listings (BBB, Birdeye, Yelp)" : "Google Business Profile";

  const name = details ? fact(details.name, placeSource, "high", fromGoogle) : fact(manual?.name, "owner", "high", "You told us");

  const classified = classifyIndustry({
    primaryType: details?.primaryType,
    types: details?.types,
    name: details?.name ?? manual?.name,
    categoryText: details?.primaryTypeLabel ?? manual?.category,
  });
  const industry: Fact<IndustryKey> =
    classified.method === "places_type"
      ? fact(classified.key, placeSource, "high", `Google category: ${details?.primaryTypeLabel ?? classified.matched}`)
      : classified.method === "keyword"
        ? fact(classified.key, "derived", "medium", `Matched “${classified.matched}” in the business name or category`)
        : fact<IndustryKey>("other", "default", "low", "Couldn't tell the industry — please pick one", { needsOwnerInput: true });

  const category = details?.primaryTypeLabel
    ? fact(details.primaryTypeLabel, placeSource, "high", fromGoogle)
    : manual?.category
      ? fact(manual.category, "owner", "high", "You told us")
      : missing<string>();

  const address: Fact<PostalAddress> = details
    ? fact(details.address, placeSource, "high", fromGoogle)
    : manual?.address
      ? fact<PostalAddress>(
          {
            formatted: manual.address.formatted ?? [manual.address.city, manual.address.stateCode].filter(Boolean).join(", "),
            street: manual.address.street ?? null,
            city: manual.address.city ?? null,
            county: manual.address.county ?? null,
            state: manual.address.state ?? null,
            stateCode: manual.address.stateCode?.toUpperCase() ?? null,
            postalCode: manual.address.postalCode ?? null,
            country: manual.address.country ?? "US",
          },
          "owner",
          "high",
          "You told us",
        )
      : missing<PostalAddress>();

  const phone = details?.phone
    ? fact(details.phone, placeSource, "high", fromGoogle)
    : manual?.phone
      ? fact(manual.phone, "owner", "high", "You told us")
      : website?.phones[0]
        ? fact(website.phones[0].value, "website", "medium", website.phones[0].evidence.url)
        : missing<string>();

  const email = website?.emails[0] ? fact(website.emails[0].value, "website", "medium", website.emails[0].evidence.url) : missing<string>();

  const websiteUrl = details?.website ?? manual?.website ?? null;
  const websiteFact = details?.website
    ? fact(details.website, placeSource, "high", fromGoogle)
    : manual?.website
      ? fact(manual.website, "owner", "high", "You told us")
      : missing<string>();

  const hours = details?.hours.length
    ? fact(details.hours, placeSource, "high", fromGoogle)
    : website?.hours.length
      ? fact(website.hours.map((h) => h.value), "website", "medium", website.hours[0].evidence.url)
      : missing<string[]>();

  const detectedTools = technology.detected.filter((t) => INTEGRATION_CATEGORIES.has(t.category)).map((t) => t.name);
  const toolList = uniqueTools([...detectedTools, ...(owner.currentTools ?? [])]);
  const currentTools: Fact<string[]> = owner.currentTools
    ? fact(toolList, "owner", "high", "You confirmed these")
    : fact(toolList, "tech_signature", "high", detectedTools.length ? "Found on your website or Google listing" : "Nothing detected yet — add the tools you use", {
        needsOwnerInput: detectedTools.length === 0,
      });

  const info = industryInfo(industry.value ?? "other");
  const handlesHealthData: Fact<boolean> =
    owner.handlesHealthData !== undefined
      ? fact(owner.handlesHealthData, "owner", "high", "You told us")
      : fact(info.handlesHealthData, info.handlesHealthData ? "derived" : "default", info.handlesHealthData ? "medium" : "low",
          info.handlesHealthData ? `${info.label} businesses usually handle patient information` : "Assumed no — tell us if you keep health information");

  const ownerFact = <T>(value: T | undefined, required = false): Fact<T> =>
    value !== undefined ? fact(value, "owner", "high", "You told us") : required ? missing<T>() : { ...missing<T>(), needsOwnerInput: false };

  const profile: OnboardingProfile = {
    profileId: hashKey(details?.placeId ?? name.value, address.value?.formatted ?? manual?.address?.city ?? ""),
    schemaVersion: 1,
    business: {
      name,
      industry,
      industryLabel: info.label,
      category,
      address,
      phone,
      email,
      website: websiteFact,
      hours,
      rating: details?.rating != null ? fact(details.rating, placeSource, "high", fromGoogle) : fact<number>(reviews.averageRating, "review_analysis", "low", "Average of the reviews you pasted"),
      reviewCount: details?.reviewCount != null ? fact(details.reviewCount, placeSource, "high", fromGoogle) : fact<number>(reviews.reviewCount || null, "review_analysis", "low", "Reviews you pasted"),
      placeId: details?.placeId ?? null,
      googleMapsUrl: details?.googleMapsUrl ?? null,
    },
    owner: {
      teamSize: ownerFact<number>(owner.teamSize),
      monthlyBudget: ownerFact<number>(owner.monthlyBudget, true),
      goals: ownerFact<Goal[]>(owner.goals),
      techComfort: ownerFact<TechComfort>(owner.techComfort, true),
      constraints: owner.constraints ? fact<Constraint[]>(owner.constraints, "owner", "high", "You told us") : fact<Constraint[]>([], "default", "low", "No deal-breakers given yet"),
      handlesHealthData,
      handlesLargeCustomerList: owner.handlesLargeCustomerList !== undefined ? fact(owner.handlesLargeCustomerList, "owner", "high", "You told us") : fact(false, "default", "low", "Assumed no"),
      hasOutboundCallConsent: owner.hasOutboundCallConsent !== undefined ? fact(owner.hasOutboundCallConsent, "owner", "high", "You told us") : fact(false, "default", "low", "Assumed no"),
      biggestTimeSink: ownerFact<string>(owner.biggestTimeSink),
      reportedProblems: ownerFact<string[]>(owner.reportedProblems),
    },
    technology: { detected: technology.detected, currentTools, askOwnerAbout: technology.askOwnerAbout },
    dataSensitivity: { level: "low", reasons: [] },
    sources: {
      places: details ? (details.provider === "mock" ? "mock" : details.provider) : "none",
      website: !websiteUrl && !website ? "none" : website?.reachable ? "scanned" : website?.pages.some((p) => p.status === "blocked_by_robots") ? "blocked" : "unreachable",
      reviews: { ...reviews.bySource },
    },
    missingForRecommendations: [],
    confirmedAt: null,
  };
  return finalize(profile);
}

/** Recompute derived fields after any change. */
function finalize(profile: OnboardingProfile): OnboardingProfile {
  const info = industryInfo(profile.business.industry.value ?? "other");
  profile.business.industryLabel = info.label;
  const reasons: string[] = [];
  let level: "low" | "medium" | "high" = "low";
  if (profile.owner.handlesHealthData.value) {
    level = "high";
    reasons.push("Handles health or patient information");
  }
  const tools = profile.technology.currentTools.value ?? [];
  if (tools.some((t) => PAYMENT_TOOLS.has(t))) {
    if (level === "low") level = "medium";
    reasons.push("Takes card payments through a connected tool");
  }
  if (profile.owner.handlesLargeCustomerList.value) {
    if (level === "low") level = "medium";
    reasons.push("Keeps a large customer list");
  }
  if (reasons.length === 0) reasons.push("No sensitive data signals found");
  profile.dataSensitivity = { level, reasons };

  const needed: string[] = [];
  if (profile.owner.monthlyBudget.value === null) needed.push("owner.monthlyBudget");
  if (!profile.business.address.value?.stateCode) needed.push("business.address.stateCode");
  if (profile.owner.techComfort.value === null) needed.push("owner.techComfort");
  if (!profile.business.name.value) needed.push("business.name");
  profile.missingForRecommendations = needed;
  profile.owner.monthlyBudget.needsOwnerInput = profile.owner.monthlyBudget.value === null;
  profile.owner.techComfort.needsOwnerInput = profile.owner.techComfort.value === null;
  return profile;
}

/** Corrections the owner makes on the "Is this right?" screen. */
export interface ProfileCorrections {
  business?: {
    name?: string;
    industry?: IndustryKey;
    category?: string;
    phone?: string;
    email?: string;
    website?: string;
    hours?: string[];
    address?: Partial<PostalAddress>;
  };
  owner?: OwnerInputs;
  currentTools?: string[];
}

export function applyCorrections(
  original: OnboardingProfile,
  corrections: ProfileCorrections,
  opts: { confirm?: boolean; now?: Date } = {},
): OnboardingProfile {
  const profile: OnboardingProfile = structuredClone(original);
  const yours = <T>(value: T): Fact<T> => ({ value, source: "owner", confidence: "high", evidence: "You corrected this", editable: true });
  const b = corrections.business ?? {};
  if (b.name !== undefined) profile.business.name = yours(b.name);
  if (b.industry !== undefined && b.industry in INDUSTRIES) profile.business.industry = yours(b.industry);
  if (b.category !== undefined) profile.business.category = yours(b.category);
  if (b.phone !== undefined) profile.business.phone = yours(b.phone);
  if (b.email !== undefined) profile.business.email = yours(b.email);
  if (b.website !== undefined) profile.business.website = yours(b.website);
  if (b.hours !== undefined) profile.business.hours = yours(b.hours);
  if (b.address !== undefined) {
    const current = profile.business.address.value;
    profile.business.address = yours({
      formatted: b.address.formatted ?? current?.formatted ?? "",
      street: b.address.street ?? current?.street ?? null,
      city: b.address.city ?? current?.city ?? null,
      county: b.address.county ?? current?.county ?? null,
      state: b.address.state ?? current?.state ?? null,
      stateCode: (b.address.stateCode ?? current?.stateCode ?? null)?.toUpperCase() ?? null,
      postalCode: b.address.postalCode ?? current?.postalCode ?? null,
      country: b.address.country ?? current?.country ?? "US",
    });
  }
  const o = corrections.owner ?? {};
  const ownerKeys = [
    "teamSize",
    "monthlyBudget",
    "goals",
    "techComfort",
    "constraints",
    "handlesHealthData",
    "handlesLargeCustomerList",
    "hasOutboundCallConsent",
    "biggestTimeSink",
    "reportedProblems",
  ] as const;
  for (const key of ownerKeys) {
    if (o[key] !== undefined) (profile.owner as Record<string, Fact<unknown>>)[key] = yours<unknown>(o[key]);
  }
  if (corrections.currentTools !== undefined) profile.technology.currentTools = yours(uniqueTools(corrections.currentTools));
  if (opts.confirm) profile.confirmedAt = (opts.now ?? new Date()).toISOString();
  return finalize(profile);
}
