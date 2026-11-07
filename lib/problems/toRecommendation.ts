import type { Constraint, OnboardingProfile } from "../business/types.ts";
import type { BusinessProfile, Problem, UseCase } from "../recommend/types.ts";
import type { DiscoveryResult, ProblemKey, Signal } from "./types.ts";

/**
 * Part 3 → Part 4 contract.
 *
 * Produces exactly the body that `POST /api/recommend` (PR #3) validates:
 *   { business: BusinessProfile, problems: Problem[] }
 * using Part 4's own types from lib/recommend/types.ts.
 *
 * Rules:
 * - Only confirmed and likely problems are sent; hypotheses only when the
 *   owner explicitly confirms them (`includeHypotheses`).
 * - Problems with no matching tool category (useCase null) are not sent.
 * - One problem per use case (the highest-ranked one), up to 8.
 * - Field lengths respect Part 4's validation limits.
 */
export type RecommendationRequest = { business: BusinessProfile; problems: Problem[] };

export type RecommendationInputResult =
  | {
      ok: true;
      request: RecommendationRequest;
      /** Problems not sent, and why. */
      omitted: { key: ProblemKey; reason: string }[];
      /** Values we had to assume because the owner hasn't answered yet. */
      assumed: string[];
    }
  | { ok: false; missing: string[]; message: string };

const DEAL_BREAKERS: Record<Constraint, BusinessProfile["dealBreakers"][number]> = {
  no_recording: "no-recording",
  no_contract: "no-contract",
  spanish_required: "spanish",
  offline_required: "offline",
};

const SOURCE_LABEL: Record<Signal["source"], string> = {
  google_review: "Google review",
  pasted_review: "customer review",
  sample_review: "sample review",
  public_review: "public review",
  listing: "public listings",
  website: "website",
  google_profile: "Google listing",
  tech_stack: "your tools",
  owner_reported: "you told us",
  industry_pattern: "industry pattern",
};

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

/** Compact, quote-first evidence text for Part 4 (≤ 500 characters). */
export function evidenceSummary(signals: Signal[], max = 500): string {
  const verified = signals.filter((s) => s.verified);
  const pool = verified.length ? verified : signals;
  const parts: string[] = [];
  for (const signal of pool.slice(0, 4)) {
    const text = signal.quote ? `“${clip(signal.quote, 140)}”` : clip(signal.observation, 160);
    const part = `${text} (${SOURCE_LABEL[signal.source]})`;
    const next = parts.length ? `${parts.join("; ")}; ${part}` : part;
    if (next.length > max) break;
    parts.push(part);
  }
  return clip(parts.join("; ") || "Owner-confirmed problem.", max);
}

export function toRecommendationInput(
  profile: OnboardingProfile,
  discovery: DiscoveryResult,
  opts: { includeHypotheses?: ProblemKey[] } = {},
): RecommendationInputResult {
  const missing = [...profile.missingForRecommendations.filter((f) => f !== "owner.techComfort")];
  const budget = profile.owner.monthlyBudget.value;
  const state = profile.business.address.value?.stateCode ?? null;
  const name = profile.business.name.value;
  if (missing.length > 0 || budget === null || !state || !name) {
    const fields = missing.length ? missing : ["owner.monthlyBudget", "business.address.stateCode", "business.name"];
    return { ok: false, missing: fields, message: "We need a few more answers before recommending tools." };
  }

  const assumed: string[] = [];
  const techComfort = profile.owner.techComfort.value;
  if (techComfort === null) assumed.push("needsHelp = false (you haven't said whether you want setup help)");

  const include = new Set(opts.includeHypotheses ?? []);
  const omitted: { key: ProblemKey; reason: string }[] = [];
  const usedUseCases = new Map<UseCase, ProblemKey>();
  const problems: Problem[] = [];
  for (const card of discovery.problems) {
    if (card.status === "hypothesis" && !include.has(card.key)) {
      omitted.push({ key: card.key, reason: "Not confirmed yet — confirm it to get recommendations." });
      continue;
    }
    if (!card.useCase) {
      omitted.push({ key: card.key, reason: "No AI tool category fits; this is a quick manual fix." });
      continue;
    }
    const taken = usedUseCases.get(card.useCase);
    if (taken) {
      omitted.push({ key: card.key, reason: `Covered by the higher-ranked “${taken}” recommendation (same kind of tool).` });
      continue;
    }
    if (problems.length >= 8) {
      omitted.push({ key: card.key, reason: "Only the top 8 problems are sent." });
      continue;
    }
    usedUseCases.set(card.useCase, card.key);
    problems.push({
      id: clip(card.id, 80),
      useCase: card.useCase,
      title: clip(card.title, 140),
      evidence: evidenceSummary(card.evidence),
    });
  }
  if (problems.length === 0)
    return { ok: false, missing: ["problems"], message: "No confirmed problems yet. Confirm one of the suggestions or tell us what takes up your week." };

  const county = (profile.business.address.value?.county ?? "").replace(/\s+County$/i, "").trim();
  const business: BusinessProfile = {
    name: clip(name, 120),
    industry: clip(profile.business.industryLabel, 80),
    state: state.toUpperCase().slice(0, 2),
    county: clip(county, 80),
    monthlyBudget: budget,
    currentTools: (profile.technology.currentTools.value ?? []).slice(0, 30).map((t) => clip(t, 80)),
    needsHelp: techComfort === "needs_help",
    handlesHealthData: profile.owner.handlesHealthData.value ?? false,
    handlesLargeCustomerList: profile.owner.handlesLargeCustomerList.value ?? false,
    hasOutboundCallConsent: profile.owner.hasOutboundCallConsent.value ?? false,
    dealBreakers: [...new Set((profile.owner.constraints.value ?? []).map((c) => DEAL_BREAKERS[c]).filter(Boolean))],
  };
  return { ok: true, request: { business, problems }, omitted, assumed };
}
