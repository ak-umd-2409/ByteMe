import { industryInfo, type IndustryInfo } from "../business/industry.ts";
import type { Goal, OnboardingProfile, ReviewAnalysis, WebsiteAnalysis } from "../business/types.ts";
import { llmJson, type LlmProvider } from "../llm/client.ts";
import { v } from "../shared/validate.ts";
import { PROBLEMS } from "./catalog.ts";
import { calculateImpact, usd, type ImpactOverrides } from "./impact.ts";
import { collectSignals } from "./signals.ts";
import type {
  ConfidenceLevel,
  DiscoveryResult,
  EvidenceSource,
  ProblemCard,
  ProblemKey,
  ProblemStatus,
  RankBreakdown,
  Signal,
} from "./types.ts";

/**
 * Part 3: evidence-backed problem discovery.
 *
 * Deterministic from start to finish: status, confidence, money and rank are
 * computed in code. The optional LLM only rewrites the explanation sentence,
 * and that rewrite is discarded if it contains any number we didn't give it.
 */
export interface DiscoverInput {
  profile: OnboardingProfile;
  reviews: ReviewAnalysis;
  website: WebsiteAnalysis | null;
  /** Owner adjustments per problem key, e.g. { missed_inquiries: { missed_per_week: 8 } }. */
  assumptions?: Partial<Record<ProblemKey, ImpactOverrides>>;
}

/** Evidence families: several reviews are one family, a review + a website finding are two. */
const FAMILY: Record<EvidenceSource, string> = {
  google_review: "reviews",
  pasted_review: "reviews",
  sample_review: "reviews",
  website: "website",
  google_profile: "google_profile",
  tech_stack: "tools",
  owner_reported: "owner",
  industry_pattern: "pattern",
};
const SOURCE_WORDS: Record<string, [string, string]> = {
  reviews: ["customer review", "customer reviews"],
  website: ["website finding", "website findings"],
  google_profile: ["Google listing detail", "Google listing details"],
  owner: ["thing you told us", "things you told us"],
  tools: ["gap in your tools", "gaps in your tools"],
  pattern: ["industry pattern", "industry patterns"],
};

/** Probability that at least one signal is right ("noisy OR"), capped. */
const noisyOr = (weights: number[]) => 1 - weights.reduce((acc, w) => acc * (1 - Math.min(0.95, Math.max(0, w))), 1);
const levelFor = (score: number): ConfidenceLevel => (score >= 0.75 ? "high" : score >= 0.45 ? "medium" : "low");
const round2 = (x: number) => Math.round(x * 100) / 100;

export function statusFor(signals: Signal[]): ProblemStatus {
  const verified = signals.filter((s) => s.verified);
  if (verified.length === 0) return "hypothesis";
  const families = new Set(verified.map((s) => FAMILY[s.source]));
  const reviewMentions = verified.filter((s) => FAMILY[s.source] === "reviews").length;
  if ((verified.length >= 2 && families.size >= 2) || reviewMentions >= 3) return "confirmed";
  return "likely";
}

function confidenceFor(signals: Signal[], status: ProblemStatus) {
  const verified = signals.filter((s) => s.verified);
  const score =
    status === "hypothesis" ? Math.min(0.3, noisyOr(signals.map((s) => s.weight)) * 0.5) : Math.min(0.95, noisyOr(verified.map((s) => s.weight)));
  const counts = new Map<string, number>();
  for (const s of status === "hypothesis" ? signals : verified) counts.set(FAMILY[s.source], (counts.get(FAMILY[s.source]) ?? 0) + 1);
  const parts = [...counts.entries()].map(([family, count]) => `${count} ${SOURCE_WORDS[family][count === 1 ? 0 : 1]}`);
  const reason =
    status === "hypothesis"
      ? `Not confirmed: based only on ${parts.join(" and ")}. Tell us if this applies to you.`
      : `Based on ${parts.join(", ")}.`;
  return { level: levelFor(score), score: round2(score), reason };
}

const REVENUE_GOALS: Goal[] = ["more_customers", "better_reviews"];
const TIME_GOALS: Goal[] = ["save_time", "get_paid_faster"];

export function rankScore(
  card: Pick<ProblemCard, "key" | "verifiedSignalCount" | "confidence" | "impact">,
  industry: IndustryInfo,
  goals: Goal[],
): { score: number; breakdown: RankBreakdown; explanation: string[] } {
  const evidence = (Math.min(card.verifiedSignalCount, 4) / 4) * 30;
  const confidence = card.confidence.score * 25;
  const money = card.impact?.monthly.expected ?? 0;
  const impact = card.impact ? Math.min(1, Math.log10(1 + money) / Math.log10(1 + 5_000)) * 25 : 0;
  const typical = industry.typicalProblems.includes(card.key);
  const goalFit =
    card.impact &&
    ((card.impact.kind === "revenue_opportunity" && goals.some((g) => REVENUE_GOALS.includes(g))) ||
      (card.impact.kind === "time_cost" && goals.some((g) => TIME_GOALS.includes(g))));
  const relevance = Math.min(20, (typical ? 16 : 10) + (goalFit ? 4 : 0));
  const breakdown = {
    evidence: round2(evidence),
    confidence: round2(confidence),
    impact: round2(impact),
    relevance: round2(relevance),
  };
  const explanation = [
    `Evidence: ${card.verifiedSignalCount} direct signal${card.verifiedSignalCount === 1 ? "" : "s"} → ${breakdown.evidence}/30`,
    `Confidence: ${card.confidence.level} → ${breakdown.confidence}/25`,
    card.impact ? `Estimated impact: ${usd(money)}/month → ${breakdown.impact}/25` : "Estimated impact: not estimated → 0/25",
    `Relevance: ${typical ? `common for ${industry.label.toLowerCase()} businesses` : "less typical for your industry"}${goalFit ? ", matches your goals" : ""} → ${breakdown.relevance}/20`,
  ];
  return { score: round2(evidence + confidence + impact + relevance), breakdown, explanation };
}

/** Evidence-backed problems first; within that group, score decides. */
const TIER: Record<ProblemStatus, number> = { confirmed: 0, likely: 0, hypothesis: 1 };

export function discoverProblems(input: DiscoverInput, now = new Date()): DiscoveryResult {
  const { profile } = input;
  const industry = industryInfo(profile.business.industry.value ?? "other");
  const goals = profile.owner.goals.value ?? [];
  const name = profile.business.name.value ?? "your business";
  const signals = collectSignals(input);

  const byProblem = new Map<ProblemKey, Signal[]>();
  for (const signal of signals) byProblem.set(signal.problem, [...(byProblem.get(signal.problem) ?? []), signal]);

  const cards: ProblemCard[] = [];
  for (const [key, list] of byProblem) {
    const def = PROBLEMS[key];
    const ordered = [...list].sort((a, b) => Number(b.verified) - Number(a.verified) || b.weight - a.weight || a.id.localeCompare(b.id));
    const status = statusFor(ordered);
    const confidence = confidenceFor(ordered, status);
    const verifiedSignalCount = ordered.filter((s) => s.verified).length;
    let impact = null;
    let impactNote = def.noImpactReason ?? null;
    if (def.impactModel) {
      const result = calculateImpact(def.impactModel, industry, input.assumptions?.[key] ?? {});
      if (result.ok) impact = result.estimate;
      else impactNote = `Your numbers couldn't be used: ${result.errors.join("; ")}`;
    }
    const card: ProblemCard = {
      id: `problem-${key}`,
      key,
      title: def.title,
      explanation: def.explanation.replace("{name}", name),
      category: def.category,
      useCase: def.useCase,
      status,
      confidence,
      evidence: ordered,
      signalCount: ordered.length,
      verifiedSignalCount,
      independentSources: [...new Set(ordered.filter((s) => s.verified).map((s) => s.source))],
      impact,
      impactNote,
      rank: { position: 0, score: 0, breakdown: { evidence: 0, confidence: 0, impact: 0, relevance: 0 }, explanation: [] },
      needsOwnerConfirmation: status === "hypothesis",
      explanationSource: "template",
    };
    const rank = rankScore(card, industry, goals);
    card.rank = { position: 0, ...rank };
    cards.push(card);
  }

  // Hypotheses always rank after anything with direct evidence.
  cards.sort((a, b) => TIER[a.status] - TIER[b.status] || b.rank.score - a.rank.score || a.key.localeCompare(b.key));
  cards.forEach((card, index) => (card.rank.position = index + 1));

  const evidenced = cards.filter((c) => c.status !== "hypothesis");
  // Count one problem per kind of fix, so overlapping estimates (e.g. missed calls
  // and slow replies, which share the same customers) aren't added twice.
  const counted = new Set<string>();
  const forTotals = evidenced.filter((c) => {
    if (!c.useCase) return true;
    if (counted.has(c.useCase)) return false;
    counted.add(c.useCase);
    return true;
  });
  const sum = (kind: "revenue_opportunity" | "time_cost", field: "expected" | "low" | "high") =>
    forTotals.reduce((total, c) => total + (c.impact?.kind === kind ? c.impact.monthly[field] : 0), 0);

  const limitations: string[] = [];
  if (evidenced.length === 0) limitations.push("We didn't find direct evidence of problems yet. Add reviews or tell us what takes up your week.");
  if (cards.some((c) => c.impact && c.impact.confidence === "low"))
    limitations.push("Most money figures use starting assumptions. Replace them with your own numbers for a better estimate.");
  if (forTotals.length < evidenced.length)
    limitations.push("Some problems overlap (they affect the same customers), so the totals count only the top problem for each kind of fix.");

  return {
    businessName: name,
    generatedAt: now.toISOString(),
    problems: cards,
    summary: {
      confirmed: cards.filter((c) => c.status === "confirmed").length,
      likely: cards.filter((c) => c.status === "likely").length,
      hypotheses: cards.filter((c) => c.status === "hypothesis").length,
      estimatedMonthlyOpportunity: { expected: sum("revenue_opportunity", "expected"), low: sum("revenue_opportunity", "low"), high: sum("revenue_opportunity", "high") },
      estimatedMonthlyTimeValue: { expected: sum("time_cost", "expected"), low: sum("time_cost", "low"), high: sum("time_cost", "high") },
    },
    disclaimer:
      "Money figures are estimated opportunities calculated from the inputs shown, not proven lost revenue. Problems marked “Not confirmed” have no direct evidence yet and are not included in totals.",
    limitations,
  };
}

// ---------- Optional LLM wording ----------

const explanationSchema = v.object({
  explanations: v.array(v.object({ key: v.string({ max: 60 }), text: v.string({ min: 20, max: 400 }) }), { max: 12 }),
});

/** Numbers that appear in `text`, normalized (commas removed). */
export const numbersIn = (text: string) => (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));

/**
 * True when every number in the LLM text already appears in the facts we gave
 * it. Any new number (a "$5,000", a "30%") means the model invented a figure.
 */
export function introducesNewNumbers(candidate: string, facts: string): boolean {
  const allowed = new Set(numbersIn(facts));
  return numbersIn(candidate).some((n) => !allowed.has(n));
}

export async function polishExplanations(result: DiscoveryResult, llm: LlmProvider): Promise<DiscoveryResult> {
  const evidenced = result.problems.filter((c) => c.status !== "hypothesis").slice(0, 6);
  if (evidenced.length === 0) return result;
  const facts = new Map(
    evidenced.map((c) => [c.key, [c.title, c.explanation, ...c.evidence.filter((s) => s.verified).map((s) => `${s.observation} ${s.quote ?? ""}`)].join("\n")]),
  );
  const response = await llmJson(llm, explanationSchema, {
    task: "problem_explanations",
    system:
      "You write one or two plain-English sentences (grade 6–8 reading level) explaining a business problem to a small business owner, based ONLY on the facts given. " +
      'Reply with JSON only: {"explanations":[{"key":"...","text":"..."}]}. Do not add numbers, prices, percentages or claims that are not in the facts. No jargon.',
    user: JSON.stringify([...facts.entries()].map(([key, text]) => ({ key, facts: text }))),
  });
  if (!response.ok) return result;
  const problems = result.problems.map((card) => {
    const proposal = response.value.explanations.find((e) => e.key === card.key);
    const source = facts.get(card.key);
    if (!proposal || !source || introducesNewNumbers(proposal.text, source)) return card;
    return { ...card, explanation: proposal.text, explanationSource: "llm" as const };
  });
  return { ...result, problems };
}
