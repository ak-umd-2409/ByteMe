import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleAdvisor, type AdvisorDeps } from "../api/advisor.ts";
import type { ApiDeps } from "../api/handlers.ts";
import { handleJourneyAnswer, handleJourneyStart } from "../api/journey.ts";
import { getPlacesProvider } from "../business/places.ts";
import { loadCatalog, loadTestCatalog } from "../catalog/index.ts";
import type { CatalogRecord } from "../catalog/types.ts";
import type { JourneyAnswerResponse, JourneyStartResponse } from "../journey/types.ts";
import { createOpenRouterProvider, disabledProvider, type LlmProvider } from "../llm/client.ts";
import { memoryLedger } from "../llm/ledger.ts";
import { loadConfig } from "../shared/config.ts";
import type { AdvisorReply } from "./types.ts";
import { budgetIn, understand } from "./understand.ts";
import { outsideFacts } from "./word.ts";

const config = { ...loadConfig({}), journeySecret: null };
const api: ApiDeps = { config, places: getPlacesProvider(config), llm: disabledProvider, now: () => new Date("2026-11-08T12:00:00Z") };

/** The test-only made-up tools, with the sample flag removed so the advisor treats them as checked. */
function fixtures(): CatalogRecord[] {
  const tools = loadTestCatalog().map((r) => {
    const { sample: _sample, ...rest } = r;
    return rest as CatalogRecord;
  });
  const ring = tools.find((t) => t.id === "ringwise-receptionist")!;
  // An AI feature inside software owners already use.
  tools.push({ ...structuredClone(ring), id: "inbox-assist", name: "Inbox Assist", existingProduct: "QuickBooks", useCases: ["customer-messaging"], industries: ["any"], worksWith: [] });
  return tools;
}

const deps = (catalog = fixtures(), llm: LlmProvider = disabledProvider): AdvisorDeps => ({ api, catalog, llm, kv: null });
const ask = async (body: Record<string, unknown>, d = deps()) => {
  const res = await handleAdvisor(body, d);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body as AdvisorReply;
};

async function frederickContext(answers: Record<string, unknown> = {}) {
  const s = (await handleJourneyStart({ placeId: "public-frederick-heating-ac" }, api)).body as JourneyStartResponse;
  const a = (await handleJourneyAnswer({ context: s.context, answers: { "problem.missed_inquiries": "yes", budget: "100", tools: ["Square"], ...answers } }, api)).body as JourneyAnswerResponse;
  return a;
}

describe("understanding the question (no AI)", () => {
  it("reads the questions owners actually ask", () => {
    const k = (q: string) => understand(q);
    assert.equal(k("How can I use AI in my HVAC business?").kind, "general");
    assert.equal(k("How can I use AI in my HVAC business?").industry, "hvac");
    assert.deepEqual(k("Can AI help me respond to customer enquiries?").topics, ["customer-messaging"]);
    assert.deepEqual(k("How can I reduce the time I spend preparing quotations?").topics, ["quotes"]);
    assert.deepEqual(k("Can I automate appointment scheduling?").topics, ["booking"]);
    assert.deepEqual(k("What AI tools can help with marketing?").topics, ["marketing"]);
    assert.equal(k("I have a $100 monthly budget. What can I realistically implement?").kind, "budget");
    assert.equal(k("I don't understand AI. Can you explain what I should start with?").kind, "explain");
    assert.equal(k("Can I use AI with the software I already have?").kind, "existing");
    assert.equal(k("Do I even need AI for my reviews?").kind, "when-not");
    assert.equal(k("what's the weather tomorrow").kind, "off-topic");
    assert.deepEqual(k("I use Square and QuickBooks Online").toolsNamed.sort(), ["QuickBooks Online", "Square"]);
    assert.notDeepEqual(k("Should I pay for ChatGPT?").topics, ["customer-messaging"]);
  });

  it("finds budgets in the ways people write them, and carries the topic into follow-ups", () => {
    assert.equal(budgetIn("I have $100 a month"), 100);
    assert.equal(budgetIn("about 250 dollars"), 250);
    assert.equal(budgetIn("$1,200/mo"), 1200);
    assert.equal(budgetIn("we have 3 staff"), null);
    const u = understand("how much would that cost me with $60?", [{ role: "owner", text: "Can AI answer my calls?" }]);
    assert.deepEqual(u.topics, ["missed-calls"]);
  });
});

describe("answers (rules only)", () => {
  it("answers a general HVAC question with checked tools that fit HVAC, and a free first step", async () => {
    const r = await ask({ message: "How can I use AI in my HVAC business?" });
    assert.equal(r.mode, "rules");
    assert.match(r.answer, /heating and cooling business/);
    assert.ok(r.tools.length > 0);
    assert.ok(r.tools.some((t) => t.id === "ringwise-receptionist"));
    assert.ok(r.freeFirst.length > 0 && r.freeFirst[0]!.detail.includes("Free"));
    assert.ok(r.notNeeded);
    assert.ok(r.followUps.length >= 2);
  });

  it("only recommends Verified tools: listed, blocked and sample tools never appear", async () => {
    const catalog = fixtures();
    const r = await ask({ message: "Can AI help me with bookings and customer messages for my salon?" }, deps(catalog));
    const byId = new Map(catalog.map((c) => [c.id, c]));
    assert.ok(r.tools.every((t) => byId.get(t.id)?.badge === "verified"));
    assert.ok(!r.tools.some((t) => t.id === "booknest" || t.id === "texttide"));
    // No checked booking tool for salons: said plainly, not guessed.
    assert.ok(r.noToolYet.includes("Booking and scheduling"));
    assert.match(r.answer, /haven't checked a tool for booking/);
    const withSamples = loadTestCatalog(); // sample: true everywhere
    const s = await ask({ message: "How can I use AI in my HVAC business?" }, deps(withSamples));
    assert.equal(s.tools.length, 0);
  });

  it("uses the owner's results: their business, their problems, their budget", async () => {
    const a = await frederickContext();
    const r = await ask({ message: "Where should I start?", context: a.context });
    assert.equal(r.usedContext, true);
    assert.equal(r.business, a.business.name);
    assert.match(r.answer, /From your results/);
    assert.ok(r.nextSteps.some((s) => /30-day plan/.test(s)));
  });

  it("puts free fixes from the owner's results first, and never sells a tool for them", async () => {
    const a = await frederickContext();
    const free = a.opportunities.filter((o) => o.fix.kind === "free");
    assert.ok(free.length > 0, "the saved business has a free fix (listings that disagree)");
    const r = await ask({ message: "How do I fix this: your business details don't match everywhere?", context: a.context });
    assert.match(r.answer, /is a free fix/);
    assert.equal(r.freeFirst[0]!.title, free[0]!.headline);
    const b = await ask({ message: "I have $100 a month. What can I realistically do?", context: a.context });
    for (const f of free) if (f.useCase) assert.ok(!b.budgetPlan!.picks.some((p) => b.tools.find((t) => t.name === p.name)?.useCases.every((u) => u === f.useCase)), `no tool bought only for "${f.headline}"`);
  });

  it("fits a budget with listed prices only, and never goes over", async () => {
    const r = await ask({ message: "I have $100 a month for calls, quotes and reviews. What can I realistically do?", industry: "hvac" });
    assert.ok(r.budgetPlan);
    assert.equal(r.budgetPlan!.budget, 100);
    assert.ok(r.budgetPlan!.total <= 100);
    const catalog = fixtures();
    for (const p of r.budgetPlan!.picks) assert.equal(p.monthlyUsd, catalog.find((c) => c.name === p.name)!.pricing.small.monthlyUsd);
    assert.match(r.answer, /\$100 a month/);
  });

  it("prefers tools that work with software the owner already has, and says so when nothing does", async () => {
    const yes = await ask({ message: "Can I use AI with the Square and QuickBooks I already use?" });
    assert.equal(yes.tools[0]!.id, "inbox-assist");
    assert.equal(yes.tools[0]!.alreadyHave, true);
    assert.ok(yes.tools.some((t) => t.worksWithYours.some((w) => w.product === "Square" && w.how === "built in")));
    const no = await ask({ message: "Can I use AI with Toast, the software I already have?" });
    assert.equal(no.tools.length, 0);
    assert.match(no.answer, /None of the tools we've checked connect to Toast/);
    assert.match(no.answer, /never logs into your accounts/);
  });

  it("never suggests a non-HIPAA tool for patient calls or messages", async () => {
    const r = await ask({ message: "Can AI answer calls for my dental clinic?" });
    assert.equal(r.tools.length, 0);
    assert.match(r.answer, /HIPAA-ready/);
  });

  it("says when AI isn't needed, and stays on topic", async () => {
    const r = await ask({ message: "Do I really need AI for reviews? I'm a cafe" });
    assert.match(r.answer, /don't need AI for everything/);
    assert.ok(r.notNeeded);
    const off = await ask({ message: "who won the game last night" });
    assert.equal(off.tools.length, 0);
    assert.match(off.answer, /only help with running your business/);
  });

  it("explains AI from scratch in plain words", async () => {
    const r = await ask({ message: "I don't understand AI. Can you explain what I should start with?", industry: "salon" });
    assert.match(r.answer, /software that can read and write/);
    assert.match(r.answer, /one task/);
  });

  it("answers in general, with a notice, when saved results can't be opened", async () => {
    const r = await ask({ message: "How can I use AI in my HVAC business?", context: "j1.not-a-real-context" });
    assert.equal(r.usedContext, false);
    assert.match(r.notice ?? "", /couldn't open your saved results/);
  });

  it("rejects bad input", async () => {
    assert.equal((await handleAdvisor({}, deps())).status, 400);
    assert.equal((await handleAdvisor({ message: "x".repeat(601) }, deps())).status, 400);
    assert.equal((await handleAdvisor({ message: "hi", history: [{ role: "system", text: "x" }] }, deps())).status, 400);
  });
});

describe("AI answers: the model writes, the server checks", () => {
  type Out = { answer: string; toolIds?: string[]; freeSteps?: { title: string; detail: string }[]; notNeeded?: string | null; followUps?: string[] };
  const model = (name: string, out: Out | string, seen: string[] = []): LlmProvider => ({
    name,
    complete: async (req) => {
      seen.push(req.user);
      return typeof out === "string" ? out : JSON.stringify({ toolIds: [], freeSteps: [], notNeeded: null, followUps: ["What does it cost?", "How long does setup take?"], ...out });
    },
  });
  const hvacQ = { message: "Can AI answer my calls? I run an HVAC company" };

  it("gives the model the whole business: what we read, what customers say, problems with evidence, owner answers", async () => {
    const a = await frederickContext();
    const seen: string[] = [];
    await ask({ message: "Where should I start?", context: a.context }, deps(fixtures(), model("fake-brief", { answer: "Start with your listings, they disagree across sites." }, seen)));
    const sent = JSON.parse(seen[0]!);
    assert.equal(sent.BUSINESS.name, a.business.name);
    assert.ok(sent.BUSINESS.whatWeRead.some((t: string) => /website/i.test(t)), "what we read on the website");
    assert.ok(sent.BUSINESS.customersSay.reviewCount > 0, "review themes");
    assert.ok(sent.BUSINESS.problems[0].evidence.length > 0, "problem evidence");
    assert.ok(sent.BUSINESS.ownerSaid.length > 0, "the owner's answers");
    assert.ok(sent.CATALOG.length > 0 && sent.CATALOG.every((t: { id: string }) => fixtures().find((f) => f.id === t.id)?.badge === "verified"));
  });

  it("uses the model's answer; tool cards and prices come from the catalog, unknown ids are dropped", async () => {
    const r = await ask(
      hvacQ,
      deps(fixtures(), model("fake-good", { answer: "Yes. Ringwise Receptionist can pick up when you're on a roof, from $59 a month. Start free with a clear voicemail.", toolIds: ["ringwise-receptionist", "made-up-tool", "booknest"] })),
    );
    assert.equal(r.mode, "ai");
    assert.match(r.answer, /on a roof/);
    assert.deepEqual(r.tools.map((t) => t.id), ["ringwise-receptionist"]);
    assert.equal(r.tools[0]!.monthlyUsd, 59);
    assert.ok(r.nextSteps.length > 0, "next steps stay rules-built");
  });

  it("falls back to the rules answer when the model invents a tool, price, percentage or link, or breaks format", async () => {
    for (const [i, bad] of [
      { answer: "You could try ChatGPT for this, it works well." },
      { answer: "Ringwise Receptionist costs $19 a month and is great.", toolIds: ["ringwise-receptionist"] },
      { answer: "Owners save 40% of their time with Ringwise Receptionist.", toolIds: ["ringwise-receptionist"] },
      { answer: "Sign up at https://example.com today, it's easy." },
      "not json at all",
    ].entries()) {
      const r = await ask(hvacQ, deps(fixtures(), model(`fake-bad-${i}`, bad)));
      assert.equal(r.mode, "rules", JSON.stringify(bad));
    }
  });

  it("rejects a budget answer that goes over budget at catalog prices", async () => {
    const r = await ask(
      { message: "I have $50 a month for calls and quotes", industry: "hvac" },
      deps(fixtures(), model("fake-over", { answer: "Get Ringwise Receptionist and QuoteQuick.", toolIds: ["ringwise-receptionist", "quotequick"] })),
    );
    assert.equal(r.mode, "rules");
    assert.ok(r.budgetPlan!.total <= 50);
  });

  it("works through the real OpenRouter client: request, JSON reply, cost tracking", async () => {
    const calls: { url: string; body: { model: string; response_format: unknown; messages: { role: string; content: string }[] }; auth: string }[] = [];
    const fakeFetch = (async (url: string, init: { body: string; headers: Record<string, string> }) => {
      calls.push({ url, body: JSON.parse(init.body), auth: init.headers.authorization! });
      const content = JSON.stringify({ answer: "Your website has no booking link. Ringwise Receptionist can catch calls you miss, from $59 a month.", toolIds: ["ringwise-receptionist"], freeSteps: [], notNeeded: null, followUps: ["How do I set it up?"] });
      return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { cost: 0.0007, prompt_tokens: 2900, completion_tokens: 120 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const ledger = memoryLedger();
    const provider = createOpenRouterProvider({ ...config, openRouterApiKey: "test-key", openRouterModel: "openai/gpt-4o-mini", llmBudgetUsd: 20 }, fakeFetch, ledger);
    const r = await ask({ message: "Can AI help with missed calls at my HVAC company?" }, deps(fixtures(), provider));
    assert.equal(r.mode, "ai");
    assert.equal(calls[0]!.url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(calls[0]!.auth, "Bearer test-key");
    assert.equal(calls[0]!.body.model, "openai/gpt-4o-mini");
    assert.deepEqual(calls[0]!.body.response_format, { type: "json_object" });
    assert.match(calls[0]!.body.messages[1]!.content, /"CATALOG"/);
    assert.equal(await ledger.spent(), 0.0007);
  });

  it("checks names, prices and everyday words sensibly", () => {
    const catalog = fixtures();
    const allowed = "Ringwise Receptionist from $59 a month works with your Square.";
    assert.equal(outsideFacts("Ringwise Receptionist is $59 a month and works with Square.", allowed, catalog), null);
    assert.equal(outsideFacts("Make a square quote template first.", "quote template", catalog), null);
    assert.match(outsideFacts("Try Calendly for bookings.", allowed, catalog) ?? "", /name:Calendly/);
    assert.match(outsideFacts("It costs $60.", allowed, catalog) ?? "", /price/);
  });
});

describe("the real catalog", () => {
  it("only ever shows real, Verified tools with their catalog prices and official sites", async () => {
    const catalog = loadCatalog();
    for (const q of ["How can I use AI in my HVAC business?", "What AI tools can help with marketing?", "Can AI help me respond to customer enquiries?", "I have $100 a month for my restaurant"]) {
      const r = await ask({ message: q }, deps(catalog));
      for (const t of r.tools) {
        const rec = catalog.find((c) => c.id === t.id)!;
        assert.equal(rec.badge, "verified");
        assert.ok(!rec.sample);
        assert.equal(t.officialUrl, rec.vendor.website);
        assert.equal(t.monthlyUsd, rec.pricing.small.monthlyUsd === "unknown" ? null : rec.pricing.small.monthlyUsd);
        if (t.monthlyUsd === null) assert.ok(t.limits.some((l) => /Price isn't public/.test(l)));
      }
    }
  });
});
