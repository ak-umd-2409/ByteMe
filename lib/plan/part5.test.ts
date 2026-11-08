import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleJourneyAnswer, handleJourneyStart } from "../api/journey.ts";
import type { ApiDeps } from "../api/handlers.ts";
import { handlePlanOpen, handlePlanShare, openSavedShare, type PlanDeps } from "../api/plan.ts";
import { getPlacesProvider } from "../business/places.ts";
import { loadTestCatalog as loadCatalog } from "../catalog/index.ts";
import type { JourneyAnswerResponse, JourneyStartResponse } from "../journey/types.ts";
import { disabledProvider } from "../llm/client.ts";
import { loadConfig } from "../shared/config.ts";
import type { Kv } from "../shared/kv.ts";
import { readyContent } from "./content.ts";
import { buildPlan, planText, resourcesFor } from "./plan.ts";

const config = { ...loadConfig({}), journeySecret: null };
const NOW = new Date("2026-11-07T12:00:00Z");
const api: ApiDeps = { config, places: getPlacesProvider(config), llm: disabledProvider, now: () => NOW };
const catalog = loadCatalog();

async function journey(placeId: string, answers: Record<string, unknown>) {
  const s = (await handleJourneyStart({ placeId }, api)).body as JourneyStartResponse;
  return (await handleJourneyAnswer({ context: s.context, answers }, api)).body as JourneyAnswerResponse;
}

function memoryKv(): Kv & { data: Map<string, { value: string; ttl?: number }> } {
  const data = new Map<string, { value: string; ttl?: number }>();
  return {
    data,
    get: async (k) => data.get(k)?.value ?? null,
    set: async (k, value, ttl) => void data.set(k, { value, ttl }),
    incrByFloat: async () => 0,
  };
}

const PHONE = { "problem.missed_inquiries": "yes", "problem.slow_quotes": "yes", "impact.missed_per_week": 4, "impact.average_job_value": 400 };

describe("30-day plan (spec §5.1)", () => {
  it("free fixes in week 1, then one tool at a time, each checked two weeks later", async () => {
    const a = await journey("public-frederick-heating-ac", PHONE);
    const plan = buildPlan({ answer: a, choices: { missed_inquiries: "ringwise-receptionist", slow_quotes: "quotequick" }, catalog, currentTools: [] });
    const tools = plan.sections.filter((s) => s.tool);
    assert.equal(tools.length, 2);
    const weekOf = (sectionIdx: number, suffix: string) => tools[sectionIdx]!.steps.find((s) => s.id.endsWith(suffix))!.week;
    const hasFree = plan.sections.some((s) => !s.tool);
    const first = hasFree ? 2 : 1;
    assert.equal(weekOf(0, "-signup"), first);
    assert.equal(weekOf(0, "-check"), first + 2);
    assert.equal(weekOf(1, "-signup"), first + 2, "second tool only starts once the first is in");
    assert.ok(plan.sections.filter((s) => !s.tool).every((s) => s.steps.every((st) => st.week === 1)));
    // Weeks list every step exactly once, in order, with "After day 30" for what doesn't fit.
    const all = plan.sections.flatMap((s) => s.steps).length;
    assert.equal(plan.weeks.reduce((n, w) => n + w.steps.length, 0), all);
    assert.deepEqual(plan.weeks.map((w) => w.week), [...plan.weeks.map((w) => w.week)].sort());
    assert.ok(plan.weeks.every((w) => w.week <= 5));
    if (weekOf(1, "-check") > 4) assert.equal(plan.weeks.at(-1)!.label, "After day 30");
  });

  it("the email text lists the weeks and adds the link only when there is one", async () => {
    const a = await journey("public-frederick-heating-ac", PHONE);
    const plan = buildPlan({ answer: a, choices: { missed_inquiries: "ringwise-receptionist" }, catalog, currentTools: [] });
    const text = planText(plan, "https://example.org/plan/abc");
    assert.match(text, /Week 1 · days 1–7/);
    assert.match(text, /Full plan: https:\/\/example.org\/plan\/abc/);
    assert.doesNotMatch(planText(plan, null), /Full plan/);
    assert.ok(text.length < 1800, "short enough for a mailto link");
  });
});

describe("free money and help (spec §5.7)", () => {
  it("statewide links for everyone, county links only for that county, all https", () => {
    const frederick = resourcesFor("Frederick").map((r) => r.id);
    const baltimore = resourcesFor("Baltimore").map((r) => r.id);
    assert.ok(frederick.includes("frederick-oed"));
    assert.ok(!baltimore.includes("frederick-oed"));
    assert.ok(baltimore.includes("sba-lender-match") && baltimore.includes("sbdc-training"));
    assert.ok(resourcesFor(null).every((r) => r.url.startsWith("https://") && r.foundVia));
  });
});

describe("ready-to-use words (spec §5.2)", () => {
  it("only uses facts we have, announces recording when a tool records calls, and marks blanks", async () => {
    const a = await journey("public-frederick-heating-ac", PHONE);
    const withPhoneTool = buildPlan({ answer: a, choices: { missed_inquiries: "ringwise-receptionist" }, catalog, currentTools: [] });
    const words = readyContent(a.business, withPhoneTool, catalog);
    const greeting = words.find((w) => w.id === "greeting")!;
    assert.match(greeting.text, new RegExp(a.business.name));
    assert.match(greeting.text, /recorded/);
    assert.deepEqual(greeting.blanks, ["[your name]"]);
    assert.equal(words.filter((w) => w.id.startsWith("review-")).length, 3);

    const noTool = buildPlan({ answer: a, choices: {}, catalog, currentTools: [] });
    assert.doesNotMatch(readyContent(a.business, noTool, catalog)[0]!.text, /recorded/);

    const bare = readyContent({ name: "Test Shop", hours: null, address: null, phone: null, website: null }, noTool, catalog);
    assert.equal(bare.find((w) => w.id === "faq"), undefined, "no FAQ when we know nothing to answer with");
    assert.doesNotMatch(bare.find((w) => w.id === "after-hours")!.text, /hours are/);
    assert.match(bare.find((w) => w.id === "review-unhappy")!.text, /contact us directly/);
  });
});

describe("send my plan to my advisor (spec §5.4)", () => {
  async function setup() {
    const s = (await handleJourneyStart({ placeId: "public-frederick-heating-ac" }, api)).body as JourneyStartResponse;
    const a = (await handleJourneyAnswer({ context: s.context, answers: PHONE }, api)).body as JourneyAnswerResponse;
    return a;
  }

  it("saves a 30-day read-only link and rebuilds the same plan from it", async () => {
    const a = await setup();
    const kv = memoryKv();
    const deps: PlanDeps = { api, kv, catalog, now: () => NOW, newId: () => "abcdefghijklmnop1234" };
    const res = await handlePlanShare({ context: a.context, choices: { missed_inquiries: "ringwise-receptionist" }, currentTools: ["Square"] }, deps);
    assert.equal(res.status, 200);
    const body = res.body as { path: string; stored: boolean; expiresAt: string };
    assert.equal(body.path, "/plan/abcdefghijklmnop1234");
    assert.equal(body.stored, true);
    assert.equal(body.expiresAt, "2026-12-07T12:00:00.000Z");
    assert.equal([...kv.data.values()][0]!.ttl, 30 * 86_400);

    const opened = await openSavedShare("abcdefghijklmnop1234", deps);
    assert.ok(opened.ok);
    const ownerPlan = buildPlan({ answer: a, choices: { missed_inquiries: "ringwise-receptionist" }, catalog, currentTools: ["Square"] });
    assert.deepEqual(opened.view.plan.sections.map((x) => x.id), ownerPlan.sections.map((x) => x.id));
    assert.equal(opened.view.business.name, a.business.name);
    assert.ok(opened.view.talkAbout.some((x) => /records calls/.test(x)));
    assert.ok(opened.view.talkAbout.some((x) => /sample tool/.test(x)), "the advisor is told a sample tool isn't real");
    assert.deepEqual(await openSavedShare("nottherealid000000000", deps), { ok: false, reason: "missing" });
    assert.deepEqual(await openSavedShare("../../etc", deps), { ok: false, reason: "missing" });
  });

  it("without storage, the link carries the plan after # and still opens", async () => {
    const a = await setup();
    const deps: PlanDeps = { api, kv: null, catalog, now: () => NOW };
    const res = await handlePlanShare({ context: a.context, choices: { missed_inquiries: "ringwise-receptionist" } }, deps);
    const body = res.body as { path: string; stored: boolean; expiresAt: null };
    assert.equal(body.stored, false);
    assert.equal(body.expiresAt, null);
    assert.ok(body.path.startsWith("/plan/view#p1."));
    const open = await handlePlanOpen({ link: body.path.split("#")[1] }, deps);
    assert.equal(open.status, 200);
    assert.ok((open.body as { plan: { sections: { tool: { id: string } | null }[] } }).plan.sections.some((x) => x.tool?.id === "ringwise-receptionist"));
    assert.deepEqual(await openSavedShare("abcdefghijklmnop1234", deps), { ok: false, reason: "unavailable" });
  });

  it("falls back to a self-contained link when storage fails, and rejects bad input", async () => {
    const a = await setup();
    const broken: Kv = { get: async () => null, set: async () => Promise.reject(new Error("down")), incrByFloat: async () => 0 };
    const res = await handlePlanShare({ context: a.context, choices: {} }, { api, kv: broken, catalog, now: () => NOW });
    assert.equal(res.status, 200);
    assert.equal((res.body as { stored: boolean }).stored, false);

    assert.equal((await handlePlanShare({ context: "j1.nope", choices: {} }, { api, kv: null, catalog })).status, 400);
    assert.equal((await handlePlanShare({}, { api, kv: null, catalog })).status, 400);
    assert.equal((await handlePlanOpen({ link: "p1.!!!!" }, { api, kv: null, catalog })).status, 400);
  });

  it("a link edited to name an unreviewed or made-up tool doesn't put it in the plan", async () => {
    const a = await setup();
    const kv = memoryKv();
    const deps: PlanDeps = { api, kv, catalog, now: () => NOW, newId: () => "zzzzzzzzzzzzzzzz0000" };
    await handlePlanShare({ context: a.context, choices: { missed_inquiries: "squarre-voice-ai", slow_quotes: "not-a-tool" } }, deps);
    const opened = await openSavedShare("zzzzzzzzzzzzzzzz0000", deps);
    assert.ok(opened.ok);
    assert.ok(!opened.view.plan.sections.some((x) => x.tool?.id === "squarre-voice-ai" || x.tool?.id === "not-a-tool"));
  });
});
