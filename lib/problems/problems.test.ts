import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeBusiness, type OnboardingAnalysis } from "../business/onboarding.ts";
import { mockPlacesProvider } from "../business/places.ts";
import { applyCorrections } from "../business/profile.ts";
import { industryInfo } from "../business/industry.ts";
import { disabledProvider } from "../llm/client.ts";
import { exclusionReason, recommend } from "../recommend/engine.ts";
import { demoCatalog } from "../../data/mock/recommendations.ts";
import { fakeLlm } from "../testing/fakes.ts";
import { discoverProblems, introducesNewNumbers, polishExplanations, statusFor } from "./discover.ts";
import { calculateImpact, validateOverrides } from "./impact.ts";
import { toRecommendationInput } from "./toRecommendation.ts";
import type { Signal } from "./types.ts";

const NOW = new Date("2026-11-07T12:00:00Z");
const deps = { places: mockPlacesProvider, llm: disabledProvider };

async function mikes(owner = { monthlyBudget: 200, techComfort: "self_serve" as const, goals: ["more_customers" as const] }) {
  return analyzeBusiness({ placeId: "mock-mikes-heating", owner }, deps);
}

const discover = (a: OnboardingAnalysis, assumptions = {}) =>
  discoverProblems({ profile: a.profile, reviews: a.reviews, website: a.website, assumptions }, NOW);

const signal = (overrides: Partial<Signal>): Signal => ({
  id: "s",
  problem: "missed_inquiries",
  source: "google_review",
  observation: "x",
  quote: null,
  reference: null,
  weight: 0.5,
  verified: true,
  ...overrides,
});

describe("financial calculator", () => {
  it("reproduces the worked example: 8 × 25% × $300 × 4.33 = $2,598", () => {
    const result = calculateImpact("missed_inquiries", industryInfo("hvac"), {
      missed_per_week: 8,
      conversion_rate: 0.25,
      average_job_value: 300,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.estimate.monthly.expected, 2598);
    assert.match(result.estimate.calculation, /^8 .*× 25% .*× \$300 .*× 4\.33 .*= \$2,598/);
    assert.equal(result.estimate.confidence, "high");
    assert.equal(result.estimate.kind, "revenue_opportunity");
    assert.match(result.estimate.label, /not proven/i);
  });

  it("labels inputs by source and lowers confidence when using defaults", () => {
    const result = calculateImpact("missed_inquiries", industryInfo("hvac"));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.estimate.inputs.every((i) => i.source !== "owner"));
    assert.equal(result.estimate.confidence, "low");
    assert.ok(result.estimate.monthly.low <= result.estimate.monthly.expected);
    assert.ok(result.estimate.monthly.expected <= result.estimate.monthly.high);
    assert.ok(result.estimate.assumptions.length > 0);
  });

  it("is deterministic and recalculates when the owner adjusts an assumption", () => {
    const a = calculateImpact("missed_inquiries", industryInfo("hvac"), { average_job_value: 300 });
    const b = calculateImpact("missed_inquiries", industryInfo("hvac"), { average_job_value: 300 });
    const c = calculateImpact("missed_inquiries", industryInfo("hvac"), { average_job_value: 600 });
    assert.deepEqual(a, b);
    assert.ok(a.ok && c.ok && c.estimate.monthly.expected > a.estimate.monthly.expected);
  });

  it("rejects unknown keys and out-of-range values", () => {
    assert.ok(validateOverrides("missed_inquiries", { bogus: 1 }).length > 0);
    assert.ok(validateOverrides("missed_inquiries", { conversion_rate: 5 }).length > 0);
    assert.ok(validateOverrides("missed_inquiries", { average_job_value: -10 }).length > 0);
    assert.equal(calculateImpact("missed_inquiries", industryInfo("hvac"), { conversion_rate: 5 }).ok, false);
  });

  it("labels time estimates as time value, not lost money", () => {
    const result = calculateImpact("time_cost_quotes", industryInfo("hvac"));
    assert.ok(result.ok && result.estimate.kind === "time_cost" && /time/i.test(result.estimate.label));
  });
});

describe("problem discovery", () => {
  it("ranks Mike's missed calls first with quoted review evidence", async () => {
    const result = discover(await mikes());
    const top = result.problems[0]!;
    assert.equal(top.key, "missed_inquiries");
    assert.equal(top.status, "confirmed");
    assert.ok(top.evidence.some((e) => e.source.endsWith("_review") && e.quote && e.reference?.reviewId));
    assert.ok(top.rank.explanation.length > 0);
    assert.equal(top.useCase, "missed-calls");
    assert.deepEqual(
      result.problems.map((p) => p.rank.position),
      result.problems.map((_, i) => i + 1),
    );
  });

  it("every verified signal carries a quote or a reference", async () => {
    const result = discover(await mikes());
    for (const problem of result.problems) {
      for (const e of problem.evidence.filter((s) => s.verified)) {
        assert.ok(e.quote || e.reference, `${problem.key}: verified signal ${e.id} has no evidence`);
      }
    }
  });

  it("never presents industry-pattern guesses as verified", async () => {
    const result = discover(await mikes());
    for (const problem of result.problems) {
      for (const e of problem.evidence.filter((s) => s.source === "industry_pattern")) assert.equal(e.verified, false);
      if (problem.verifiedSignalCount === 0) {
        assert.equal(problem.status, "hypothesis");
        assert.equal(problem.needsOwnerConfirmation, true);
      }
    }
    const hypotheses = result.problems.filter((p) => p.status === "hypothesis");
    const lastNonHypothesis = Math.max(...result.problems.filter((p) => p.status !== "hypothesis").map((p) => p.rank.position));
    for (const h of hypotheses) assert.ok(h.rank.position > lastNonHypothesis, "hypotheses rank after evidence-backed problems");
  });

  it("returns only hypotheses when there is no evidence at all", async () => {
    const analysis = await analyzeBusiness({ manual: { name: "Quiet HVAC", category: "HVAC contractor" } }, deps);
    const result = discover(analysis);
    assert.ok(result.problems.length > 0);
    assert.ok(result.problems.every((p) => p.status === "hypothesis"));
    assert.ok(result.problems.every((p) => p.confidence.score <= 0.3));
    assert.equal(result.summary.confirmed, 0);
    assert.equal(result.summary.estimatedMonthlyOpportunity.expected, 0, "hypotheses never add to the total");
  });

  it("status rules: reviews alone need 3 mentions; one verified signal is 'likely'", () => {
    assert.equal(statusFor([signal({ id: "1" })]), "likely");
    assert.equal(statusFor([signal({ id: "1", verified: false })]), "hypothesis");
    assert.equal(statusFor([signal({ id: "1" }), signal({ id: "2" }), signal({ id: "3" })]), "confirmed");
    assert.equal(statusFor([signal({ id: "1" }), signal({ id: "2", source: "website" })]), "confirmed");
  });

  it("uses owner-supplied assumptions in the estimate", async () => {
    const result = discover(await mikes(), { missed_inquiries: { missed_per_week: 8, conversion_rate: 0.25, average_job_value: 300 } });
    const card = result.problems.find((p) => p.key === "missed_inquiries")!;
    assert.equal(card.impact?.monthly.expected, 2598);
  });

  it("does not double-count problems that share a use case in the summary", async () => {
    const result = discover(await mikes());
    const counted = result.problems.filter((p) => p.status !== "hypothesis" && p.impact?.kind === "revenue_opportunity");
    const naiveSum = counted.reduce((sum, p) => sum + p.impact!.monthly.expected, 0);
    assert.ok(result.summary.estimatedMonthlyOpportunity.expected <= naiveSum);
  });
});

describe("LLM explanation guard", () => {
  it("detects numbers that aren't in the facts", () => {
    assert.equal(introducesNewNumbers("You may be missing about $4,000 a month.", "8 × 25% × $300 × 4.33 = $2,598"), true);
    assert.equal(introducesNewNumbers("Roughly $2,598 a month from 8 missed calls.", "8 × 25% × $300 × 4.33 = $2,598"), false);
  });

  it("keeps template text when the LLM invents a figure, uses LLM text when it doesn't", async () => {
    const base = discover(await mikes());
    const { provider: liar } = fakeLlm(() =>
      JSON.stringify({ explanations: base.problems.map((p) => ({ key: p.key, text: `This costs you $9,999,999 every month.` })) }),
      "fake-llm-liar",
    );
    const guarded = await polishExplanations(base, liar);
    assert.ok(guarded.problems.every((p) => p.explanationSource === "template"));
    assert.ok(guarded.problems.every((p) => !p.explanation.includes("9,999,999")));

    const { provider: honest } = fakeLlm(() =>
      JSON.stringify({ explanations: base.problems.map((p) => ({ key: p.key, text: `Plain-language summary for ${p.title}.` })) }),
      "fake-llm-honest",
    );
    const polished = await polishExplanations(base, honest);
    assert.ok(polished.problems.some((p) => p.explanationSource === "llm"));
    assert.deepEqual(
      polished.problems.map((p) => p.impact?.monthly),
      base.problems.map((p) => p.impact?.monthly),
      "LLM never changes figures",
    );
  });

  it("survives a malformed LLM response", async () => {
    const base = discover(await mikes());
    const { provider } = fakeLlm(() => "not json at all", "fake-llm-broken");
    const result = await polishExplanations(base, provider);
    assert.deepEqual(result.problems.map((p) => p.explanation), base.problems.map((p) => p.explanation));
  });
});

describe("Part 4 contract (lib/recommend)", () => {
  it("produces a request Aditya's engine accepts", async () => {
    const analysis = await mikes();
    const discovery = discover(analysis);
    const input = toRecommendationInput(analysis.profile, discovery);
    assert.equal(input.ok, true);
    if (!input.ok) return;
    const { business, problems } = input.request;
    assert.equal(business.state, "MD");
    assert.equal(business.monthlyBudget, 200);
    assert.ok(problems.length > 0 && problems.length <= 8);
    assert.equal(new Set(problems.map((p) => p.useCase)).size, problems.length, "one problem per use case");
    for (const p of problems) {
      assert.ok(p.evidence.length > 0 && p.evidence.length <= 500);
    }
    assert.ok(!problems.some((p) => p.useCase === "marketing"), "hypotheses are left out by default");
    const output = recommend(business, problems, demoCatalog);
    assert.equal(output.problems.length, problems.length);
    assert.equal(typeof exclusionReason, "function");
  });

  it("includes a hypothesis only when the owner confirms it", async () => {
    const analysis = await mikes();
    const discovery = discover(analysis);
    const input = toRecommendationInput(analysis.profile, discovery, { includeHypotheses: ["no_customer_follow_up"] });
    assert.ok(input.ok && input.request.problems.some((p) => p.useCase === "marketing"));
  });

  it("refuses to build a request when required owner inputs are missing", async () => {
    const analysis = await analyzeBusiness({ placeId: "mock-mikes-heating" }, deps);
    const input = toRecommendationInput(analysis.profile, discover(analysis));
    assert.equal(input.ok, false);
    if (!input.ok) assert.ok(input.missing.includes("owner.monthlyBudget"));
  });

  it("maps constraints to deal-breakers and needs_help to needsHelp", async () => {
    const analysis = await mikes();
    const profile = applyCorrections(analysis.profile, { owner: { techComfort: "needs_help", constraints: ["no_recording"] } }, { now: NOW });
    const input = toRecommendationInput(profile, discover({ ...analysis, profile }));
    assert.ok(input.ok);
    if (!input.ok) return;
    assert.equal(input.request.business.needsHelp, true);
    assert.ok(input.request.business.dealBreakers.length > 0);
  });
});
