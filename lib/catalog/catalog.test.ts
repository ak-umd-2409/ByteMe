import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { demoBusiness } from "../../data/mock/recommendations.ts";
import type { IndustryKey } from "../business/types.ts";
import { recommend } from "../recommend/engine.ts";
import type { UseCase } from "../recommend/types.ts";
import { validRecord } from "./fixtures.ts";
import { getTool, getVerifiedTools, loadCatalog, loadTestCatalog } from "./index.ts";
import { validateCatalog } from "./validate.ts";

const byBadge = (badge: string) => loadCatalog().filter((r) => r.badge === badge);
const test = loadTestCatalog();

describe("catalog data", () => {
  it("passes the data checker", () => {
    assert.deepEqual(validateCatalog(loadCatalog()), []);
  });

  it("the test-only catalog has 3 verified, 2 listed and 3 blocked made-up tools", () => {
    assert.deepEqual(validateCatalog(test), []);
    assert.equal(test.length, 8);
    for (const [badge, n] of [["verified", 3], ["listed", 2], ["blocked", 3]] as const)
      assert.equal(test.filter((r) => r.badge === badge).length, n);
  });
});

describe("getVerifiedTools", () => {
  it("returns only verified tools", () => {
    const tools = getVerifiedTools({}, test);
    assert.equal(tools.length, 3);
    assert.ok(tools.every((t) => t.status === "verified"));
  });

  it("filters by problem type and by works-with, ignoring case", () => {
    assert.equal(getVerifiedTools({ useCase: "missed-calls" }, test).length, 1);
    assert.ok(getVerifiedTools({ worksWith: "QUICKBOOKS" }, test).some((t) => t.useCases.includes("quotes")));
    assert.deepEqual(getVerifiedTools({ useCase: "inventory" }, test), []);
  });

  it("never returns a verified tool that has no review date", () => {
    const r = validRecord();
    delete r.reviewedAt;
    assert.deepEqual(getVerifiedTools({}, [r]), []);
  });

  it("rejects blocked and listed tools by badge alone, even with a review date and a price", () => {
    const blocked = { ...validRecord(), id: "b", badge: "blocked" as const };
    const listed = { ...validRecord(), id: "l", badge: "listed" as const };
    assert.deepEqual(getVerifiedTools({}, [blocked, listed]), []);
  });

  it("returns copies, so changing a result doesn't change the catalog", () => {
    const first = getVerifiedTools()[0];
    const original = first.name;
    first.name = "changed";
    assert.equal(getVerifiedTools()[0].name, original);
  });

  it("works in the recommendation engine for Mike's missed calls (made-up tools)", () => {
    const result = recommend(
      demoBusiness,
      [{ id: "p1", useCase: "missed-calls", title: "Missed calls", evidence: "Sample" }],
      getVerifiedTools({}, test),
    );
    assert.ok(result.problems[0].options.length > 0);
  });

  it("gives a restaurant with missed calls a real, approved tool (the demo story)", () => {
    const tools = getVerifiedTools({ industry: "restaurant", useCase: "missed-calls" });
    assert.ok(tools.length >= 1, "no approved real tool for restaurant missed calls");
    assert.ok(tools.every((t) => t.status === "verified"));
  });
});

describe("catalog safety: no listed or blocked tool reaches an owner", () => {
  const profiles: [IndustryKey, UseCase][] = [
    ["hvac", "missed-calls"],
    ["plumbing", "quotes"],
    ["restaurant", "reviews"],
    ["cafe", "marketing"],
    ["salon", "booking"],
    ["retail", "inventory"],
    ["landscaping", "customer-messaging"],
    ["auto_repair", "bookkeeping"],
    ["farm", "website-seo"],
    ["fitness", "staff-scheduling"],
  ];
  const unsafe = new Set([...byBadge("listed"), ...byBadge("blocked")].map((r) => r.id));
  for (const [industry, useCase] of profiles)
    it(`${industry} / ${useCase}`, () => {
      for (const filters of [{ industry, useCase }, { industry }, { useCase }, {}])
        for (const t of getVerifiedTools(filters)) assert.ok(!unsafe.has(t.id), `${t.id} must not be returned`);
    });
});

describe("getTool", () => {
  it("returns null for an unknown id", () => {
    assert.equal(getTool("does-not-exist"), null);
  });

  it("returns blocked tools too, with their reasons", () => {
    const blocked = byBadge("blocked")[0];
    const tool = getTool(blocked.id)!;
    assert.equal(tool.badge, "blocked");
    assert.ok(tool.safetyCheck.redFlags.length > 0);
  });
});
