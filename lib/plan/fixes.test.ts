import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validRecord } from "../catalog/fixtures.ts";
import type { Opportunity } from "../journey/types.ts";
import { buildPlan, type PlanInput } from "./plan.ts";

const opp = (over: Partial<Opportunity>): Opportunity =>
  ({ id: "o", problemKey: "missed_inquiries", rank: 1, headline: "Missed calls", evidence: [], fix: { kind: "tool", label: "Free · about an hour", nextStep: "Do it." }, impact: null, ...over }) as unknown as Opportunity;
const tool = { ...validRecord(), id: "t", setupMode: "needs_help" as const, setupMinutes: "unknown" as const, badge: "verified" as const };
const input = (o: Opportunity[], extra: Partial<PlanInput> = {}): PlanInput => ({
  answer: { business: { name: "Biz" }, opportunities: o, localHelp: null, youToldUs: [] },
  choices: { missed_inquiries: "t" },
  catalog: [tool],
  currentTools: [],
  ...extra,
});

describe("plan fixes", () => {
  it("a free section's time is the sum of its steps, not a separate guess", () => {
    const link = { label: "Google", url: "https://g.example" };
    const o = opp({ problemKey: "inconsistent_business_info", fix: { kind: "free", label: "Free · about an hour", nextStep: "Fix it." }, evidence: [{ links: [link, { label: "Your website", url: "https://w.example" }] }] as unknown as Opportunity["evidence"] });
    const sec = buildPlan(input([o])).sections[0]!;
    const sum = sec.steps.reduce((n, s) => n + (s.minutes ?? 0), 0);
    assert.equal(sum, 20);
    assert.equal(sec.summary, "Free · about 20 min");
  });
  it("doesn't tell an owner who'll set up themselves to book help", () => {
    const self = buildPlan(input([opp({})], { needsHelp: false })).sections[0]!;
    assert.ok(!self.steps.some((s) => /book help/i.test(s.title)));
    const helped = buildPlan(input([opp({})], { needsHelp: true })).sections[0]!;
    assert.ok(helped.steps.some((s) => /book help/i.test(s.title)));
  });
});
