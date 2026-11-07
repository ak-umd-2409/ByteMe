/**
 * Spec 3.3 — "Pays for itself in X days". Deterministic, server-side.
 * Uses the same impact estimate the owner sees (with their own numbers if they gave any)
 * and a tool's all-in monthly price. Always labelled an estimate.
 */
import { industryInfo } from "../business/industry.ts";
import type { IndustryKey } from "../business/types.ts";
import { PROBLEMS } from "./catalog.ts";
import { calculateImpact, usd } from "./impact.ts";
import type { ProblemKey } from "./types.ts";

export interface PaybackItem {
  problemKey: ProblemKey;
  monthlyCost: number;
}

export interface PaybackResult {
  problemKey: ProblemKey;
  monthlyCost: number;
  monthlyValue: number | null;
  kind: "revenue_opportunity" | "time_cost" | null;
  /** Days for the estimated value to cover one month of the tool. Null when it can't be estimated. */
  days: number | null;
  label: string;
  math: string | null;
}

const DAYS_PER_MONTH = 30;

export function paybackFor(item: PaybackItem, industry: IndustryKey, overrides: Record<string, number> = {}): PaybackResult {
  const model = PROBLEMS[item.problemKey]?.impactModel;
  const base = { problemKey: item.problemKey, monthlyCost: item.monthlyCost };
  if (!model) return { ...base, monthlyValue: null, kind: null, days: null, label: "No $ estimate for this problem", math: null };
  const result = calculateImpact(model, industryInfo(industry), overrides);
  if (!result.ok) return { ...base, monthlyValue: null, kind: null, days: null, label: "Couldn't estimate with these numbers", math: null };
  const value = result.estimate.monthly.expected;
  const kind = result.estimate.kind;
  if (value <= 0) return { ...base, monthlyValue: value, kind, days: null, label: "Estimated value is $0", math: null };
  if (item.monthlyCost <= 0) return { ...base, monthlyValue: value, kind, days: 0, label: "Free, so nothing to pay back", math: null };
  const perDay = value / DAYS_PER_MONTH;
  const days = Math.max(1, Math.ceil(item.monthlyCost / perDay));
  const what = kind === "time_cost" ? "in time saved" : "in won business";
  return {
    ...base,
    monthlyValue: value,
    kind,
    days,
    label: days > DAYS_PER_MONTH ? `Takes longer than a month to pay back (est.)` : `Could pay for itself in about ${days} day${days === 1 ? "" : "s"} (est.)`,
    math: `${usd(item.monthlyCost)}/mo ÷ (${usd(value)}/mo ${what} ÷ ${DAYS_PER_MONTH} days) ≈ ${days} day${days === 1 ? "" : "s"}`,
  };
}
