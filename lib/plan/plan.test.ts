import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleJourneyAnswer, handleJourneyStart } from "../api/journey.ts";
import type { ApiDeps } from "../api/handlers.ts";
import { getPlacesProvider } from "../business/places.ts";
import { loadTestCatalog as loadCatalog } from "../catalog/index.ts";
import type { CatalogRecord } from "../catalog/types.ts";
import type { JourneyAnswerResponse, JourneyStartResponse } from "../journey/types.ts";
import { disabledProvider } from "../llm/client.ts";
import { loadConfig } from "../shared/config.ts";
import { buildPlan } from "./plan.ts";

const config = { ...loadConfig({}), journeySecret: null };
const deps: ApiDeps = { config, places: getPlacesProvider(config), llm: disabledProvider, now: () => new Date("2026-11-07T12:00:00Z") };

async function journey(placeId: string, answers: Record<string, unknown>) {
  const s = (await handleJourneyStart({ placeId }, deps)).body as JourneyStartResponse;
  return (await handleJourneyAnswer({ context: s.context, answers }, deps)).body as JourneyAnswerResponse;
}

describe("your plan", () => {
  it("puts free fixes first, with a link for every listing to update", async () => {
    const a = await journey("public-daves-cooling-heating", { "listing.hours": "v1" });
    const plan = buildPlan({ answer: a, choices: {}, catalog: loadCatalog(), currentTools: [] });
    const first = plan.sections[0];
    assert.equal(first.tool, null);
    assert.match(first.summary, /^Free/);
    assert.match(first.steps[0].title, /Change BBB/);
    assert.ok(first.steps.slice(1).every((st) => st.link?.url.startsWith("https://")));
  });

  it("a chosen phone tool gets sign-up, recording rule, setup and a check against the owner's own number", async () => {
    const a = await journey("public-frederick-heating-ac", { "problem.missed_inquiries": "yes", "impact.missed_per_week": 4, "impact.average_job_value": 400, tools: ["Square"] });
    const plan = buildPlan({ answer: a, choices: { missed_inquiries: "ringwise-receptionist" }, catalog: loadCatalog(), currentTools: ["Square"] });
    const sec = plan.sections.find((x) => x.tool?.id === "ringwise-receptionist")!;
    const titles = sec.steps.map((x) => x.title);
    assert.ok(titles[0].startsWith("Sign up with"));
    assert.ok(titles.includes("Connect your Square"));
    assert.ok(titles.includes("Keep the recording announcement on"));
    assert.match(sec.steps.find((x) => x.id.endsWith("-check"))!.detail, /4 a week/);
    assert.equal(sec.tool!.sample, true);
    assert.ok(plan.notes.some((n) => /sample tool/.test(n)), "sample tools are called out");
    assert.equal(sec.steps[0].link, null, "no link to a made-up website");
    assert.equal(plan.totals.monthly, 59);
    assert.equal(plan.help[0].name, "Maryland SBDC · Northern Region");
  });

  it("never puts an unreviewed tool in the plan, and 'decide later' keeps the free first step", async () => {
    const a = await journey("public-frederick-heating-ac", {});
    const booking = a.opportunities.find((o) => o.problemKey === "no_online_booking")!;
    const later = buildPlan({ answer: a, choices: {}, catalog: loadCatalog(), currentTools: [] });
    assert.equal(later.sections.find((x) => x.problem === booking.headline)!.summary, "Free to start · no tool yet");
    const listed = buildPlan({ answer: a, choices: { no_online_booking: "booknest" }, catalog: loadCatalog(), currentTools: [] });
    assert.ok(!listed.sections.some((x) => x.tool?.id === "booknest"));
    assert.ok(listed.notes.some((n) => /isn't Verified/.test(n)));
  });

  it("says when a price isn't public instead of guessing", async () => {
    const a = await journey("public-frederick-heating-ac", { "problem.slow_quotes": "yes" });
    const catalog: CatalogRecord[] = loadCatalog().map((r) => (r.id === "quotequick" ? { ...r, pricing: { ...r.pricing, small: { ...r.pricing.small, monthlyUsd: "unknown" } } } : r));
    const plan = buildPlan({ answer: a, choices: { slow_quotes: "quotequick" }, catalog, currentTools: [] });
    const sec = plan.sections.find((x) => x.tool?.id === "quotequick")!;
    assert.match(sec.steps[0].detail, /isn't public/);
    assert.equal(plan.totals.unknownPrices, 1);
  });
});
