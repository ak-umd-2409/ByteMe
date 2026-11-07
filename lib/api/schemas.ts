import { CONSTRAINTS, GOALS, type IndustryKey } from "../business/types.ts";
import { INDUSTRIES } from "../business/industry.ts";
import { PROBLEM_KEYS } from "../problems/types.ts";
import { v, type Schema } from "../shared/validate.ts";

/**
 * Request schemas for the Part 2/3 API.
 *
 * The frontend holds state between steps and sends the profile and analyses
 * back. Those payloads are re-validated here (types, lengths, enums); unknown
 * fields are dropped. Nothing a client sends can make a number "verified" in a
 * way that changes another user's results — the API is stateless.
 */
const INDUSTRY_KEYS = Object.keys(INDUSTRIES) as [IndustryKey, ...IndustryKey[]];
const PLACE_ID = /^[A-Za-z0-9_-]{3,300}$/;
const STATE = /^[A-Za-z]{2}$/;

export const searchQuery = v.object({
  q: v.string({ min: 2, max: 120 }),
  near: v.optional(v.string({ max: 80 })),
});

export const detailsQuery = v.object({ placeId: v.string({ pattern: PLACE_ID }) });

export const ownerInputsSchema = v.object({
  teamSize: v.optional(v.number({ min: 0, max: 10_000, integer: true })),
  monthlyBudget: v.optional(v.number({ min: 0, max: 100_000 })),
  goals: v.optional(v.array(v.oneOf(GOALS), { max: GOALS.length })),
  techComfort: v.optional(v.oneOf(["self_serve", "needs_help"] as const)),
  constraints: v.optional(v.array(v.oneOf(CONSTRAINTS), { max: CONSTRAINTS.length })),
  currentTools: v.optional(v.array(v.string({ min: 1, max: 80 }), { max: 30 })),
  handlesHealthData: v.optional(v.boolean()),
  handlesLargeCustomerList: v.optional(v.boolean()),
  hasOutboundCallConsent: v.optional(v.boolean()),
  biggestTimeSink: v.optional(v.string({ max: 1_000 })),
  reportedProblems: v.optional(v.array(v.oneOf(PROBLEM_KEYS), { max: PROBLEM_KEYS.length })),
});

const addressInput = v.object({
  formatted: v.optional(v.string({ max: 200 })),
  street: v.optional(v.string({ max: 120 })),
  city: v.optional(v.string({ max: 80 })),
  county: v.optional(v.string({ max: 80 })),
  state: v.optional(v.string({ max: 40 })),
  stateCode: v.optional(v.string({ pattern: STATE })),
  postalCode: v.optional(v.string({ max: 12 })),
  country: v.optional(v.string({ max: 2 })),
});

export const analyzeBody = v.object({
  placeId: v.optional(v.string({ pattern: PLACE_ID })),
  manual: v.optional(
    v.object({
      name: v.string({ min: 1, max: 120 }),
      category: v.optional(v.string({ max: 80 })),
      website: v.optional(v.string({ max: 500 })),
      phone: v.optional(v.string({ max: 30 })),
      address: v.optional(addressInput),
    }),
  ),
  websiteUrl: v.optional(v.string({ max: 500 })),
  pastedReviews: v.optional(v.string({ max: 20_000 })),
  owner: v.optional(ownerInputsSchema),
});

// ---------- Round-tripped payloads ----------

const FACT_SOURCES = ["google_places", "mock_places", "public_listings", "website", "tech_signature", "review_analysis", "owner", "default", "derived"] as const;
const CONFIDENCE = ["high", "medium", "low"] as const;

function factOf<T>(value: Schema<T>) {
  return v.object(
    {
      value: v.nullable(value),
      source: v.nullable(v.oneOf(FACT_SOURCES)),
      confidence: v.nullable(v.oneOf(CONFIDENCE)),
      evidence: v.optional(v.string({ max: 500 })),
      editable: v.boolean(),
      needsOwnerInput: v.optional(v.boolean()),
    },
    { allowUnknown: true },
  );
}

const postalAddress = v.object(
  {
    formatted: v.string({ max: 200, trim: false }),
    street: v.nullable(v.string({ max: 120 })),
    city: v.nullable(v.string({ max: 80 })),
    county: v.nullable(v.string({ max: 80 })),
    state: v.nullable(v.string({ max: 40 })),
    stateCode: v.nullable(v.string({ max: 3 })),
    postalCode: v.nullable(v.string({ max: 12 })),
    country: v.nullable(v.string({ max: 3 })),
  },
  { allowUnknown: true },
);

const shortText = v.string({ max: 300, trim: false });
const detectedTech = v.object(
  {
    id: v.string({ max: 60 }),
    name: v.string({ max: 80 }),
    category: v.string({ max: 40 }),
    evidence: v.array(
      v.object({ url: v.string({ max: 500 }), matched: v.string({ max: 200 }), kind: v.oneOf(["script", "link", "html", "header", "places", "listing"] as const) }, { allowUnknown: true }),
      { max: 5 },
    ),
    confidence: v.oneOf(["verified"] as const),
  },
  { allowUnknown: true },
);

export const profileSchema = v.object(
  {
    profileId: v.string({ max: 64 }),
    schemaVersion: v.number({ min: 1, max: 1 }),
    business: v.object(
      {
        name: factOf(v.string({ max: 120 })),
        industry: factOf(v.oneOf(INDUSTRY_KEYS)),
        industryLabel: v.string({ max: 80 }),
        category: factOf(v.string({ max: 80 })),
        address: factOf(postalAddress),
        phone: factOf(v.string({ max: 30 })),
        email: factOf(v.string({ max: 120 })),
        website: factOf(v.string({ max: 500 })),
        hours: factOf(v.array(v.string({ max: 160 }), { max: 14 })),
        rating: factOf(v.number({ min: 0, max: 5 })),
        reviewCount: factOf(v.number({ min: 0, max: 1_000_000 })),
        placeId: v.nullable(v.string({ max: 300 })),
        googleMapsUrl: v.nullable(v.string({ max: 500 })),
      },
      { allowUnknown: true },
    ),
    owner: v.object(
      {
        teamSize: factOf(v.number({ min: 0, max: 10_000 })),
        monthlyBudget: factOf(v.number({ min: 0, max: 100_000 })),
        goals: factOf(v.array(v.oneOf(GOALS), { max: GOALS.length })),
        techComfort: factOf(v.oneOf(["self_serve", "needs_help"] as const)),
        constraints: factOf(v.array(v.oneOf(CONSTRAINTS), { max: CONSTRAINTS.length })),
        handlesHealthData: factOf(v.boolean()),
        handlesLargeCustomerList: factOf(v.boolean()),
        hasOutboundCallConsent: factOf(v.boolean()),
        biggestTimeSink: factOf(v.string({ max: 1_000 })),
        reportedProblems: factOf(v.array(v.oneOf(PROBLEM_KEYS), { max: PROBLEM_KEYS.length })),
      },
      { allowUnknown: true },
    ),
    technology: v.object(
      {
        detected: v.array(detectedTech, { max: 40 }),
        currentTools: factOf(v.array(v.string({ max: 80 }), { max: 30 })),
        askOwnerAbout: v.array(v.string({ max: 80 }), { max: 30 }),
      },
      { allowUnknown: true },
    ),
    dataSensitivity: v.object({ level: v.oneOf(["low", "medium", "high"] as const), reasons: v.array(v.string({ max: 200 }), { max: 10 }) }, { allowUnknown: true }),
    sources: v.object(
      {
        places: v.oneOf(["google_places", "mock", "public_snapshot", "none"] as const),
        website: v.oneOf(["scanned", "unreachable", "blocked", "none"] as const),
        reviews: v.object(
          { google: v.number({ min: 0 }), owner_pasted: v.number({ min: 0 }), mock: v.number({ min: 0 }), public_listing: v.optional(v.number({ min: 0 })) },
          { allowUnknown: true },
        ),
      },
      { allowUnknown: true },
    ),
    missingForRecommendations: v.array(v.string({ max: 80 }), { max: 20 }),
    confirmedAt: v.nullable(v.string({ max: 40 })),
  },
  { allowUnknown: true },
);

const themeEvidence = v.object(
  {
    reviewId: v.string({ max: 300 }),
    quote: v.nullable(shortText),
    summary: v.optional(v.nullable(shortText)),
    url: v.optional(v.nullable(v.string({ max: 500 }))),
    platform: v.optional(v.nullable(v.string({ max: 80 }))),
    relativeTime: v.optional(v.nullable(v.string({ max: 40 }))),
    source: v.oneOf(["google", "owner_pasted", "mock", "public_listing"] as const),
    rating: v.nullable(v.number({ min: 0, max: 5 })),
    author: v.nullable(v.string({ max: 120 })),
  },
  { allowUnknown: true },
);
const theme = v.object(
  {
    key: v.string({ max: 40 }),
    label: v.string({ max: 80 }),
    polarity: v.oneOf(["complaint", "praise"] as const),
    mentions: v.number({ min: 0, max: 1_000 }),
    evidence: v.array(themeEvidence, { max: 10 }),
    detectedBy: v.array(v.oneOf(["rules", "llm", "extracted"] as const), { max: 3 }),
  },
  { allowUnknown: true },
);

export const reviewAnalysisSchema = v.object(
  {
    reviewCount: v.number({ min: 0, max: 10_000 }),
    averageRating: v.nullable(v.number({ min: 0, max: 5 })),
    bySource: v.object(
      { google: v.number({ min: 0 }), owner_pasted: v.number({ min: 0 }), mock: v.number({ min: 0 }), public_listing: v.optional(v.number({ min: 0 })) },
      { allowUnknown: true },
    ),
    platforms: v.optional(v.array(v.object({ name: v.string({ max: 80 }), count: v.number({ min: 0 }) }), { max: 20 })),
    newestReview: v.optional(v.nullable(v.string({ max: 40 }))),
    complaints: v.array(theme, { max: 20 }),
    praise: v.array(theme, { max: 20 }),
    method: v.oneOf(["rules", "rules+llm"] as const),
    limitations: v.array(v.string({ max: 300 }), { max: 10 }),
  },
  { allowUnknown: true },
);

const webEvidence = v.object({ url: v.string({ max: 500 }), snippet: v.string({ max: 300, trim: false }) }, { allowUnknown: true });
const finding = <T>(value: Schema<T>) => v.object({ value, evidence: webEvidence, method: v.oneOf(["pattern", "html", "llm", "search_index", "page_fetch"] as const) }, { allowUnknown: true });
const present = v.object({ present: v.boolean(), url: v.nullable(v.string({ max: 500 })) }, { allowUnknown: true });
const policyStatus = v.object({
  present: v.boolean(),
  url: v.nullable(v.string({ max: 2048 })),
  facts: v.optional(
    v.array(v.object({ key: v.string({ max: 40 }), label: v.string({ max: 200 }), snippet: v.string({ max: 300 }), url: v.string({ max: 2048 }) }), { max: 20 }),
  ),
});

export const websiteAnalysisSchema = v.object(
  {
    requestedUrl: v.string({ max: 500 }),
    reachable: v.boolean(),
    problem: v.nullable(v.string({ max: 300 })),
    pages: v.array(
      v.object(
        {
          url: v.string({ max: 500 }),
          kind: v.string({ max: 20 }),
          title: v.nullable(v.string({ max: 300 })),
          status: v.oneOf(["scanned", "blocked_by_robots", "failed"] as const),
          error: v.optional(v.string({ max: 300 })),
        },
        { allowUnknown: true },
      ),
      { max: 20 },
    ),
    pagesScanned: v.number({ min: 0, max: 50 }),
    services: v.array(finding(v.string({ max: 120 })), { max: 30 }),
    products: v.array(finding(v.string({ max: 120 })), { max: 30 }),
    prices: v.array(finding(v.object({ amount: v.number({ min: 0 }), text: v.string({ max: 40 }) }, { allowUnknown: true })), { max: 20 }),
    hours: v.array(finding(v.string({ max: 200 })), { max: 15 }),
    phones: v.array(finding(v.string({ max: 30 })), { max: 10 }),
    emails: v.array(finding(v.string({ max: 120 })), { max: 10 }),
    booking: v.object({ onlineBooking: v.boolean(), evidence: v.nullable(webEvidence), provider: v.nullable(v.string({ max: 80 })) }, { allowUnknown: true }),
    contactForm: v.object({ present: v.boolean(), evidence: v.nullable(webEvidence) }, { allowUnknown: true }),
    faq: v.object({ present: v.boolean(), url: v.nullable(v.string({ max: 500 })), questions: v.array(v.string({ max: 200 }), { max: 20 }) }, { allowUnknown: true }),
    policies: v.object({ privacy: policyStatus, refund: policyStatus, terms: policyStatus }, { allowUnknown: true }),
    phoneOnlyCallsToAction: v.array(finding(v.string({ max: 120 })), { max: 10 }),
    afterHoursMessages: v.array(finding(v.string({ max: 120 })), { max: 10 }),
    method: v.oneOf(["rules", "rules+llm"] as const),
    limitations: v.array(v.string({ max: 300 }), { max: 10 }),
  },
  { allowUnknown: true },
);

const overrides = v.record(v.number({ min: 0, max: 100_000 }), { maxKeys: 10 });

export const correctionsSchema = v.object({
  business: v.optional(
    v.object({
      name: v.optional(v.string({ min: 1, max: 120 })),
      industry: v.optional(v.oneOf(INDUSTRY_KEYS)),
      category: v.optional(v.string({ max: 80 })),
      phone: v.optional(v.string({ max: 30 })),
      email: v.optional(v.string({ max: 120 })),
      website: v.optional(v.string({ max: 500 })),
      hours: v.optional(v.array(v.string({ max: 160 }), { max: 14 })),
      address: v.optional(addressInput),
    }),
  ),
  owner: v.optional(ownerInputsSchema),
  currentTools: v.optional(v.array(v.string({ min: 1, max: 80 }), { max: 30 })),
});

export const confirmBody = v.object({
  profile: profileSchema,
  corrections: v.optional(correctionsSchema),
  confirm: v.optional(v.boolean()),
});

const listingRecord = v.object({
  id: v.string({ max: 40 }),
  directory: v.oneOf(["google", "website", "bbb", "yelp", "birdeye", "yahoo", "facebook", "linkedin", "angi", "other"] as const),
  label: v.string({ max: 60 }),
  url: v.nullable(v.string({ max: 500 })),
  capturedAt: v.string({ max: 40 }),
  capturedVia: v.oneOf(["places_api", "page_fetch", "search_index", "website_scan", "sample"] as const),
  name: v.nullable(v.string({ max: 120 })),
  address: v.nullable(v.string({ max: 200 })),
  phone: v.nullable(v.string({ max: 30 })),
  hours: v.nullable(v.array(v.string({ max: 160 }), { max: 14 })),
  rating: v.nullable(v.number({ min: 0, max: 5 })),
  reviewCount: v.nullable(v.number({ min: 0, max: 1_000_000 })),
  services: v.optional(
    v.object({
      emergency_service: v.optional(v.nullable(v.boolean())),
      senior_discount: v.optional(v.nullable(v.boolean())),
      free_estimates: v.optional(v.nullable(v.boolean())),
    }),
  ),
});
const listingValue = v.object({ display: v.string({ max: 200 }), listingIds: v.array(v.string({ max: 40 }), { max: 20 }) });
export const listingsSchema = v.object({
  listings: v.array(listingRecord, { max: 20 }),
  fields: v.array(
    v.object({
      field: v.oneOf(["hours", "address", "phone"] as const),
      status: v.oneOf(["match", "differs", "single", "missing"] as const),
      values: v.array(listingValue, { max: 20 }),
    }),
    { max: 3 },
  ),
  issues: v.array(
    v.object({
      kind: v.oneOf(["hours", "address", "phone", "duplicate", "rating_gap", "services"] as const),
      severity: v.oneOf(["high", "medium", "low"] as const),
      headline: v.string({ max: 120 }),
      detail: v.string({ max: 600 }),
      listingIds: v.array(v.string({ max: 40 }), { max: 20 }),
    }),
    { max: 20 },
  ),
  consistentCount: v.number({ min: 0, max: 20 }),
});

export const discoverBody = v.object({
  profile: profileSchema,
  reviews: reviewAnalysisSchema,
  website: v.nullable(websiteAnalysisSchema),
  listings: v.optional(v.nullable(listingsSchema)),
  assumptions: v.optional(v.record(overrides, { keys: PROBLEM_KEYS })),
  includeHypotheses: v.optional(v.array(v.oneOf(PROBLEM_KEYS), { max: PROBLEM_KEYS.length })),
  polish: v.optional(v.boolean()),
});

export const paybackBody = v.object({
  industry: v.oneOf(INDUSTRY_KEYS),
  items: v.array(v.object({ problemKey: v.oneOf(PROBLEM_KEYS), monthlyCost: v.number({ min: 0, max: 100_000 }) }), { min: 1, max: 30 }),
  assumptions: v.optional(v.record(v.record(v.number({ min: 0, max: 1_000_000 }), { maxKeys: 20 }), { maxKeys: 20, keys: PROBLEM_KEYS })),
});

export const impactBody = v.object({
  problemKey: v.oneOf(PROBLEM_KEYS),
  industry: v.oneOf(INDUSTRY_KEYS),
  overrides: v.optional(overrides),
});
