import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleJourneyAnswer, handleJourneyStart } from "../api/journey.ts";
import type { ApiDeps } from "../api/handlers.ts";
import { getPlacesProvider } from "../business/places.ts";
import { disabledProvider, type LlmProvider } from "../llm/client.ts";
import { loadConfig } from "../shared/config.ts";
import type { JourneyAnswerResponse, JourneyStartResponse } from "../journey/types.ts";
import { interpretChallenges, splitChallenges, type ReviewText } from "./interpret.ts";
import { libraryFor } from "./library.ts";
import { matchSuggestions, type ChallengeSuggestion } from "./match.ts";

const FREDERICK = "public-frederick-heating-ac";
const config = { ...loadConfig({}), journeySecret: null };
const deps: ApiDeps = { config, places: getPlacesProvider(config), llm: disabledProvider, now: () => new Date("2026-11-07T12:00:00Z") };

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

/** A model that always returns the same JSON, to test what we accept from it. */
const fakeLlm = (reply: unknown, name = `fake-${Math.random()}`): LlmProvider => ({ name, complete: async () => JSON.stringify(reply) });

describe("challenge suggestions", () => {
  it("are different for different kinds of business", () => {
    const hvac = libraryFor("hvac").map((e) => e.text);
    const salon = libraryFor("salon").map((e) => e.text);
    const food = libraryFor("restaurant").map((e) => e.text);
    assert.equal(hvac.filter((t) => salon.includes(t)).length, 0);
    assert.equal(food.filter((t) => hvac.includes(t)).length, 0);
    assert.ok(hvac.some((t) => /estimate/i.test(t)));
    assert.ok(salon.some((t) => /cancellation/i.test(t)));
    assert.ok(food.some((t) => /catering/i.test(t)));
  });

  it("narrow to what the owner is typing, and leave out picked ones", () => {
    const all: ChallengeSuggestion[] = libraryFor("hvac").map((e) => ({ id: e.id, text: e.text, why: "", source: "industry", keywords: e.keywords }));
    assert.equal(matchSuggestions(all, "").length, 5);
    const quotes = matchSuggestions(all, "chasing quotes");
    assert.ok(quotes.length > 0 && /quote|estimate/i.test(quotes[0]!.text), "best match first");
    assert.ok(!matchSuggestions(all, "quotes", [quotes[0]!.id]).some((s) => s.id === quotes[0]!.id));
    assert.deepEqual(matchSuggestions(all, "zzzz qqqq"), []);
  });

  it("start with what this business's reviews and website show, then everyday ones", async () => {
    const s = await start(FREDERICK);
    const q = s.questions[0]!;
    assert.equal(q.id, "challenges");
    assert.ok(q.suggestions && q.suggestions.length >= 5 && q.suggestions.length <= 12);
    const sources = q.suggestions.map((x) => x.source);
    const firstIndustry = sources.indexOf("industry");
    assert.ok(sources.slice(firstIndustry).every((x) => x === "industry" || x === "services"), "evidence before everyday");
    assert.ok(q.suggestions.every((x) => x.why.length > 0), "every suggestion says why");
  });
});

describe("the owner's challenges", () => {
  it("splits several challenges written in one box", () => {
    assert.deepEqual(splitChallenges("Answering calls all day\n- writing quotes at night; keeping up with Instagram"), [
      "Answering calls all day",
      "writing quotes at night",
      "keeping up with Instagram",
    ]);
  });

  it("without AI: maps what it can, and keeps the rest in the owner's own words", async () => {
    const out = await interpretChallenges({ text: "I spend hours writing quotes\nOur catering trays keep running out", picks: [], suggestions: [], industry: "restaurant", business: "X", reviews: [] });
    assert.equal(out.length, 2);
    assert.equal(out[0]!.problem, "slow_quotes");
    assert.equal(out[1]!.problem, null);
    assert.match(out[1]!.whatsHappening, /In your words: “Our catering trays keep running out”/);
    assert.equal(out[1]!.by, "rules");
  });

  it("with AI: keeps only what the owner really said and reviews really say", async () => {
    const reviews: ReviewText[] = [{ id: "r1", rating: 2, text: "I emailed twice about a party order and never heard back.", where: "Google", author: "Sam", url: null }];
    const llm = fakeLlm({
      challenges: [
        {
          quote: "slow to answer emails about catering",
          title: "Slow replies to catering emails",
          whatsHappening: "Catering requests by email wait a while for an answer.",
          whyItMatters: "Large orders go to whoever replies first.",
          problemKey: "slow_responses",
          useCase: "customer-messaging",
          aiCanHelp: "partly",
          aiHow: "An inbox assistant can draft replies for you to check.",
          firstStep: "Set a saved reply with your catering menu.",
          reviews: [
            { reviewId: "r1", quote: "never heard back" },
            { reviewId: "r1", quote: "made-up words the customer never wrote" },
          ],
        },
        { quote: "something the owner never typed", title: "Invented", whatsHappening: "Not real at all here.", whyItMatters: null, problemKey: null, useCase: null, aiCanHelp: "no", aiHow: "n/a n/a", firstStep: null, reviews: [] },
      ],
    });
    const out = await interpretChallenges({ text: "We're slow to answer emails about catering", picks: [], suggestions: [], industry: "restaurant", business: "X", reviews, llm });
    assert.equal(out.length, 1, "the invented challenge is dropped");
    assert.equal(out[0]!.by, "ai");
    assert.deepEqual(out[0]!.reviews, [{ reviewId: "r1", quote: "never heard back" }], "only the verbatim review quote is kept");
    assert.equal(out[0]!.ai?.level, "partly");
  });

  it("merges a picked suggestion with the same problem the owner typed", async () => {
    const suggestions: ChallengeSuggestion[] = [{ id: "s1", text: "Writing quotes at night", why: "", source: "industry", keywords: [], problem: "slow_quotes", useCase: "quotes" }];
    const out = await interpretChallenges({ text: "quotes take forever", picks: ["s1"], suggestions, industry: "hvac", business: "X", reviews: [] });
    assert.equal(out.length, 1);
    assert.match(out[0]!.words, /quotes take forever · Writing quotes at night/);
  });
});

describe("findings", () => {
  it("separate what the owner told us, what we noticed, and what's worth considering", async () => {
    const s = await start(FREDERICK);
    const a = await answer(s.context, { challenges: "I can't answer the phone when I'm on a job\nKeeping up with Instagram" });
    const f = a.findings;
    assert.equal(f.yours.length, 2);
    assert.ok(f.yours.every((x) => x.group === "yours" && x.ownerWords.length > 0));
    assert.equal(f.yours[0]!.problemKey, "missed_inquiries");
    assert.equal(f.yours[1]!.problemKey, null, "not every challenge has to fit the problem list");
    assert.equal(f.yours[1]!.useCase, "marketing");
    assert.ok(f.noticed.every((x) => x.evidence.length > 0 && !f.yours.some((y) => y.problemKey && y.problemKey === x.problemKey)), "noticed = evidence the owner didn't mention");
    assert.ok(f.consider.every((x) => x.confidence.level === "low" && x.evidence.length === 0));
    assert.equal(f.reviewsRead.count, s.customersSay.reviewCount, "never more reviews than we read");
    assert.ok(a.youToldUs.some((y) => y.questionId === "challenges"));
    // The owner's marketing challenge reaches Part 4 in their words.
    if (a.recommendation.ready) assert.ok(a.recommendation.request.problems.some((p) => p.useCase === "marketing" && /owner told us/.test(p.evidence)));
  });

  it("connects what the owner said to reviews that say the same", async () => {
    const s = await start(FREDERICK);
    const a = await answer(s.context, { challenges: "writing quotes takes my evenings" });
    const quotes = a.findings.yours.find((x) => x.problemKey === "slow_quotes")!;
    assert.ok(quotes);
    assert.equal(quotes.confidence.level, quotes.connection ? "high" : "medium");
  });

  it("picked suggestions count, unknown ids are ignored", async () => {
    const s = await start(FREDERICK);
    const id = s.questions[0]!.suggestions![0]!.id;
    const a = await answer(s.context, { challenge_picks: [id] });
    assert.equal(a.findings.yours.length, 1);
    const bad = await answer(s.context, { challenge_picks: ["nope"] });
    assert.ok(bad.ignored.some((i) => i.questionId === "challenge_picks"));
  });

  it("with AI on, the owner's words are read once and cached", async () => {
    let calls = 0;
    const llm: LlmProvider = {
      name: "count",
      complete: async (req) => {
        if (req.task !== "owner_challenges") return null;
        calls++;
        return JSON.stringify({ challenges: [] });
      },
    };
    const d = { ...deps, llm };
    const s = await start(FREDERICK, d);
    await answer(s.context, { challenges: "invoices pile up every week" }, d);
    await answer(s.context, { challenges: "invoices pile up every week" }, d);
    assert.equal(calls, 1);
  });
});
