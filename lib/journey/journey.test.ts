import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadTestCatalog as loadCatalog } from "../catalog/index.ts";
import { toCatalogTool } from "../catalog/toCatalogTool.ts";
import { handleJourneyAnswer, handleJourneyStart } from "../api/journey.ts";
import type { ApiDeps } from "../api/handlers.ts";
import { getPlacesProvider } from "../business/places.ts";
import { disabledProvider } from "../llm/client.ts";
import { recommend } from "../recommend/engine.ts";
import { PROBLEMS } from "../problems/catalog.ts";
import { loadConfig } from "../shared/config.ts";
import type { JourneyAnswerResponse, JourneyStartResponse } from "./types.ts";

const FREDERICK = "public-frederick-heating-ac";
const DAVES = "public-daves-cooling-heating";

function makeDeps(secret: string | null = null): ApiDeps {
  const config = { ...loadConfig({}), journeySecret: secret };
  return { config, places: getPlacesProvider(config), llm: disabledProvider, now: () => new Date("2026-11-07T12:00:00Z") };
}
const deps = makeDeps();

async function start(placeId: string, d = deps): Promise<JourneyStartResponse> {
  const res = await handleJourneyStart({ placeId }, d);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body as JourneyStartResponse;
}
async function answer(context: string, answers: Record<string, unknown>, d = deps): Promise<JourneyAnswerResponse> {
  const res = await handleJourneyAnswer({ context, answers }, d);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body as JourneyAnswerResponse;
}

describe("journey start: understand the business", () => {
  for (const id of [FREDERICK, DAVES]) {
    it(`${id}: a short, sourced summary and only purposeful questions`, async () => {
      const s = await start(id);
      assert.ok(s.business.name.length > 0);
      assert.ok(s.learned.length >= 2 && s.learned.length <= 4);
      for (const item of s.learned) assert.ok(item.sources.length > 0 && item.sources.every((x) => x.url), `${item.id} links its sources`);
      const core = s.questions.filter((q) => !q.optional && !q.showIf);
      assert.ok(core.length <= 6, `at most 6 core questions up front (got ${core.length})`);
      for (const q of s.questions) {
        assert.ok(q.why.length > 10, `${q.id} says why it's asked`);
        assert.ok(q.ifSkipped.length > 3, `${q.id} says what happens if skipped`);
        assert.ok(q.affects.length > 0);
      }
      // Things public info already answers, or that rarely matter, are not asked.
      const ids = s.questions.map((q) => q.id);
      for (const dropped of ["team_size", "large_customer_list", "outbound_consent"]) assert.ok(!ids.includes(dropped));
      // Nothing internal leaks into the summary.
      const text = JSON.stringify({ learned: s.learned, questions: s.questions });
      assert.doesNotMatch(text, /broadband|census|SBDC|weight|score|confidence/i);
    });
  }

  it("never shows a rating averaged from the few reviews we read", async () => {
    const s = await start(FREDERICK); // ratings here come from our sample of testimonials, not a platform
    assert.equal(s.business.rating, null);
    const d = await start(DAVES); // published platform rating
    assert.equal(d.business.rating?.value, 4.7);
  });

  it("asks which hours are right only when listings disagree, and hides disputed hours", async () => {
    const d = await start(DAVES);
    assert.ok(d.questions.some((q) => q.id === "listing.hours"));
    assert.equal(d.business.hours, null);
    const f = await start(FREDERICK);
    assert.ok(!f.questions.some((q) => q.id.startsWith("listing.")));
    assert.ok(f.business.hours);
  });

  it("only asks about problems public evidence doesn't already cover, one per kind", async () => {
    const s = await start(FREDERICK);
    const q = s.questions.find((x) => x.id === "problems")!;
    const keys = q.options!.map((o) => o.value).filter((v) => v !== "none");
    assert.ok(!keys.includes("no_online_booking"), "already seen on the website");
    assert.ok(!keys.includes("scheduling_inefficiency"), "same kind as online booking, which is covered");
    const categories = keys.map((k) => PROBLEMS[k as keyof typeof PROBLEMS].category.key);
    assert.equal(new Set(categories).size, categories.length);
    // Counter-evidence is shown next to the option, not hidden.
    assert.match(q.options!.find((o) => o.value === "missed_inquiries")?.hint ?? "", /respond quickly/);
  });

  it("asks the call-recording question only when a phone tool could come up", async () => {
    const s = await start(FREDERICK);
    const q = s.questions.find((x) => x.id === "call_recording")!;
    assert.deepEqual(q.showIf, { questionId: "problems", includesAny: ["missed_inquiries"] });
    assert.ok(q.source?.url?.includes("mgaleg.maryland.gov"));
  });

  it("works for a business typed in by hand (not listed)", async () => {
    const res = await handleJourneyStart({ manual: { name: "Corner Bakery", town: "Frederick" } }, deps);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const s = res.body as JourneyStartResponse;
    assert.equal(s.business.name, "Corner Bakery");
    assert.ok(s.business.facts.find((f) => f.id === "name")?.source === "You told us");
    const a = await answer(s.context, { budget: "up_to_50" });
    assert.ok(Array.isArray(a.opportunities));
  });

  it("rejects bad input", async () => {
    assert.equal((await handleJourneyStart({}, deps)).status, 400);
    assert.equal((await handleJourneyStart({ placeId: "public-does-not-exist" }, deps)).status, 404);
  });
});

describe("journey answer: what's holding the business back", () => {
  it("skipping everything still gives evidence-backed results, with no made-up dollar figures", async () => {
    const s = await start(FREDERICK);
    const a = await answer(s.context, {});
    assert.ok(a.opportunities.length >= 1 && a.opportunities.length <= 3);
    for (const o of a.opportunities) {
      assert.equal(o.impact, null, `${o.problemKey} has no $ without owner numbers`);
      assert.ok(o.evidence.length > 0 && o.evidence.every((e) => e.url), `${o.problemKey} links its evidence`);
      assert.notEqual(o.status, "unverified");
    }
    assert.ok(a.opportunities.some((o) => o.problemKey === "no_online_booking"));
    // Unasked-about guesses are listed as not checked, never as findings.
    assert.ok(a.toCheck.some((t) => t.problemKey === "missed_inquiries"));
    assert.ok(!a.opportunities.some((o) => o.problemKey === "missed_inquiries"));
    // Assumptions are said out loud.
    assert.ok(a.assumptions.some((x) => x.questionId === "budget"));
    assert.equal(a.youToldUs.length, 0);
    assert.ok(a.recommendation.ready);
    assert.deepEqual(a.budget, { value: 100, assumed: true });
    // Free local help for the county (Jefferson is in Frederick County).
    assert.equal(a.localHelp?.name, "Maryland SBDC · Northern Region");
    assert.equal(a.localHelp?.county, "Frederick");
  });

  it("owner answers confirm problems, set filters and unlock estimates from their own numbers", async () => {
    const s = await start(FREDERICK);
    // The tool choices follow the real catalog; pick QuickBooks when offered, else the first choice.
    const offeredTools = s.questions.find((q) => q.id === "tools")?.options?.map((o) => o.value) ?? [];
    assert.ok(offeredTools.length > 0, "the tools question offers at least one product");
    const a = await answer(s.context, {
      problems: ["missed_inquiries"],
      call_recording: "no",
      tools: offeredTools.includes("QuickBooks") ? ["QuickBooks"] : offeredTools.slice(0, 1),
      budget: "up_to_200",
      setup: "help",
      "impact.missed_per_week": 3,
      "impact.average_job_value": 450,
    });
    const missed = a.opportunities.find((o) => o.problemKey === "missed_inquiries")!;
    assert.equal(missed.status, "confirmed");
    assert.equal(missed.basis, "you");
    assert.match(missed.counterEvidence ?? "", /respond quickly/, "counter-evidence stays visible");
    assert.ok(missed.impact);
    assert.equal(missed.impact!.monthly.expected, Math.round(3 * 0.25 * 450 * 4.33));
    assert.deepEqual(missed.impact!.yourNumbers.map((n) => n.value).sort(), [3, 450]);
    assert.ok(missed.impact!.assumed.length > 0, "industry assumptions are named");
    assert.ok(a.recommendation.ready);
    if (a.recommendation.ready) {
      const b = a.recommendation.request.business;
      assert.equal(b.monthlyBudget, 200);
      assert.equal(b.needsHelp, true);
      assert.ok(b.dealBreakers.includes("no-recording"));
      // QuickBooks counts only when the real catalog offers it as an option (it follows the catalog).
      assert.ok(b.currentTools.includes("Squarespace"));
      for (const t of offeredTools.includes("QuickBooks") ? ["QuickBooks"] : offeredTools.slice(0, 1)) assert.ok(b.currentTools.includes(t));
      assert.ok(a.recommendation.request.problems.some((p) => p.useCase === "missed-calls"));
      // The request is exactly what Part 4 accepts.
      // Same catalog /api/recommend uses.
      const catalog = loadCatalog().map(toCatalogTool).filter((x): x is NonNullable<typeof x> => x !== null);
      const out = recommend(b, a.recommendation.request.problems, catalog);
      const missed = out.problems.find((p) => p.problem.useCase === "missed-calls")!;
      // The owner said no recording, and the only Verified phone tool records calls, so it's left out, with a reason.
      assert.equal(missed.options.length, 0);
      assert.ok(missed.excluded.some((x) => /record/i.test(x.reason)));
      assert.equal(out.forBusiness, "Frederick Heating & Air Conditioning");
      assert.equal(out.problems.length, a.recommendation.request.problems.length);
    }
    assert.equal(a.assumptions.length, 0);
    assert.ok(a.youToldUs.some((y) => y.questionId === "budget"));
    assert.deepEqual(a.budget, { value: 200, assumed: false });
  });

  it("problems the owner says don't happen disappear; their own words bring one back", async () => {
    const s = await start(FREDERICK);
    const no = await answer(s.context, { problems: ["none"] });
    assert.ok(!no.opportunities.some((o) => o.basis !== "public"));
    assert.equal(no.toCheck.length, 0);
    const words = await answer(no.context, { anything_else: "writing quotes every night after jobs" });
    assert.ok(words.opportunities.some((o) => o.problemKey === "slow_quotes"));
  });

  it("never shows two problems of the same kind as separate opportunities", async () => {
    const s = await start(FREDERICK);
    const a = await answer(s.context, { anything_else: "scheduling and dispatching takes all morning" });
    const cats = a.opportunities.map((o) => PROBLEMS[o.problemKey].category.key);
    assert.equal(new Set(cats).size, cats.length);
    const booking = a.opportunities.find((o) => PROBLEMS[o.problemKey].category.key === "booking_scheduling")!;
    assert.ok(booking.alsoCovers.length === 1, "the overlapping problem is folded in");
  });

  it("follow-up questions ask only for the numbers the top problems need", async () => {
    const s = await start(FREDERICK);
    const a = await answer(s.context, { problems: ["slow_quotes"] });
    assert.ok(a.followUps.length >= 1 && a.followUps.length <= 4);
    assert.ok(a.followUps.every((q) => q.kind === "number" && q.optional));
    const quotes = a.opportunities.find((o) => o.problemKey === "slow_quotes")!;
    assert.deepEqual(quotes.impactNeeds, ["impact.slow_quotes.hours_per_week"]);
    const b = await answer(a.context, { "impact.slow_quotes.hours_per_week": 4 });
    const after = b.opportunities.find((o) => o.problemKey === "slow_quotes")!;
    assert.ok(after.impact && after.impact.kind === "time_cost");
    assert.ok(!b.followUps.some((q) => q.id === "impact.slow_quotes.hours_per_week"));
  });

  it("free fixes never get a dollar figure", async () => {
    const s = await start(DAVES);
    const a = await answer(s.context, { "impact.average_job_value": 400 });
    const info = a.opportunities.find((o) => o.problemKey === "inconsistent_business_info")!;
    assert.equal(info.impact, null);
    assert.equal(info.fix.kind, "free");
    assert.ok(info.impactNote);
  });

  it("the right hours turn into an exact fix list and show on the business card", async () => {
    const s = await start(DAVES);
    const q = s.questions.find((x) => x.id === "listing.hours")!;
    const pick = q.options!.find((o) => o.label.startsWith("Mon"))!;
    const a = await answer(s.context, { "listing.hours": pick.value });
    const info = a.opportunities.find((o) => o.problemKey === "inconsistent_business_info")!;
    assert.match(info.fix.nextStep, /^Change BBB, .*to show “Mon–Fri/);
    assert.match(info.fix.nextStep, /address and phone number/);
    assert.equal(a.business.hours, pick.label);
    // Listing evidence names both sides and links every listing involved.
    const hours = info.evidence.find((e) => e.title?.includes("hours"))!;
    assert.match(hours.text, /but/);
    assert.ok(hours.links.length >= 4);
  });

  it("only uses public listings as evidence of disagreement (one item per finding)", async () => {
    const s = await start(DAVES);
    const a = await answer(s.context, {});
    const info = a.opportunities.find((o) => o.problemKey === "inconsistent_business_info")!;
    const titles = info.evidence.map((e) => e.title);
    assert.equal(new Set(titles).size, titles.length);
    assert.equal(info.statusLabel, "Seen in 6 public listings");
  });
});

describe("journey: what the screens need (wireframes v1)", () => {
  it("lists each business fact with where it came from, and hides disputed hours", async () => {
    const f = await start(FREDERICK);
    const byId = Object.fromEntries(f.business.facts.map((x) => [x.id, x]));
    assert.equal(byId.name.source, "Public listings");
    assert.equal(byId.type.editable, false);
    assert.ok(byId.hours.value);
    const d = await start(DAVES);
    assert.ok(!d.business.facts.some((x) => x.id === "hours"), "settled by the Which-is-right question");
  });

  it("an edit replaces the fact and says “You told us”", async () => {
    const s = await start(FREDERICK);
    const a = await answer(s.context, { "edit.phone": "(240) 555-0100" });
    const phone = a.business.facts.find((x) => x.id === "phone")!;
    assert.equal(phone.value, "(240) 555-0100");
    assert.equal(phone.source, "You told us");
    assert.ok(a.youToldUs.some((y) => y.questionId === "edit.phone"));
    const bad = await answer(s.context, { "edit.type": "Bakery" });
    assert.ok(bad.ignored.some((i) => i.questionId === "edit.type"));
  });

  it("customer themes count reviews and carry an exact, attributed excerpt", async () => {
    const d = await start(DAVES);
    assert.ok(d.customersSay.reviewCount > 0);
    for (const t of d.customersSay.themes) {
      assert.match(t.countLabel, /^from \d+ of \d+ reviews?$/);
      if (t.example) assert.ok(t.example.url && (t.example.who || t.example.where));
    }
    const f = await start(FREDERICK);
    assert.match(f.customersSay.note ?? "", /testimonials/);
    assert.ok(f.toolsFound.some((t) => t.name === "Squarespace" && t.url));
    assert.ok(f.mode.capturedAt);
  });

  it("per-problem Yes/No works without touching the others", async () => {
    const s = await start(FREDERICK);
    const a = await answer(s.context, { "problem.missed_inquiries": "yes" });
    assert.ok(a.opportunities.some((o) => o.problemKey === "missed_inquiries" && o.basis === "you"));
    assert.ok(a.toCheck.some((t) => t.problemKey === "slow_quotes"), "unanswered ones stay not-checked");
    const b = await answer(a.context, { "problem.slow_quotes": "no" });
    assert.ok(!b.toCheck.some((t) => t.problemKey === "slow_quotes"));
    assert.ok(b.toCheck.some((t) => t.problemKey === "no_customer_follow_up"));
    const rec = await answer(a.context, { call_recording: "no" });
    assert.ok(rec.recommendation.ready && rec.recommendation.request.business.dealBreakers.includes("no-recording"), "recording question applies after a per-problem yes");
    const bad = await answer(s.context, { "problem.no_online_booking": "yes" });
    assert.ok(bad.ignored.some((i) => i.questionId === "problem.no_online_booking"), "already evidenced, not asked");
  });

  it("“what matters most” takes up to 2", async () => {
    const s = await start(FREDERICK);
    const q = s.questions.find((x) => x.id === "goals")!;
    assert.equal(q.maxSelect, 2);
    const a = await answer(s.context, { goals: ["save_time", "more_customers", "better_reviews"] });
    assert.ok(a.ignored.some((i) => i.questionId === "goals"));
    const b = await answer(s.context, { goals: ["save_time"] });
    assert.ok(b.youToldUs.some((y) => y.questionId === "goals" && y.value === "Save time"));
  });
});

describe("journey context: remembers answers safely", () => {
  it("keeps earlier answers, and null clears one", async () => {
    const s = await start(FREDERICK);
    const a = await answer(s.context, { budget: "up_to_50" });
    const b = await answer(a.context, { setup: "help" });
    assert.ok(b.youToldUs.some((y) => y.questionId === "budget"));
    assert.ok(b.youToldUs.some((y) => y.questionId === "setup"));
    const c = await answer(b.context, { budget: null });
    assert.ok(!c.youToldUs.some((y) => y.questionId === "budget"));
    assert.ok(c.assumptions.some((x) => x.questionId === "budget"));
  });

  it("reports answers it can't use instead of failing", async () => {
    const s = await start(FREDERICK);
    const a = await answer(s.context, { budget: "a million", team_size: 4, "impact.average_job_value": -5, tools: ["x".repeat(50)] }); // typed tool names are fine; over 40 characters is not
    const ids = a.ignored.map((i) => i.questionId).sort();
    assert.deepEqual(ids, ["budget", "impact.average_job_value", "team_size", "tools"]);
    assert.ok(a.assumptions.some((x) => x.questionId === "budget"));
  });

  it("rejects a damaged context", async () => {
    const s = await start(FREDERICK);
    const broken = s.context.slice(0, -12) + "AAAAAAAAAAAA";
    assert.equal((await handleJourneyAnswer({ context: broken, answers: {} }, deps)).status, 400);
    assert.equal((await handleJourneyAnswer({ context: "nope", answers: {} }, deps)).status, 400);
  });

  it("with JOURNEY_SECRET set, a context from another key is rejected", async () => {
    const signed = makeDeps("secret-one-0123456789");
    const s = await start(FREDERICK, signed);
    assert.equal((await handleJourneyAnswer({ context: s.context, answers: {} }, signed)).status, 200);
    const res = await handleJourneyAnswer({ context: s.context, answers: {} }, makeDeps("secret-two-0123456789"));
    assert.equal(res.status, 400);
    assert.equal((res.body as { error: { code: string } }).error.code, "invalid_context");
  });

  it("stays small enough to send back on every step", async () => {
    for (const id of [FREDERICK, DAVES]) assert.ok((await start(id)).context.length < 20_000);
  });
});
