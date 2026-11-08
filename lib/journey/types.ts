/**
 * The owner journey: find → understand → confirm a few things → what's holding you back → how we help.
 *
 * This is the UI-facing contract (see docs/JOURNEY_API.md). Everything here is short,
 * plain-English and already prioritised, so a screen can render it without deciding
 * what to hide. Internal detail (rank weights, confidence scores, rules, demographics)
 * stays in the older Part 2/3 endpoints.
 */
import type { ProblemKey } from "../problems/types.ts";
import type { RecommendationRequest } from "../problems/toRecommendation.ts";
import type { UseCase } from "../recommend/types.ts";

/** An answer: one choice, several choices, a number, free text, or null (skipped). */
export type Answer = string | string[] | number | null;
export type Answers = Record<string, Answer>;

export interface SourceLink {
  label: string;
  url: string | null;
}

// ---------- Step 2: what we learned ----------

/** One line of "Is this right?" (screen 3). */
export interface BusinessFact {
  id: "name" | "type" | "address" | "phone" | "website" | "hours";
  label: string;
  /** Null = "We couldn't find this". */
  value: string | null;
  /** "From Google", "Your website", "Public listings", "You told us"… Null when missing. */
  source: string | null;
  /** Edit with the answer id `edit.<id>` (free text). "type" isn't editable here. */
  editable: boolean;
}

/** "What customers say" (screen 3). Exact excerpts only, always with who said it and where. */
export interface CustomersSay {
  reviewCount: number;
  themes: {
    key: string;
    label: string;
    polarity: "complaint" | "praise";
    /** "from 3 of 14 reviews" */
    countLabel: string;
    example: { text: string; isQuote: boolean; who: string | null; where: string | null; url: string | null } | null;
  }[];
  /** e.g. "Google only shares 5 reviews, so this is a small sample." */
  note: string | null;
}

export interface BusinessCard {
  name: string;
  /** "HVAC · Jefferson, MD" */
  subtitle: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  /** Shown only when listings agree, or the owner picked the right value. */
  hours: string | null;
  /** Only a rating published by Google or a review site, never an average of the handful of reviews we read. */
  rating: { value: number; count: number | null; from: string } | null;
  /** The same details as a checklist with where each came from. */
  facts: BusinessFact[];
}

export interface LearnedItem {
  id: string;
  /** One plain sentence. */
  text: string;
  kind: "reviews" | "website" | "listings" | "tools";
  sources: SourceLink[];
}

// ---------- Step 3: a few questions ----------

export interface QuestionOption {
  value: string;
  label: string;
  /** Short context under the option, e.g. "6 reviews say you respond quickly". */
  hint?: string;
}

export interface JourneyQuestion {
  id: string;
  kind: "single" | "multi" | "number" | "text";
  text: string;
  /** One line: why we ask. Shown under the question. */
  why: string;
  options?: QuestionOption[];
  /** For multi: the most options the owner may pick. */
  maxSelect?: number;
  /** Pre-filled answer (e.g. tools we already saw). null = nothing pre-selected. */
  default: Answer;
  /** What we do if the owner skips it. Every question can be skipped. */
  ifSkipped: string;
  /** false = main flow; true = can sit behind "More preferences". */
  optional: boolean;
  /** Show only when another question's answer includes one of these values. */
  showIf?: { questionId: string; includesAny: string[] };
  /** For number questions. */
  unit?: "usd" | "per_week" | "per_month" | "hours_per_week";
  min?: number;
  max?: number;
  placeholder?: string;
  /** What the answer changes. */
  affects: ("problems" | "recommendations" | "estimate" | "next_step")[];
  /** A source behind the "why", when it rests on a rule or a finding. */
  source?: SourceLink;
}

// ---------- Step 4: what's holding you back ----------

export interface EvidenceItem {
  /** Short heading for the finding, when there is one ("Your hours are different on different sites"). */
  title: string | null;
  text: string;
  /** True when `text` is an exact excerpt (show quotation marks). */
  isQuote: boolean;
  /** "Angi review", "Your website", "You told us". */
  sourceLabel: string;
  url: string | null;
  /** Every page that shows it, e.g. each listing involved in a mismatch. */
  links: SourceLink[];
  /** false = we inferred it (e.g. a tool we didn't find), not something we saw directly. */
  observed: boolean;
}

export type OpportunityStatus = "confirmed" | "likely" | "unverified";

export interface ImpactView {
  monthly: { low: number; expected: number; high: number };
  kind: "revenue_opportunity" | "time_cost";
  /** "Money you may be missing each month (estimate)" */
  label: string;
  /** "4 missed calls/week × 25% would have hired you × $400 × 4.33 weeks = $1,732/month" */
  math: string;
  yourNumbers: { label: string; value: number; unit: string }[];
  /** Industry assumptions still in the math, each named so the owner can see them. */
  assumed: { label: string; value: number; unit: string }[];
}

export interface Opportunity {
  id: string;
  problemKey: ProblemKey;
  /** 1 = most important. */
  rank: number;
  /** One simple sentence. */
  headline: string;
  whyItMatters: string;
  status: OpportunityStatus;
  /** "You confirmed this", "Seen in 4 public listings", "Seen on your website". */
  statusLabel: string;
  basis: "you" | "public" | "you_and_public";
  /** Up to 3, observed first. */
  evidence: EvidenceItem[];
  moreEvidence: number;
  /** What argues against it, shown honestly. */
  counterEvidence: string | null;
  fix: { kind: "free" | "tool"; label: string; nextStep: string };
  useCase: UseCase | null;
  /** Null until the owner gives the numbers it needs; never estimated from defaults alone. */
  impact: ImpactView | null;
  /** Why there's no estimate, in one line, when `impact` is null. */
  impactNote: string | null;
  /** Follow-up question ids that would unlock `impact`. */
  impactNeeds: string[];
  /** Overlapping problems folded into this one. */
  alsoCovers: { problemKey: ProblemKey; headline: string }[];
}

export interface Brief {
  problemKey: ProblemKey;
  headline: string;
  statusLabel: string;
}

// ---------- Responses ----------

export interface JourneyStartResponse {
  context: string;
  business: BusinessCard;
  learned: LearnedItem[];
  /** "We found 2 things worth a look. A few quick questions will sharpen this." */
  headline: string;
  questions: JourneyQuestion[];
  customersSay: CustomersSay;
  /** Tools we could see, with where we saw them. */
  toolsFound: { name: string; url: string | null }[];
  sources: { count: number; list: SourceLink[] };
  /** capturedAt is set for saved public snapshots ("read from public pages saved on …"). */
  mode: { places: string; sampleData: boolean; capturedAt: string | null };
}

export interface JourneyAnswerResponse {
  context: string;
  /** Same card as /start, updated with anything the owner corrected (e.g. the right hours). */
  business: BusinessCard;
  headline: string;
  /** Top 2–3, deduplicated. */
  opportunities: Opportunity[];
  /** Other evidence-backed problems, one line each. */
  alsoNoticed: Brief[];
  /** Unverified: the owner skipped or said "not sure". Not used for recommendations. */
  toCheck: Brief[];
  /** Optional questions that unlock dollar estimates for the top opportunities (max 3). */
  followUps: JourneyQuestion[];
  /** What the owner told us, in plain words, so they can change it. */
  youToldUs: { questionId: string; label: string; value: string }[];
  /** Values we assumed because a question was skipped. */
  assumptions: { questionId: string; text: string }[];
  recommendation:
    | { ready: true; request: RecommendationRequest; focus: ProblemKey[] }
    | { ready: false; reason: string };
  /** Free local help for setup: the Maryland SBDC office serving the business's county (null if unknown). */
  localHelp: { name: string; county: string; url: string; phone: string | null } | null;
  /** The monthly budget behind the recommendations, and whether we assumed it because the owner skipped it. */
  budget: { value: number; assumed: boolean };
  /** Answers we couldn't use, with a reason (unknown id, out-of-range number…). */
  ignored: { questionId: string; reason: string }[];
}
