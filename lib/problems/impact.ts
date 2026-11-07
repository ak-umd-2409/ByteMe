import type { IndustryInfo } from "../business/industry.ts";
import type { ConfidenceLevel, ImpactEstimate, ImpactInput } from "./types.ts";

/**
 * Transparent financial impact calculator.
 *
 * - All arithmetic happens here, in code. The LLM never produces numbers.
 * - Every input says whether it came from the owner, a default, or a
 *   calculation, and owners can override any input within its allowed range.
 * - Results are "estimated opportunity", never "proven lost revenue".
 * - The low/high range varies only the uncertain rates (shares, percentages,
 *   hours) the owner hasn't supplied. Volumes and prices are things the owner
 *   knows, so they are shown as one number to replace, not a range.
 */
export const WEEKS_PER_MONTH = 4.33;

const OPPORTUNITY_LABEL = "Estimated opportunity — not proven lost revenue";
const TIME_LABEL = "Estimated value of time — not money already lost";

interface InputSpec {
  key: string;
  label: string;
  unit: ImpactInput["unit"];
  min: number;
  max: number;
  /** Default value and its uncertainty range. */
  default: (industry: IndustryInfo) => { value: number; low: number; high: number; note?: string };
}

interface ModelSpec {
  id: string;
  kind: ImpactEstimate["kind"];
  inputs: InputSpec[];
  /** Optional derived input computed from the others (shown, not editable unless overridden). */
  derived?: {
    key: string;
    label: string;
    unit: ImpactInput["unit"];
    min: number;
    max: number;
    from: (v: Record<string, number>) => number;
    note: string;
    /** Inputs that only feed the derived value (ignored when it's overridden). */
    feeds: string[];
  };
  compute: (v: Record<string, number>) => number;
  formula: string;
  calculation: (v: Record<string, number>, result: number) => string;
  assumptions: string[];
}

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
export const usd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;
const num = (x: number) => (Number.isInteger(x) ? String(x) : String(Math.round(x * 10) / 10));

const PLACEHOLDER = "Starting assumption — replace it with your own number.";

const weeklyInquiries: InputSpec = {
  key: "weekly_inquiries",
  label: "Customer calls, messages and requests per week",
  unit: "per_week",
  min: 0,
  max: 5_000,
  default: (i) => ({ value: i.defaults.weeklyInquiries, low: i.defaults.weeklyInquiries, high: i.defaults.weeklyInquiries, note: PLACEHOLDER }),
};
const averageJobValue: InputSpec = {
  key: "average_job_value",
  label: "Average job or order value",
  unit: "usd",
  min: 0,
  max: 100_000,
  default: (i) => ({ value: i.defaults.averageJobValue, low: i.defaults.averageJobValue, high: i.defaults.averageJobValue, note: PLACEHOLDER }),
};
const hourlyValue: InputSpec = {
  key: "hourly_value",
  label: "What an hour of your time is worth",
  unit: "usd_per_hour",
  min: 0,
  max: 1_000,
  default: (i) => ({ value: i.defaults.hourlyValueOfOwnerTime, low: i.defaults.hourlyValueOfOwnerTime, high: i.defaults.hourlyValueOfOwnerTime, note: PLACEHOLDER }),
};
const share = (key: string, label: string, value: number, low: number, high: number): InputSpec => ({
  key,
  label,
  unit: "percent",
  min: 0,
  max: 1,
  default: () => ({ value, low, high, note: PLACEHOLDER }),
});
const hours = (key: string, label: string, value: number, low: number, high: number): InputSpec => ({
  key,
  label,
  unit: "hours_per_week",
  min: 0,
  max: 80,
  default: () => ({ value, low, high, note: PLACEHOLDER }),
});

const timeModel = (id: string, hoursLabel: string, h: [number, number, number], s: [number, number, number]): ModelSpec => ({
  id,
  kind: "time_cost",
  inputs: [hours("hours_per_week", hoursLabel, ...h), share("automatable_share", "Share of that time a tool could save", ...s), hourlyValue],
  compute: (v) => v.hours_per_week * v.automatable_share * v.hourly_value * WEEKS_PER_MONTH,
  formula: "hours per week × share a tool could save × value of an hour × 4.33 weeks",
  calculation: (v, r) =>
    `${num(v.hours_per_week)} hours/week × ${pct(v.automatable_share)} saved × ${usd(v.hourly_value)}/hour × ${WEEKS_PER_MONTH} weeks = ${usd(r)}/month`,
  assumptions: ["A month has 4.33 weeks on average.", "Saved time is valued at what an hour of your time is worth to the business."],
});

export const MODELS: Record<string, ModelSpec> = {
  missed_inquiries: {
    id: "missed_inquiries",
    kind: "revenue_opportunity",
    inputs: [
      weeklyInquiries,
      share("missed_share", "Share of them that go unanswered", 0.15, 0.08, 0.25),
      share("conversion_rate", "Share of missed customers who would have hired you", 0.25, 0.15, 0.35),
      averageJobValue,
    ],
    derived: {
      key: "missed_per_week",
      label: "Missed inquiries per week",
      unit: "per_week",
      min: 0,
      max: 5_000,
      from: (v) => v.weekly_inquiries * v.missed_share,
      note: "Calculated from inquiries × share unanswered. Enter your own count if you know it.",
      feeds: ["weekly_inquiries", "missed_share"],
    },
    compute: (v) => v.missed_per_week * v.conversion_rate * v.average_job_value * WEEKS_PER_MONTH,
    formula: "missed inquiries per week × share who would have hired you × average job value × 4.33 weeks",
    calculation: (v, r) =>
      `${num(v.missed_per_week)} missed inquiries/week × ${pct(v.conversion_rate)} would have hired you × ${usd(v.average_job_value)} average job × ${WEEKS_PER_MONTH} weeks = ${usd(r)}/month`,
    assumptions: ["A month has 4.33 weeks on average.", "Customers who don't reach you hire someone else instead of trying again."],
  },
  slow_responses: {
    id: "slow_responses",
    kind: "revenue_opportunity",
    inputs: [
      weeklyInquiries,
      share("slow_share", "Share of messages answered slowly (next day or later)", 0.2, 0.1, 0.3),
      share("lost_share", "Share of slowly answered customers who go elsewhere", 0.2, 0.1, 0.3),
      averageJobValue,
    ],
    compute: (v) => v.weekly_inquiries * v.slow_share * v.lost_share * v.average_job_value * WEEKS_PER_MONTH,
    formula: "inquiries per week × share answered slowly × share who go elsewhere × average job value × 4.33 weeks",
    calculation: (v, r) =>
      `${num(v.weekly_inquiries)} inquiries/week × ${pct(v.slow_share)} answered slowly × ${pct(v.lost_share)} go elsewhere × ${usd(v.average_job_value)} × ${WEEKS_PER_MONTH} weeks = ${usd(r)}/month`,
    assumptions: ["A month has 4.33 weeks on average.", "Faster replies would have kept those customers."],
  },
  no_online_booking: {
    id: "no_online_booking",
    kind: "revenue_opportunity",
    inputs: [
      weeklyInquiries,
      share("online_preference", "Share of customers who'd rather book online", 0.15, 0.05, 0.25),
      share("give_up_share", "Share of those who give up when they have to call", 0.3, 0.15, 0.45),
      averageJobValue,
    ],
    compute: (v) => v.weekly_inquiries * v.online_preference * v.give_up_share * v.average_job_value * WEEKS_PER_MONTH,
    formula: "inquiries per week × share preferring online booking × share who give up × average job value × 4.33 weeks",
    calculation: (v, r) =>
      `${num(v.weekly_inquiries)} inquiries/week × ${pct(v.online_preference)} prefer online × ${pct(v.give_up_share)} give up × ${usd(v.average_job_value)} × ${WEEKS_PER_MONTH} weeks = ${usd(r)}/month`,
    assumptions: ["A month has 4.33 weeks on average.", "Customers who give up don't call back later."],
  },
  follow_up: {
    id: "follow_up",
    kind: "revenue_opportunity",
    inputs: [
      {
        key: "monthly_customers",
        label: "Customers served per month",
        unit: "per_month",
        min: 0,
        max: 100_000,
        default: (i) => {
          const value = Math.round(i.defaults.weeklyInquiries * 0.5 * WEEKS_PER_MONTH);
          return { value, low: value, high: value, note: PLACEHOLDER };
        },
      },
      share("repeat_lift", "Extra share of past customers who return when reminded", 0.05, 0.02, 0.08),
      averageJobValue,
    ],
    compute: (v) => v.monthly_customers * v.repeat_lift * v.average_job_value,
    formula: "customers per month × extra share who return when reminded × average job value",
    calculation: (v, r) =>
      `${num(v.monthly_customers)} customers/month × ${pct(v.repeat_lift)} extra return × ${usd(v.average_job_value)} = ${usd(r)}/month`,
    assumptions: ["Reminders bring back a small share of past customers each month."],
  },
  time_cost_quotes: timeModel("time_cost_quotes", "Hours per week spent writing quotes", [3, 1, 6], [0.5, 0.3, 0.7]),
  time_cost_scheduling: timeModel("time_cost_scheduling", "Hours per week spent on scheduling", [3, 1, 5], [0.5, 0.3, 0.7]),
  time_cost_admin: timeModel("time_cost_admin", "Hours per week on invoices, receipts and data entry", [5, 2, 8], [0.4, 0.25, 0.6]),
};

export type ImpactOverrides = Record<string, number>;

export type ImpactResult = { ok: true; estimate: ImpactEstimate } | { ok: false; errors: string[] };

/** Validate owner overrides for a model: known keys, finite, within range. */
export function validateOverrides(modelId: string, overrides: ImpactOverrides): string[] {
  const model = MODELS[modelId];
  if (!model) return [`Unknown impact model: ${modelId}`];
  const specs = new Map<string, { min: number; max: number; label: string }>(model.inputs.map((s) => [s.key, s]));
  if (model.derived) specs.set(model.derived.key, model.derived);
  const errors: string[] = [];
  for (const [key, value] of Object.entries(overrides)) {
    const spec = specs.get(key);
    if (!spec) errors.push(`${key}: not an input of this calculation`);
    else if (typeof value !== "number" || !Number.isFinite(value)) errors.push(`${key}: must be a number`);
    else if (value < spec.min || value > spec.max) errors.push(`${key}: must be between ${spec.min} and ${spec.max}`);
  }
  return errors;
}

const confidenceFor = (ownerShare: number): ConfidenceLevel => (ownerShare >= 0.75 ? "high" : ownerShare >= 0.34 ? "medium" : "low");

export function calculateImpact(modelId: string, industry: IndustryInfo, overrides: ImpactOverrides = {}): ImpactResult {
  const errors = validateOverrides(modelId, overrides);
  if (errors.length) return { ok: false, errors };
  const model = MODELS[modelId];

  const inputs: ImpactInput[] = [];
  const expected: Record<string, number> = {};
  const low: Record<string, number> = {};
  const high: Record<string, number> = {};
  const derivedOverridden = model.derived ? overrides[model.derived.key] !== undefined : false;

  for (const spec of model.inputs) {
    // Inputs that only feed an overridden derived value don't matter any more.
    if (derivedOverridden && model.derived!.feeds.includes(spec.key)) continue;
    const def = spec.default(industry);
    const own = overrides[spec.key];
    const value = own ?? def.value;
    expected[spec.key] = value;
    // Lower/higher input values can mean a lower/higher result; all models here are monotonic increasing.
    low[spec.key] = own ?? def.low;
    high[spec.key] = own ?? def.high;
    inputs.push({
      key: spec.key,
      label: spec.label,
      value,
      unit: spec.unit,
      source: own !== undefined ? "owner" : "default",
      min: spec.min,
      max: spec.max,
      ...(own === undefined ? { low: def.low, high: def.high, note: def.note } : {}),
    });
  }
  if (model.derived) {
    const d = model.derived;
    const own = overrides[d.key];
    expected[d.key] = own ?? d.from(expected);
    low[d.key] = own ?? d.from(low);
    high[d.key] = own ?? d.from(high);
    inputs.push({
      key: d.key,
      label: d.label,
      value: Math.round(expected[d.key] * 10) / 10,
      unit: d.unit,
      source: own !== undefined ? "owner" : "derived",
      min: d.min,
      max: d.max,
      ...(own === undefined ? { note: d.note } : {}),
    });
  }

  const round = (x: number) => Math.round(x);
  const result = round(model.compute(expected));
  const editable = inputs.filter((i) => i.source !== "derived");
  const ownerInputShare = editable.length ? editable.filter((i) => i.source === "owner").length / editable.length : 0;
  return {
    ok: true,
    estimate: {
      model: model.id,
      kind: model.kind,
      label: model.kind === "revenue_opportunity" ? OPPORTUNITY_LABEL : TIME_LABEL,
      inputs,
      assumptions: [...model.assumptions, ...(ownerInputShare < 1 ? ["Inputs marked “starting assumption” are placeholders, not data about your business."] : [])],
      formula: model.formula,
      calculation: model.calculation(expected, result),
      monthly: { expected: result, low: round(model.compute(low)), high: round(model.compute(high)) },
      confidence: confidenceFor(ownerInputShare),
      ownerInputShare: Math.round(ownerInputShare * 100) / 100,
    },
  };
}
