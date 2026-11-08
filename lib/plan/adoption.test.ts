import assert from "node:assert/strict";
import test from "node:test";
import { handleJourneyAnswer, handleJourneyStart } from "../api/journey.ts";
import type { ApiDeps } from "../api/handlers.ts";
import { getPlacesProvider } from "../business/places.ts";
import { loadCatalog } from "../catalog/index.ts";
import type { JourneyAnswerResponse, JourneyStartResponse } from "../journey/types.ts";
import { disabledProvider } from "../llm/client.ts";
import { loadConfig } from "../shared/config.ts";
import { buildAdoptionGuide } from "./adoption.ts";
import { buildPlan } from "./plan.ts";

const config = { ...loadConfig({}), journeySecret: null };
const deps: ApiDeps = { config, places: getPlacesProvider(config), llm: disabledProvider, now: () => new Date("2026-11-07T12:00:00Z") };

async function journey(extra: Record<string, unknown> = {}) {
  const start = (await handleJourneyStart({ placeId: "public-frederick-heating-ac" }, deps)).body as JourneyStartResponse;
  return (await handleJourneyAnswer({ context: start.context, answers: { "problem.missed_inquiries": "yes", "impact.missed_per_week": 4, "impact.average_job_value": 400, tools: ["Square"], ...extra } }, deps)).body as JourneyAnswerResponse;
}

test("Section 5 makes a bilingual 30-day plan from the current guided journey", async () => {
  const answer = await journey();
  const catalog = loadCatalog();
  const plan = buildPlan({ answer, choices: { missed_inquiries: "ringwise-receptionist" }, catalog, currentTools: ["Square"] });
  const guide = buildAdoptionGuide(plan, answer, catalog);
  assert.deepEqual(guide.milestones.map((item) => item.day), [1, 2, 3, 5, 7, 14, 21, 30]);
  assert.ok(guide.milestones.every((item) => item.title.en && item.title.es && item.minutes !== 0));
  assert.ok(guide.selectedToolNames.length > 0);
  assert.match(guide.milestones[3].detail.en, /week 2.*notice and consent/);
  assert.match(guide.milestones[5].detail.en, /Set up Ringwise Receptionist/);
  assert.equal(guide.templates.filter((item) => item.group === "review").length, 3);
  assert.match(guide.templates[0].text.en, new RegExp(answer.business.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(guide.resources.every((item) => item.url.startsWith("https://")));
});

test("the short checklist follows the detailed staggered tool schedule", async () => {
  const answer = await journey({ "problem.slow_quotes": "yes" });
  const catalog = loadCatalog();
  const plan = buildPlan({ answer, choices: { missed_inquiries: "ringwise-receptionist", slow_quotes: "quotequick" }, catalog, currentTools: ["Square"] });
  const guide = buildAdoptionGuide(plan, answer, catalog);
  assert.match(guide.milestones[3].detail.en, /starts this tool in week 2/);
  assert.doesNotMatch(guide.milestones[3].detail.en, /QuoteQuick/);
  assert.match(guide.milestones[5].detail.en, /Set up Ringwise Receptionist/);
  assert.match(guide.milestones[7].detail.en, /trial QuoteQuick/);
  assert.match(guide.milestones[7].detail.en, /after day 30/);
});

test("unreviewed tools never appear in the adoption guide", async () => {
  const answer = await journey();
  const catalog = loadCatalog();
  const plan = buildPlan({ answer, choices: { no_online_booking: "booknest" }, catalog, currentTools: [] });
  const guide = buildAdoptionGuide(plan, answer, catalog);
  assert.ok(!guide.selectedToolNames.includes("BookNest"));
});
