/**
 * The answer pack: every fact the advisor may use for one answer. Tools come only from the
 * catalog's Verified, real (non-sample) records; prices only from the catalog; nothing else.
 * The rules answer is built from this pack, and the AI answer (think.ts) is
 * checked against the same catalog and the business brief before an owner sees it.
 */
import type { IndustryKey } from "../business/types.ts";
import type { CatalogRecord } from "../catalog/types.ts";
import type { JourneyAnswerResponse } from "../journey/types.ts";
import type { UseCase } from "../recommend/types.ts";
import { GUIDES, INDUSTRY_TOPICS } from "./knowledge.ts";
import type { AdvisorContext, ToolCard, Understood } from "./types.ts";
import { industryIn } from "./understand.ts";

const INDUSTRY_KEYS = new Set<string>(Object.keys(INDUSTRY_TOPICS));
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const firstSentence = (s: string) => {
  const m = /^(.{20,200}?[.!?])(\s|$)/.exec(s.trim());
  return (m ? m[1] : s.trim().slice(0, 180)).trim();
};

/** The owner's results from onboarding, in the shape the advisor needs. */
export function contextFrom(answer: JourneyAnswerResponse): AdvisorContext {
  const req = answer.recommendation.ready ? answer.recommendation.request : null;
  // The results carry the industry as a label ("HVAC"); map it back to our key.
  const raw = req?.business.industry ?? "";
  const industry = INDUSTRY_KEYS.has(raw) ? (raw as IndustryKey) : (industryIn(raw) ?? industryIn(answer.business.subtitle));
  const problems = answer.opportunities
    .filter((o) => o.useCase && o.fix.kind !== "free")
    .map((o) => ({ useCase: o.useCase as UseCase, headline: o.headline }));
  const freeFixes = answer.opportunities.filter((o) => o.fix.kind === "free").map((o) => ({ headline: o.headline, nextStep: /[.!?]$/.test(o.fix.nextStep.trim()) ? o.fix.nextStep.trim() : `${o.fix.nextStep.trim()}.` }));
  return {
    business: answer.business.name,
    industry,
    county: answer.localHelp?.county ?? req?.business.county ?? null,
    problems,
    freeFixes,
    budget: answer.budget ?? null,
    currentTools: req?.business.currentTools ?? [],
    needsHelp: req?.business.needsHelp ?? false,
    healthData: req?.business.handlesHealthData ?? false,
    help: answer.localHelp ? { name: answer.localHelp.name, url: answer.localHelp.url, phone: answer.localHelp.phone } : null,
  };
}

export interface Pack {
  topics: UseCase[];
  /** Where the topics came from, for the answer's wording. */
  topicSource: "question" | "results" | "industry" | "none";
  industry: IndustryKey | null;
  budget: number | null;
  budgetAssumed: boolean;
  ownerTools: string[];
  tools: ToolCard[];
  /** Best pick per topic (ids into tools), for the budget plan. */
  bestByTopic: Partial<Record<UseCase, string>>;
  noToolYet: UseCase[];
  /** Every product the checked tools say they work with, for spotting software names in questions. */
  knownProducts: string[];
}

export function realTools(catalog: CatalogRecord[]): CatalogRecord[] {
  return catalog.filter((r) => r.badge === "verified" && !r.sample);
}

/**
 * Checked tools this business may be offered: Verified, real, built for its kind of business,
 * and, for health businesses, nothing that touches patient calls, messages or bookings unless
 * it's marked HIPAA-ready.
 */
export function eligibleTools(catalog: CatalogRecord[], industry: IndustryKey | null, health: boolean): CatalogRecord[] {
  return realTools(catalog).filter((r) => {
    if (industry && !r.industries.includes("any") && !r.industries.includes(industry)) return false;
    if (health && r.rulesFlags.hipaaReady !== true && (r.useCases.includes("customer-messaging") || r.useCases.includes("missed-calls") || r.useCases.includes("booking")))
      return false;
    return true;
  });
}

export function knownProducts(catalog: CatalogRecord[]): string[] {
  return [...new Set(realTools(catalog).flatMap((r) => r.worksWith.map((w) => w.product)))];
}

export function cardFor(r: CatalogRecord, ownerTools: string[], industry: IndustryKey | null): ToolCard {
  const price = r.pricing.small.monthlyUsd;
  const alreadyHave = Boolean(r.existingProduct && ownerTools.some((t) => same(t, r.existingProduct!)));
  const worksWithYours = r.worksWith
    .filter((w) => w.type !== "none" && ownerTools.some((t) => same(t, w.product)))
    .map((w) => ({ product: w.product, how: w.type === "native" ? ("built in" as const) : ("through Zapier" as const) }));
  const limits: string[] = [];
  if (price === "unknown") limits.push("Price isn't public. Ask for it in writing before you sign up.");
  if (r.setupMode === "needs_help") limits.push("Best set up with some help.");
  if (r.setupMinutes === "unknown") limits.push("Setup time isn't published.");
  if (!r.industries.includes("any") && (!industry || !r.industries.includes(industry)))
    limits.push(`Built mainly for ${r.industries.map((i) => i.replace(/_/g, " ")).join(", ")} businesses.`);
  if (r.rulesFlags.recordsCalls === true) limits.push("It records calls: Maryland requires every caller's consent, so turn on its recording announcement.");
  else if (r.rulesFlags.recordsCalls === "unknown" && r.useCases.includes("missed-calls"))
    limits.push("We couldn't confirm whether it records calls. If it does, Maryland requires every caller's consent.");
  const train = r.privacyCard.trainsOnYourData;
  return {
    id: r.id,
    name: r.name,
    company: r.vendor.company,
    category: r.category,
    useCases: r.useCases,
    monthlyUsd: price === "unknown" ? null : price,
    priceNote: r.pricing.small.note,
    pricingUrl: r.pricing.pricingUrl,
    officialUrl: r.vendor.website,
    worksWithYours,
    alreadyHave,
    what: firstSentence(r.description),
    limits,
    trainsOnYourData: train.answer === "unknown" ? "Not stated in its policy" : train.plain,
    checkedOn: r.reviewedAt ?? r.lastChecked,
    detailPath: `/tools/${r.id}`,
  };
}

function rank(records: CatalogRecord[], ownerTools: string[], budget: number | null, needsHelp: boolean, industry: IndustryKey | null) {
  const score = (r: CatalogRecord) => {
    const price = r.pricing.small.monthlyUsd;
    let s = 0;
    if (r.existingProduct && ownerTools.some((t) => same(t, r.existingProduct!))) s += 1000;
    s += 100 * r.worksWith.filter((w) => w.type !== "none" && ownerTools.some((t) => same(t, w.product))).length;
    if (industry && r.industries.includes(industry)) s += 60;
    if (budget !== null && typeof price === "number") s += price <= budget ? 50 : -200;
    if (typeof price === "number") s -= Math.min(price, 400) / 10;
    else s -= 25; // a public price beats a hidden one
    if (!needsHelp && r.setupMode === "self_serve") s += 10;
    return s;
  };
  return [...records].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}

export function buildPack(u: Understood, ctx: AdvisorContext | null, catalog: CatalogRecord[], fallbackIndustry: IndustryKey | null = null): Pack {
  const industry = u.industry ?? ctx?.industry ?? fallbackIndustry;
  let topics: UseCase[] = u.topics;
  let topicSource: Pack["topicSource"] = topics.length ? "question" : "none";
  if (!topics.length && ctx?.problems.length) {
    topics = [...new Set(ctx.problems.map((p) => p.useCase))].slice(0, 3);
    topicSource = "results";
  }
  if (!topics.length && industry) {
    topics = INDUSTRY_TOPICS[industry];
    topicSource = "industry";
  }
  const budget = u.budget ?? ctx?.budget?.value ?? null;
  const budgetAssumed = u.budget === null && Boolean(ctx?.budget?.assumed);
  const ownerTools = [...new Set([...(ctx?.currentTools ?? []), ...u.toolsNamed])];

  const real = eligibleTools(catalog, industry, Boolean(ctx?.healthData) || industry === "health_clinic");

  const perTopic = u.kind === "budget" || u.kind === "existing" ? 3 : 2;
  const picked: CatalogRecord[] = [];
  const bestByTopic: Partial<Record<UseCase, string>> = {};
  const noToolYet: UseCase[] = [];
  for (const topic of topics) {
    const ranked = rank(real.filter((r) => r.useCases.includes(topic)), ownerTools, budget, ctx?.needsHelp ?? false, industry);
    if (!ranked.length) {
      noToolYet.push(topic);
      continue;
    }
    bestByTopic[topic] = ranked[0]!.id;
    for (const r of ranked.slice(0, perTopic)) if (!picked.includes(r)) picked.push(r);
  }
  // "Can I use AI with what I already have?": every checked tool that connects to their software.
  if (u.kind === "existing" && ownerTools.length) {
    for (const r of rank(real, ownerTools, budget, false, industry)) {
      const connects = r.worksWith.some((w) => w.type !== "none" && ownerTools.some((t) => same(t, w.product)));
      const inside = r.existingProduct && ownerTools.some((t) => same(t, r.existingProduct!));
      if ((connects || inside) && !picked.includes(r)) picked.push(r);
    }
  }
  const tools = picked.slice(0, 5).map((r) => cardFor(r, ownerTools, industry));
  return { topics, topicSource, industry, budget, budgetAssumed, ownerTools, tools, bestByTopic, noToolYet, knownProducts: knownProducts(catalog) };
}

/** Topic labels for wording. */
export const labelOf = (t: UseCase) => GUIDES[t].label;
