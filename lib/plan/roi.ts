/**
 * Cost and payback for the owner's chosen tools (Plan stage).
 *
 * All arithmetic is here, in code: no AI numbers. Rules:
 * - Never invent a price. A price we don't hold is "Not published" and is left out of totals.
 * - Every price carries a label, its source page and the date it was checked.
 * - Money from new business and the value of time saved are kept apart, and only part of the
 *   saved time is counted as money (the owner can change that share).
 * - Setup time counts as a one-time cost.
 * - When we don't know what the problem costs, we say so instead of showing a payback figure.
 */
import type { CatalogRecord } from "../catalog/types.ts";

export type PriceLabel = "verified" | "starting" | "estimated" | "quote" | "unavailable";

export const PRICE_LABEL: Record<PriceLabel, string> = {
  verified: "Verified public price",
  starting: "Starting price",
  estimated: "Estimated",
  quote: "Custom quote",
  unavailable: "Not published",
};

export interface ToolPrice {
  label: PriceLabel;
  /** Per month, in USD. Null when we don't hold a confirmed price. */
  monthly: number | null;
  /** Plan name from the vendor's page ("Starter plan"), or "" when not named. */
  plan: string;
  /** "yearly" when the listed price needs a yearly contract. */
  billing: "monthly" | "yearly" | "unknown";
  freePlan: "yes" | "no" | "unknown";
  sourceUrl: string | null;
  checked: string;
  /** Pricing facts we couldn't confirm, in plain words. */
  notConfirmed: string[];
}

/** One tool's price, labelled, from its catalog card only. */
export function priceOf(r: CatalogRecord): ToolPrice {
  const tier = r.pricing.small;
  const monthly = tier.monthlyUsd === "unknown" ? null : tier.monthlyUsd;
  const note = tier.note.trim();
  const label: PriceLabel = r.sample
    ? "estimated"
    : monthly === null
      ? /quote|contact sales|custom/i.test(note)
        ? "quote"
        : "unavailable"
      : /cheapest|starter|from|starting/i.test(note)
        ? "starting"
        : "verified";
  const billing = r.pricing.contract === "annual" ? "yearly" : r.pricing.contract === "monthly" ? "monthly" : "unknown";
  const notConfirmed = [
    "setup fee",
    r.pricing.freeTier === "unknown" ? "free plan or trial" : null,
    "price per extra user",
    "usage limits and overage charges",
    billing === "unknown" ? "monthly or yearly billing" : null,
  ].filter((x): x is string => Boolean(x));
  return {
    label,
    monthly,
    plan: note.replace(/\.$/, ""),
    billing,
    freePlan: r.pricing.freeTier === "unknown" ? "unknown" : r.pricing.freeTier ? "yes" : "no",
    sourceUrl: r.sample ? null : r.pricing.pricingUrl || null,
    checked: r.pricing.asOf,
    notConfirmed,
  };
}

export interface CostTotals {
  monthly: number;
  firstYear: number;
  /** Tools whose price we don't hold, so the totals leave them out. */
  missing: string[];
}

export function totals(tools: CatalogRecord[]): CostTotals {
  let monthly = 0;
  const missing: string[] = [];
  for (const r of tools) {
    const p = priceOf(r).monthly;
    if (p === null) missing.push(r.name);
    else monthly += p;
  }
  return { monthly: round2(monthly), firstYear: round2(monthly * 12), missing };
}

// ---------------------------------------------------------------- payback

export type Scenario = "conservative" | "expected" | "optimistic";
export const SCENARIOS: Scenario[] = ["conservative", "expected", "optimistic"];

export interface PaybackInput {
  /** What the problem costs each month, low/expected/high. Null = we don't know. */
  problemMonthly: { low: number; expected: number; high: number } | null;
  /** New business the owner may be missing, or the value of the owner's time. */
  kind: "revenue_opportunity" | "time_cost";
  /** Tool cost per month. Null = no confirmed price. */
  toolMonthly: number | null;
  /** How much of the problem the tool fixes, per scenario (0–1). */
  fixShare: Record<Scenario, number>;
  /** Hours to set the tool up (one-time). */
  setupHours: number;
  /** What an hour of the owner's time is worth. */
  hourlyValue: number;
  /** For time_cost: share of saved time that really turns into money (0–1). */
  timeToMoney: number;
}

export const DEFAULT_FIX_SHARE: Record<Scenario, number> = { conservative: 0.25, expected: 0.5, optimistic: 0.75 };
export const DEFAULT_SETUP_HOURS = 3;
export const DEFAULT_TIME_TO_MONEY = 0.5;

export interface ScenarioResult {
  scenario: Scenario;
  /** Extra money from new business each month. */
  revenue: number;
  /** Value of the time saved each month (before the time-to-money share). */
  timeValue: number;
  /** Hours saved each month, when the problem is about time. */
  hoursSaved: number | null;
  /** What we count as money each month: revenue + the share of time value. */
  counted: number;
  toolMonthly: number;
  net: number;
  oneTime: number;
  /** Days until the one-time setup cost is paid back. Null when it never pays back at these numbers. */
  paybackDays: number | null;
}

export type Payback =
  | { ok: true; scenarios: ScenarioResult[]; steps: string[] }
  | { ok: false; reason: string };

const clamp01 = (x: number) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));
const pos = (x: number) => Math.max(0, Number.isFinite(x) ? x : 0);
const round2 = (x: number) => Math.round(x * 100) / 100;
const usd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
export const DAYS_PER_MONTH = 30.4;

export function payback(input: PaybackInput): Payback {
  if (!input.problemMonthly) return { ok: false, reason: "We don't know yet what this problem costs you, so we won't guess a payback. Add your own number to see one." };
  if (input.toolMonthly === null) return { ok: false, reason: "This tool's price isn't published, so we can't work out a payback. Ask the company for a written price." };
  const base = { conservative: input.problemMonthly.low, expected: input.problemMonthly.expected, optimistic: input.problemMonthly.high };
  const hourly = pos(input.hourlyValue);
  const toolMonthly = pos(input.toolMonthly);
  const oneTime = pos(input.setupHours) * hourly;
  const timeToMoney = clamp01(input.timeToMoney);
  const scenarios = SCENARIOS.map((sc): ScenarioResult => {
    const fixed = pos(base[sc]) * clamp01(input.fixShare[sc]);
    const revenue = input.kind === "revenue_opportunity" ? fixed : 0;
    const timeValue = input.kind === "time_cost" ? fixed : 0;
    const counted = revenue + timeValue * timeToMoney;
    const net = counted - toolMonthly;
    const paybackDays = net <= 0 ? null : oneTime === 0 ? 0 : Math.ceil((oneTime / net) * DAYS_PER_MONTH);
    return {
      scenario: sc,
      revenue: round2(revenue),
      timeValue: round2(timeValue),
      hoursSaved: input.kind === "time_cost" && hourly > 0 ? Math.round((timeValue / hourly) * 10) / 10 : null,
      counted: round2(counted),
      toolMonthly,
      net: round2(net),
      oneTime: round2(oneTime),
      paybackDays,
    };
  });
  const e = scenarios[1]!;
  const steps = [
    `What the problem costs you: about ${usd(base.expected)} a month (range ${usd(base.conservative)}–${usd(base.optimistic)}).`,
    `How much the tool fixes: ${pct(input.fixShare.conservative)} if it helps a little, ${pct(input.fixShare.expected)} expected, ${pct(input.fixShare.optimistic)} if it helps a lot. These are our assumptions: change them.`,
    input.kind === "time_cost"
      ? `This problem is about your time. We count only ${pct(timeToMoney)} of the time saved as money, because not every saved hour turns into paid work. Expected: ${usd(e.timeValue)} of time × ${pct(timeToMoney)} = ${usd(e.counted)} a month.`
      : `This problem is about business you may be missing. Expected: ${usd(base.expected)} × ${pct(input.fixShare.expected)} = ${usd(e.revenue)} a month. This is possible, not promised.`,
    `Minus the tool: ${usd(toolMonthly)} a month. Expected net: ${usd(e.net)} a month.`,
    `Setup: ${input.setupHours} hours × ${usd(hourly)} an hour = ${usd(oneTime)} once.`,
    e.paybackDays === null ? "At the expected numbers it doesn't pay for itself." : `Payback: ${usd(oneTime)} ÷ ${usd(e.net)} a month × ${DAYS_PER_MONTH} days = about ${e.paybackDays} days.`,
  ];
  return { ok: true, scenarios, steps };
}

/** "about 12 days", "right away", "doesn't pay back at these numbers". */
export function paybackWords(days: number | null): string {
  if (days === null) return "Doesn't pay back at these numbers";
  if (days === 0) return "Right away";
  if (days <= 60) return `About ${days} days`;
  return `About ${Math.round(days / DAYS_PER_MONTH)} months`;
}

/** Each chosen tool's labelled price plus totals, for a plan (used by the shared view and the printed report). */
export function costSummary(
  plan: { sections: { heading: string; tool: { id: string } | null }[] },
  catalog: CatalogRecord[],
): { tools: { id: string; name: string; heading: string; price: ToolPrice }[]; totals: CostTotals } {
  const byId = new Map(catalog.map((r) => [r.id, r]));
  const rows = plan.sections
    .map((sec) => ({ sec, r: sec.tool ? byId.get(sec.tool.id) : undefined }))
    .filter((x): x is { sec: (typeof plan.sections)[number]; r: CatalogRecord } => Boolean(x.r));
  return {
    tools: rows.map(({ sec, r }) => ({ id: r.id, name: r.name, heading: sec.heading, price: priceOf(r) })),
    totals: totals(rows.map((x) => x.r)),
  };
}
