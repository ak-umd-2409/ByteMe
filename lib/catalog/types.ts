/**
 * The catalog record: everything we know about one AI tool, filled once and
 * reused for every owner. See docs/specs/b-catalog-and-safety.md §1.
 *
 * "unknown" means we could not confirm the value from a public source. Every
 * field holding "unknown" must also be listed in `needsVerification`.
 */
import type { IndustryKey } from "../business/types.ts";
import type { UseCase } from "../recommend/types.ts";

export type Unknown = "unknown";
export type Badge = "verified" | "listed" | "blocked";
export type CheckResult = "pass" | "fail" | "unknown";
/** Safety Check outcome. Only "ready" tools can be approved to verified. */
export type Verdict = "blocked" | "held" | "ready";

export interface Evidence {
  quote?: string;
  url: string;
  checkedAt: string;
}

export interface SafetyCheckItem {
  result: CheckResult;
  reason: string;
  evidence: Evidence[];
}

export type SafetyCheckName =
  | "whoIsBehind"
  | "domainAge"
  | "privacyPolicy"
  | "dataUse"
  | "dataLocation"
  | "pricingClarity"
  | "securityBasics"
  | "redFlags";

export const SAFETY_CHECK_NAMES: readonly SafetyCheckName[] = [
  "whoIsBehind",
  "domainAge",
  "privacyPolicy",
  "dataUse",
  "dataLocation",
  "pricingClarity",
  "securityBasics",
  "redFlags",
];

export interface SafetyReport {
  ranAt: string;
  checks: Record<SafetyCheckName, SafetyCheckItem>;
  /** Plain-English reasons a tool was auto-blocked. Empty when none. */
  redFlags: string[];
  /** blocked = any red flag; held = a core check isn't pass; ready = all core checks pass. */
  verdict: Verdict;
  /** Plain-English notes for warning checks that didn't pass. Never block a tool. */
  warnings: string[];
}

export interface PriceTier {
  monthlyUsd: number | Unknown;
  note: string;
}

export interface Pricing {
  asOf: "Nov 2026";
  small: PriceTier;
  medium: PriceTier;
  large: PriceTier;
  freeTier: boolean | Unknown;
  contract: "monthly" | "annual" | Unknown;
  cancellation: string;
  pricingUrl: string;
}

export interface WorksWith {
  product: string;
  type: "native" | "zapier" | "none";
}

export type PrivacyKey =
  | "trainsOnYourData"
  | "canDeleteData"
  | "whereStored"
  | "sharesOrSells"
  | "securityCertification";

export const PRIVACY_KEYS: readonly PrivacyKey[] = [
  "trainsOnYourData",
  "canDeleteData",
  "whereStored",
  "sharesOrSells",
  "securityCertification",
];

export interface PrivacyAnswer {
  /** "yes" | "no" | "unknown", or short text such as "United States". */
  answer: string;
  /** One plain-English sentence for owners. */
  plain: string;
  /** Exact sentence from the vendor's policy. Required unless answer is "unknown". */
  quote: string | null;
  sourceUrl: string | null;
}

export type RulesFlagKey =
  | "recordsCalls"
  | "announcesRecording"
  | "hipaaReady"
  | "outboundAiCalls"
  | "personalizedPricing";

export const RULES_FLAG_KEYS: readonly RulesFlagKey[] = [
  "recordsCalls",
  "announcesRecording",
  "hipaaReady",
  "outboundAiCalls",
  "personalizedPricing",
];

export interface CatalogRecord {
  id: string;
  name: string;
  vendor: { company: string; website: string; domain: string };
  description: string;
  category: string;
  useCases: UseCase[];
  industries: (IndustryKey | "any")[];
  /** Set when this is an AI feature inside a tool owners already use. */
  existingProduct?: string;
  pricing: Pricing;
  worksWith: WorksWith[];
  setupMinutes: number | Unknown;
  setupMode: "self_serve" | "needs_help";
  languages: string[];
  privacyCard: Record<PrivacyKey, PrivacyAnswer>;
  rulesFlags: Record<RulesFlagKey, boolean | Unknown>;
  reviews?: { rating: number; count: number; source: string };
  badge: Badge;
  reviewedAt?: string;
  reviewedBy?: string;
  safetyCheck: SafetyReport;
  lastChecked: string;
  sources: string[];
  needsVerification: string[];
  /** Fictional demo tool. Always on a .example domain. */
  sample?: true;
}
