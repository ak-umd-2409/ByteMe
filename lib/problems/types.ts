/**
 * Part 3 — Problem Discovery and Financial Impact: shared types.
 *
 * Rules that the types encode:
 * - Every problem lists the signals behind it, each with its source.
 * - `verified` signals are things we directly observed (an exact review quote,
 *   a fact on a scanned page, a Google listing field, the owner's own words).
 * - A problem with no verified signal is a `hypothesis`, never "confirmed".
 * - Money figures come only from `ImpactEstimate`, computed in code.
 */
import type { UseCase } from "../recommend/types.ts";

export const PROBLEM_KEYS = [
  "missed_inquiries",
  "slow_responses",
  "no_online_booking",
  "scheduling_inefficiency",
  "slow_quotes",
  "poor_review_management",
  "no_customer_follow_up",
  "repetitive_admin",
  "inconsistent_business_info",
] as const;
export type ProblemKey = (typeof PROBLEM_KEYS)[number];

export type EvidenceSource =
  | "google_review"
  | "pasted_review"
  | "sample_review"
  | "website"
  | "google_profile"
  | "tech_stack"
  | "owner_reported"
  | "industry_pattern";

export interface Signal {
  id: string;
  problem: ProblemKey;
  source: EvidenceSource;
  /** Plain-English description of what we saw. */
  observation: string;
  /** Exact quoted text, when the evidence is text. */
  quote: string | null;
  /** Where to find it: review id, page URL, or profile field. */
  reference: { reviewId?: string; url?: string; field?: string } | null;
  /** 0–1: how strongly this signal points to the problem. */
  weight: number;
  /** Directly observed (true) vs inferred from patterns (false). */
  verified: boolean;
}

export type ProblemStatus = "confirmed" | "likely" | "hypothesis";
export type ConfidenceLevel = "high" | "medium" | "low";

export interface ImpactInput {
  key: string;
  label: string;
  value: number;
  unit: "per_week" | "percent" | "usd" | "hours_per_week" | "usd_per_hour" | "per_month";
  source: "owner" | "default" | "derived";
  /** Allowed range for owner adjustments. */
  min: number;
  max: number;
  /** For default values: the low/high values used for the range. */
  low?: number;
  high?: number;
  note?: string;
}

export interface ImpactEstimate {
  model: string;
  kind: "revenue_opportunity" | "time_cost";
  /** Always shown with the number. */
  label: string;
  inputs: ImpactInput[];
  assumptions: string[];
  formula: string;
  /** Human-readable arithmetic, e.g. "8 × 25% × $300 × 4.33 = $2,598". */
  calculation: string;
  monthly: { expected: number; low: number; high: number };
  confidence: ConfidenceLevel;
  /** Share of inputs the owner supplied (0–1). */
  ownerInputShare: number;
}

export interface RankBreakdown {
  evidence: number;
  confidence: number;
  impact: number;
  relevance: number;
}

export interface ProblemCard {
  id: string;
  key: ProblemKey;
  title: string;
  explanation: string;
  category: { key: string; label: string };
  /** Part 4 use case, or null when no tool category fits. */
  useCase: UseCase | null;
  status: ProblemStatus;
  confidence: { level: ConfidenceLevel; score: number; reason: string };
  /** Verified signals first. */
  evidence: Signal[];
  signalCount: number;
  verifiedSignalCount: number;
  independentSources: EvidenceSource[];
  impact: ImpactEstimate | null;
  /** Why there is no money estimate, when `impact` is null. */
  impactNote: string | null;
  rank: { position: number; score: number; breakdown: RankBreakdown; explanation: string[] };
  /** Hypotheses ask the owner to confirm before recommendations use them. */
  needsOwnerConfirmation: boolean;
  explanationSource: "template" | "llm";
}

export interface DiscoveryResult {
  businessName: string;
  generatedAt: string;
  problems: ProblemCard[];
  /** Totals across confirmed + likely problems only. */
  summary: {
    confirmed: number;
    likely: number;
    hypotheses: number;
    /** Sum of revenue opportunities (may overlap; see limitations). */
    estimatedMonthlyOpportunity: { expected: number; low: number; high: number };
    /** Sum of time-cost estimates, kept separate from revenue. */
    estimatedMonthlyTimeValue: { expected: number; low: number; high: number };
  };
  disclaimer: string;
  limitations: string[];
}
