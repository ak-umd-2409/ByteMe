import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleJourneyAnswer, handleJourneyStart } from "../api/journey.ts";
import type { ApiDeps } from "../api/handlers.ts";
import { getPlacesProvider } from "../business/places.ts";
import { loadCatalog } from "../catalog/index.ts";
import { toCatalogTool } from "../catalog/toCatalogTool.ts";
import { disabledProvider, type LlmProvider } from "../llm/client.ts";
import { buildPlan } from "../plan/plan.ts";
import { recommend } from "../recommend/engine.ts";
import { loadConfig } from "../shared/config.ts";
import type { JourneyAnswerResponse, JourneyStartResponse } from "./types.ts";

const config = { ...loadConfig({}), journeySecret: null };
const base: ApiDeps = { config, places: getPlacesProvider(config), llm: disabledProvider, now: () => new Date("2026-11-07T12:00:00Z") };
const start = async (body: unknown, deps: ApiDeps = base) => {
  const res = await handleJourneyStart(body, deps);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body as JourneyStartResponse;
};
const answer = async (context: string, answers: Record<string, unknown>) => (await handleJourneyAnswer({ context, answers }, base)).body as JourneyAnswerResponse;

describe("edge cases: the journey stays honest when data is thin", () => {
  it("no website, no reviews, no Google listing: says what it couldn't check, finds nothing it can't prove", async () => {
    const s = await start({ manual: { name: "Corner Bakery", town: "Frederick" } });
    assert.ok(s.couldNotCheck.some((x) => /don't have a website/.test(x)));
    assert.ok(s.couldNotCheck.some((x) => /no reviews/.test(x)));
    assert.ok(s.couldNotCheck.some((x) => /Google listing/.test(x)));
    const a = await answer(s.context, {});
    assert.equal(a.opportunities.length, 0, "no evidence, no findings");
    assert.match(a.headline, /didn't find anything with clear evidence/);
    assert.equal(a.recommendation.ready, false);
    // The owner can still say what happens, and then gets a fix and a plan.
    const offered = s.questions.find((q) => q.id === "problems")!.options!.map((o) => o.value).filter((v) => v !== "none");
    assert.ok(offered.length > 0, "we still ask about problems common for the business type");
    const b = await answer(a.context, { [`problem.${offered[0]}`]: "yes" });
    assert.deepEqual(b.ignored, []);
    assert.equal(b.opportunities[0].basis, "you");
    const plan = buildPlan({ answer: b, choices: {}, catalog: loadCatalog(), currentTools: [] });
    assert.ok(plan.sections.length >= 1, "a plan even before any tool is chosen");
  });

  it("an unreachable website is reported, not judged", async () => {
    const deps: ApiDeps = {
      ...base,
      onboarding: {
        resolveHost: async () => ["93.184.216.34"],
        fetchImpl: (async () => {
          throw new Error("connect ETIMEDOUT");
        }) as never,
      },
    };
    const s = await start({ manual: { name: "Main Street Cafe", town: "Frederick", website: "https://mainstreetcafe-example.com" } }, deps);
    assert.ok(s.couldNotCheck.some((x) => /couldn't read your website/.test(x)), JSON.stringify(s.couldNotCheck));
    const a = await answer(s.context, {});
    assert.ok(!a.opportunities.some((o) => o.problemKey === "no_online_booking"), "an unreadable site isn't evidence of no booking");
  });

  it("an AI that fails or returns garbage changes nothing: rules still run", async () => {
    const garbage: LlmProvider = { name: "broken", complete: async () => "definitely not json" };
    const silent: LlmProvider = { name: "down", complete: async () => null };
    const plain = await start({ placeId: "public-frederick-heating-ac" });
    for (const llm of [garbage, silent]) {
      const s = await start({ placeId: "public-frederick-heating-ac" }, { ...base, llm });
      assert.deepEqual(s.learned.map((x) => x.text), plain.learned.map((x) => x.text));
      assert.deepEqual(s.questions.map((q) => q.id), plain.questions.map((q) => q.id));
    }
  });

  it("a problem with no Verified tool gets no recommendation, only an explanation", () => {
    const catalog = loadCatalog().map(toCatalogTool).filter((t): t is NonNullable<typeof t> => t !== null);
    const business = { name: "Test", industry: "hvac", county: "Frederick", state: "MD", monthlyBudget: 200, currentTools: [], needsHelp: false, dealBreakers: [], dataSensitivity: "normal" } as never;
    const out = recommend(business, [{ id: "problem-no_online_booking", useCase: "booking", title: "Customers can't book online", evidence: "Seen on the website" }] as never, catalog);
    const booking = out.problems[0];
    assert.equal(booking.options.length, 0, "BookNest isn't Verified yet");
    assert.ok(booking.excluded.some((x) => x.toolName === "BookNest"));
  });
});
