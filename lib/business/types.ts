/**
 * Part 2 — Business Onboarding and Business Intelligence: shared types.
 *
 * Design rule: every fact carries its provenance (`source`) so the UI can show
 * "from Google", "from your website", "you told us" and the owner can correct it.
 */

export type FactSource =
  | "google_places"
  | "mock_places"
  | "website"
  | "tech_signature"
  | "review_analysis"
  | "owner"
  | "default"
  | "derived";

export type Confidence = "high" | "medium" | "low";

export interface Fact<T> {
  value: T | null;
  source: FactSource | null;
  confidence: Confidence | null;
  /** Short human-readable proof, e.g. "Google Business Profile" or a page URL. */
  evidence?: string;
  editable: boolean;
  /** True when Part 4 needs this and we couldn't find it — ask the owner. */
  needsOwnerInput?: boolean;
}

// ---------- Places ----------

export interface BusinessMatch {
  placeId: string;
  name: string;
  address: string;
  category: string | null;
  rating: number | null;
  reviewCount: number | null;
  provider: "google_places" | "mock";
}

export interface PostalAddress {
  formatted: string;
  street: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
  stateCode: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface SourceReview {
  id: string;
  source: "google" | "owner_pasted" | "mock";
  rating: number | null;
  text: string;
  author: string | null;
  /** Google requires attribution when displaying reviews. */
  authorUrl: string | null;
  publishedAt: string | null;
  relativeTime: string | null;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  address: PostalAddress;
  phone: string | null;
  website: string | null;
  /** e.g. ["Monday: 7:00 AM – 5:00 PM", ...] */
  hours: string[];
  rating: number | null;
  reviewCount: number | null;
  primaryType: string | null;
  primaryTypeLabel: string | null;
  types: string[];
  googleMapsUrl: string | null;
  businessStatus: string | null;
  reviews: SourceReview[];
  provider: "google_places" | "mock";
}

// ---------- Reviews ----------

export type ReviewThemeKey =
  | "missed_calls"
  | "no_callback"
  | "slow_response"
  | "hard_to_book"
  | "scheduling_delays"
  | "late_or_no_show"
  | "quote_delays"
  | "pricing_unclear"
  | "billing_problems"
  | "poor_communication"
  | "rude_service"
  | "praise_quality"
  | "praise_friendly"
  | "praise_responsive"
  | "praise_value";

export interface ThemeEvidence {
  reviewId: string;
  /** Exact text copied from the review. Never paraphrased. */
  quote: string;
  source: SourceReview["source"];
  rating: number | null;
  author: string | null;
}

export interface ReviewTheme {
  key: ReviewThemeKey;
  label: string;
  polarity: "complaint" | "praise";
  /** Number of distinct reviews mentioning this theme. */
  mentions: number;
  evidence: ThemeEvidence[];
  detectedBy: ("rules" | "llm")[];
}

export interface ReviewAnalysis {
  reviewCount: number;
  averageRating: number | null;
  bySource: { google: number; owner_pasted: number; mock: number };
  complaints: ReviewTheme[];
  praise: ReviewTheme[];
  method: "rules" | "rules+llm";
  limitations: string[];
}

// ---------- Website ----------

export type PageKind =
  | "home"
  | "contact"
  | "services"
  | "pricing"
  | "faq"
  | "booking"
  | "privacy"
  | "refund"
  | "terms"
  | "about"
  | "other";

export interface WebEvidence {
  url: string;
  /** Exact text or HTML marker found on the page. */
  snippet: string;
}

export interface Finding<T> {
  value: T;
  evidence: WebEvidence;
  method: "pattern" | "html" | "llm";
}

export interface ScannedPage {
  url: string;
  kind: PageKind;
  title: string | null;
  status: "scanned" | "blocked_by_robots" | "failed";
  error?: string;
}

export interface WebsiteAnalysis {
  requestedUrl: string;
  reachable: boolean;
  /** Why the scan could not run, in plain English. */
  problem: string | null;
  pages: ScannedPage[];
  pagesScanned: number;
  services: Finding<string>[];
  products: Finding<string>[];
  prices: Finding<{ amount: number; text: string }>[];
  hours: Finding<string>[];
  phones: Finding<string>[];
  emails: Finding<string>[];
  booking: { onlineBooking: boolean; evidence: WebEvidence | null; provider: string | null };
  contactForm: { present: boolean; evidence: WebEvidence | null };
  faq: { present: boolean; url: string | null; questions: string[] };
  policies: {
    privacy: { present: boolean; url: string | null };
    refund: { present: boolean; url: string | null };
    terms: { present: boolean; url: string | null };
  };
  /** Mentions like "call to book" or "call for a quote". */
  phoneOnlyCallsToAction: Finding<string>[];
  /** Mentions like "leave a message and we'll call you back next business day". */
  afterHoursMessages: Finding<string>[];
  method: "rules" | "rules+llm";
  limitations: string[];
}

// ---------- Technology ----------

export type TechCategory =
  | "pos_payments"
  | "ecommerce"
  | "website_builder"
  | "booking"
  | "field_service"
  | "accounting"
  | "restaurant"
  | "marketing"
  | "analytics"
  | "google";

export interface DetectedTech {
  id: string;
  /** Name as used by the recommendation catalog, e.g. "Square". */
  name: string;
  category: TechCategory;
  evidence: { url: string; matched: string; kind: "script" | "link" | "html" | "header" | "places" }[];
  /** "verified": a product-specific signature was found. */
  confidence: "verified";
}

export interface TechnologyReport {
  detected: DetectedTech[];
  /** Tools that usually can't be seen from outside — ask the owner. */
  askOwnerAbout: string[];
  limitations: string[];
}

// ---------- Owner inputs and the profile ----------

export const GOALS = ["more_customers", "save_time", "better_reviews", "get_paid_faster"] as const;
export type Goal = (typeof GOALS)[number];

export const CONSTRAINTS = ["no_recording", "no_contract", "spanish_required", "offline_required"] as const;
export type Constraint = (typeof CONSTRAINTS)[number];

export type TechComfort = "self_serve" | "needs_help";

export interface OwnerInputs {
  teamSize?: number;
  monthlyBudget?: number;
  goals?: Goal[];
  techComfort?: TechComfort;
  constraints?: Constraint[];
  /** Tools the owner says they use, by catalog name ("Square", "QuickBooks"). */
  currentTools?: string[];
  handlesHealthData?: boolean;
  handlesLargeCustomerList?: boolean;
  hasOutboundCallConsent?: boolean;
  /** Free text: "What eats most of your week?" */
  biggestTimeSink?: string;
  /** Problem keys the owner ticked, e.g. ["missed_inquiries"]. */
  reportedProblems?: string[];
}

export type IndustryKey =
  | "hvac"
  | "plumbing"
  | "electrical"
  | "landscaping"
  | "cleaning"
  | "auto_repair"
  | "restaurant"
  | "cafe"
  | "salon"
  | "retail"
  | "fitness"
  | "health_clinic"
  | "professional_services"
  | "farm"
  | "other";

export interface OnboardingProfile {
  profileId: string;
  schemaVersion: 1;
  business: {
    name: Fact<string>;
    industry: Fact<IndustryKey>;
    industryLabel: string;
    category: Fact<string>;
    address: Fact<PostalAddress>;
    phone: Fact<string>;
    email: Fact<string>;
    website: Fact<string>;
    hours: Fact<string[]>;
    rating: Fact<number>;
    reviewCount: Fact<number>;
    placeId: string | null;
    googleMapsUrl: string | null;
  };
  owner: {
    teamSize: Fact<number>;
    monthlyBudget: Fact<number>;
    goals: Fact<Goal[]>;
    techComfort: Fact<TechComfort>;
    constraints: Fact<Constraint[]>;
    handlesHealthData: Fact<boolean>;
    handlesLargeCustomerList: Fact<boolean>;
    hasOutboundCallConsent: Fact<boolean>;
    biggestTimeSink: Fact<string>;
    reportedProblems: Fact<string[]>;
  };
  technology: {
    detected: DetectedTech[];
    /** Final list in catalog naming: detected + owner-confirmed. */
    currentTools: Fact<string[]>;
    askOwnerAbout: string[];
  };
  dataSensitivity: { level: "low" | "medium" | "high"; reasons: string[] };
  sources: {
    places: "google_places" | "mock" | "none";
    website: "scanned" | "unreachable" | "blocked" | "none";
    reviews: { google: number; owner_pasted: number; mock: number };
  };
  /** Field paths Part 4 still needs from the owner, e.g. "owner.monthlyBudget". */
  missingForRecommendations: string[];
  confirmedAt: string | null;
}
