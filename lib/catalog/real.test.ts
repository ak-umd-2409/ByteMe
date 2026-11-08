/**
 * The real catalog (data/catalog/real.json). See docs/specs/b-real-catalog.md §8–10.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import real from "../../data/catalog/real.json" with { type: "json" };
import sample from "../../data/catalog/sample.json" with { type: "json" };
import { recommend } from "../recommend/engine.ts";
import { USE_CASES, type BusinessProfile, type Problem, type UseCase } from "../recommend/types.ts";
import { getVerifiedTools, loadCatalog } from "./index.ts";
import type { CatalogRecord } from "./types.ts";

const realRecords = real as unknown as CatalogRecord[];
const SCAMS = ["fastbooks-ai", "replybot-pro", "squarre-voice-ai"];

describe("what the app reads", () => {
  it("is the real catalog plus only the 3 sample scams", () => {
    const ids = loadCatalog().map((r) => r.id).sort();
    assert.deepEqual(ids, [...realRecords.map((r) => r.id), ...SCAMS].sort());
  });

  it("keeps the sample file down to the 3 blocked scams", () => {
    assert.deepEqual((sample as { id: string }[]).map((r) => r.id).sort(), SCAMS);
  });

  it("never shows a made-up tool as verified or listed", () => {
    for (const r of loadCatalog()) if (r.sample) assert.equal(r.badge, "blocked", r.id);
  });
});

/**
 * Problem types with no approved real tool yet. Named on purpose, so a gap is
 * never hidden: when a tool for one gets approved, this test fails until the
 * gap is taken off the list.
 */
const KNOWN_GAPS = new Set<string>(["reviews", "bookkeeping", "inventory", "staff-scheduling", "website-seo"]);

describe("coverage", () => {
  for (const useCase of USE_CASES)
    it(`${useCase}: ${KNOWN_GAPS.has(useCase) ? "a named gap (no approved tool yet)" : "has an approved real tool"}`, () => {
      const n = getVerifiedTools({ useCase }).length;
      if (KNOWN_GAPS.has(useCase)) assert.equal(n, 0, `${useCase} now has a tool: take it off KNOWN_GAPS`);
      else assert.ok(n >= 1, `no approved tool for ${useCase}: add it to KNOWN_GAPS or approve one`);
    });

  it("gives the demo restaurant owner at least 3 approved tools, including one for missed calls", () => {
    assert.ok(getVerifiedTools({ industry: "restaurant" }).length >= 3);
    assert.ok(getVerifiedTools({ industry: "restaurant", useCase: "missed-calls" }).length >= 1);
  });
});

/**
 * Being in the catalog isn't enough: the owner rules (Maryland call recording,
 * AI calls, food pricing) must not throw out tools that never touch a phone.
 */
describe("what a Maryland owner actually gets", () => {
  const catalog = getVerifiedTools();
  const owner = (industry: string): BusinessProfile => ({
    name: "Test business",
    industry,
    state: "MD",
    county: "Frederick",
    monthlyBudget: 100,
    currentTools: [],
    needsHelp: false,
    dealBreakers: [],
    handlesHealthData: false,
    handlesLargeCustomerList: false,
    hasOutboundCallConsent: false,
  });
  const problem = (useCase: UseCase): Problem => ({ id: useCase, title: useCase, evidence: "test", useCase });
  const shown = (industry: string, useCase: UseCase) =>
    recommend(owner(industry), [problem(useCase)], catalog).problems[0].options.length;

  for (const [industry, useCase] of [
    ["HVAC", "admin-paperwork"],
    ["HVAC", "quotes"],
    ["Restaurant", "customer-messaging"],
    ["Salon", "email-marketing"],
    ["Retail shop", "marketing"],
  ] as [string, UseCase][])
    it(`${industry} · ${useCase}: at least one tool`, () => assert.ok(shown(industry, useCase) >= 1));
});
