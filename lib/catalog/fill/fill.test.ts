import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LlmRequest } from "../../llm/client.ts";
import { createMemoryCache } from "../../shared/cache.ts";
import type { FetchedPageFact } from "../../safety/types.ts";
import { fakeFetch, fakeLlm, publicResolve } from "../../testing/fakes.ts";
import type { ListEntry } from "../list.ts";
import { emptyCardAi, fillCard } from "./index.ts";

const SITE = "https://tool.example";
const entry: ListEntry = {
  id: "tool",
  name: "Tool",
  url: `${SITE}/`,
  category: "AI receptionist",
  useCases: ["missed-calls"],
  industries: ["hvac"],
  sensitive: false,
  batch: 1,
};

const html = (body: string, links = "") => ({ body: `<html><body>${links}<p>${body}</p></body></html>` });
const HOME_LINKS =
  '<a href="/pricing">Pricing</a><a href="/product">Product</a><a href="/apps">Apps</a><a href="/support">Support</a><a href="/blog">Blog</a>';
const TEXT = {
  home: "Tool answers every call for your business with AI.",
  pricing: "Starter is $49 per month. Pro is $99 per month. Every plan is billed monthly. Cancel anytime from your account.",
  product: "Tool records every call so you can listen later. Most businesses are set up in 15 minutes.",
  apps: "Tool connects with QuickBooks and Jobber. Connect Google Calendar through Zapier.",
  support: "Our help team answers in English and Spanish.",
};
const site = (overrides: Record<string, ReturnType<typeof html> | Error> = {}) =>
  fakeFetch({
    [`${SITE}/`]: html(TEXT.home, HOME_LINKS),
    [`${SITE}/pricing`]: html(TEXT.pricing),
    [`${SITE}/product`]: html(TEXT.product),
    [`${SITE}/apps`]: html(TEXT.apps),
    [`${SITE}/support`]: html(TEXT.support),
    ...overrides,
  });

const q = (answer: string, quote: string, path: string) => ({ answer, quote, pageUrl: `${SITE}${path}` });
const goodReply = () => ({
  description: q("Tool answers every call for your business with AI.", "Tool answers every call for your business with AI.", "/"),
  plans: {
    small: { ...q("49", "Starter is $49 per month.", "/pricing"), plan: "Starter" },
    medium: { ...q("99", "Pro is $99 per month.", "/pricing"), plan: "Pro" },
    large: null,
  },
  freeTier: null,
  contract: q("monthly", "Every plan is billed monthly.", "/pricing"),
  cancellation: q("Cancel anytime", "Cancel anytime from your account.", "/pricing"),
  worksWith: [
    { product: "QuickBooks", type: "native", quote: "Tool connects with QuickBooks and Jobber.", pageUrl: `${SITE}/apps` },
    { product: "Google Calendar", type: "zapier", quote: "Connect Google Calendar through Zapier.", pageUrl: `${SITE}/apps` },
  ],
  setupMinutes: q("15", "Most businesses are set up in 15 minutes.", "/product"),
  setupMode: q("self_serve", "Most businesses are set up in 15 minutes.", "/product"),
  languages: q("English, Spanish", "Our help team answers in English and Spanish.", "/support"),
  recordsCalls: q("yes", "Tool records every call so you can listen later.", "/product"),
  announcesRecording: null,
  hipaaReady: null,
  outboundAiCalls: null,
  personalizedPricing: null,
  sharesOrSells: null,
});

async function fill(reply: unknown, fetchOverrides = {}, extra: Record<string, unknown> = {}) {
  const fake = site(fetchOverrides);
  const llm = fakeLlm(() => JSON.stringify(reply));
  const card = await fillCard(entry, {
    fetchImpl: fake.impl,
    resolveHost: publicResolve,
    llm: llm.provider,
    cache: createMemoryCache(),
    now: () => new Date("2026-11-07T12:00:00Z"),
    ...extra,
  });
  return { card, fake, llm };
}

describe("fillCard: finding pages", () => {
  it("finds pricing, features, integrations and help pages from home-page links", async () => {
    const { card } = await fill(goodReply());
    const url = (k: keyof typeof card.pages) => (card.pages[k] as FetchedPageFact).finalUrl;
    assert.equal(url("pricing"), `${SITE}/pricing`);
    assert.equal(url("features"), `${SITE}/product`);
    assert.equal(url("integrations"), `${SITE}/apps`);
    assert.equal(url("help"), `${SITE}/support`);
    assert.equal(card.collectedAt, "2026-11-07");
  });

  it("guesses the usual paths when the home page doesn't link them", async () => {
    const { card } = await fill(goodReply(), { [`${SITE}/`]: html(TEXT.home), [`${SITE}/features`]: html(TEXT.product) });
    assert.equal((card.pages.pricing as FetchedPageFact).finalUrl, `${SITE}/pricing`);
    assert.equal((card.pages.features as FetchedPageFact).finalUrl, `${SITE}/features`);
  });

  it("reads at most 6 pages and sends at most 10 requests", async () => {
    const many = Array.from({ length: 20 }, (_, i) => `<a href="/pricing-${i}">Pricing ${i}</a>`).join("");
    const everything = Object.fromEntries(
      ["/features", "/product", "/integrations", "/apps", "/help", "/support", "/plans"].map((p) => [`${SITE}${p}`, html("page")]),
    );
    const { fake, card } = await fill(goodReply(), { ...everything, [`${SITE}/`]: html(TEXT.home, many) });
    const read = Object.values(card.pages).filter((p) => p && !("error" in p)).length;
    assert.ok(read <= 6);
    assert.ok(fake.calls.filter((c) => !c.url.endsWith("/robots.txt")).length <= 10);
  });

  it("a guessed page that isn't there doesn't use up the page budget", async () => {
    const { card } = await fill(goodReply(), {
      [`${SITE}/`]: html(TEXT.home, '<a href="/pricing">Pricing</a>'),
      [`${SITE}/product`]: new Error("unused") as never,
      [`${SITE}/help`]: html(TEXT.support),
    });
    assert.equal((card.pages.help as FetchedPageFact).finalUrl, `${SITE}/help`);
  });

  it("respects robots.txt", async () => {
    const { card } = await fill(goodReply(), { [`${SITE}/robots.txt`]: { body: "User-agent: *\nDisallow: /pricing" } });
    assert.deepEqual(card.pages.pricing, { error: "robots" });
  });
});

describe("fillCard: answers", () => {
  it("keeps quoted answers", async () => {
    const { card } = await fill(goodReply());
    assert.equal(card.ai.ran, true);
    assert.deepEqual(card.ai.plans.small, q("49", "Starter is $49 per month.", "/pricing"));
    assert.equal(card.ai.planNotes.small, "Starter");
    assert.equal(card.ai.plans.large, "unknown");
    assert.equal(card.ai.planNotes.large, "");
    assert.deepEqual(card.ai.contract, q("monthly", "Every plan is billed monthly.", "/pricing"));
    assert.equal((card.ai.setupMinutes as { answer: string }).answer, "15");
    assert.equal((card.ai.recordsCalls as { answer: string }).answer, "yes");
    assert.deepEqual(
      card.ai.worksWith.map((w) => [w.product, w.type]),
      [
        ["QuickBooks", "native"],
        ["Google Calendar", "zapier"],
      ],
    );
  });

  it("keeps every language named in the quote", async () => {
    const { card } = await fill(goodReply());
    assert.equal((card.ai.languages as { answer: string }).answer, "English, Spanish");
  });

  it("drops a language that isn't in its quote", async () => {
    const reply = { ...goodReply(), languages: q("English, French", "Our help team answers in English and Spanish.", "/support") };
    const { card } = await fill(reply);
    assert.equal((card.ai.languages as { answer: string }).answer, "English");
  });

  it("turns a made-up quote into unknown", async () => {
    const reply = { ...goodReply(), cancellation: q("Cancel anytime", "Cancel anytime with one click, no fees.", "/pricing") };
    const { card } = await fill(reply);
    assert.equal(card.ai.cancellation, "unknown");
  });

  it("turns a price that isn't in its quote into unknown", async () => {
    const reply = goodReply();
    reply.plans.small = { ...q("39", "Starter is $49 per month.", "/pricing"), plan: "Starter" };
    const { card } = await fill(reply);
    assert.equal(card.ai.plans.small, "unknown");
    assert.equal(card.ai.planNotes.small, "");
  });

  it('"contact sales for pricing" gives an unknown price even if the AI names a number', async () => {
    const reply = goodReply();
    reply.plans.small = { ...q("99", "Contact sales for pricing.", "/pricing"), plan: "Business" };
    const { card } = await fill(reply, { [`${SITE}/pricing`]: html("Contact sales for pricing.") });
    assert.equal(card.ai.plans.small, "unknown");
  });

  it("one malformed answer doesn't throw away the others", async () => {
    const reply = { ...goodReply(), languages: null, contract: "monthly", worksWith: "QuickBooks" };
    const { card } = await fill(reply);
    assert.equal(card.ai.languages, "unknown");
    assert.equal(card.ai.contract, "unknown");
    assert.deepEqual(card.ai.worksWith, []);
    assert.equal((card.ai.plans.small as { answer: string }).answer, "49");
  });

  it("drops a product that isn't named in its quote", async () => {
    const reply = goodReply();
    reply.worksWith.push({ product: "Square", type: "native", quote: "Tool connects with QuickBooks and Jobber.", pageUrl: `${SITE}/apps` });
    const { card } = await fill(reply);
    assert.ok(!card.ai.worksWith.some((w) => w.product === "Square"));
  });

  it("drops a product with a type other than native or zapier", async () => {
    const reply = goodReply();
    reply.worksWith[0].type = "maybe";
    const { card } = await fill(reply);
    assert.ok(!card.ai.worksWith.some((w) => w.product === "QuickBooks"));
  });

  it("answers sharesOrSells only from the privacy page it is given", async () => {
    const privacyText = "We never sell your personal information to anyone, ever.";
    const privacyPage: FetchedPageFact = {
      url: `${SITE}/privacy`,
      finalUrl: `${SITE}/privacy`,
      status: 200,
      fetchedAt: "2026-11-07",
      contentHash: "p",
      text: privacyText,
    };
    const reply = { ...goodReply(), sharesOrSells: q("no", privacyText, "/privacy") };
    const { card } = await fill(reply, {}, { privacyPage });
    assert.deepEqual(card.ai.sharesOrSells, q("no", privacyText, "/privacy"));
    assert.deepEqual(card.pages.privacy, privacyPage);

    const fromPricing = { ...goodReply(), sharesOrSells: q("no", "Cancel anytime from your account.", "/pricing") };
    assert.equal((await fill(fromPricing, {}, { privacyPage })).card.ai.sharesOrSells, "unknown");
  });

  it("tells the AI the pages are untrusted and to quote word for word", async () => {
    const { llm } = await fill(goodReply());
    assert.equal(llm.calls.length, 1);
    const call = llm.calls[0] as LlmRequest;
    assert.equal(call.task, "catalog.card");
    assert.match(call.system, /untrusted/i);
    assert.match(call.system, /word for word/i);
    assert.match(call.user, /Starter is \$49 per month/);
  });
});

describe("fillCard: never throws", () => {
  it("a pricing page with no prices in its text gives unknown prices", async () => {
    const reply = goodReply();
    reply.plans.small = { ...q("49", "Starter is $49 per month.", "/pricing"), plan: "Starter" };
    const { card } = await fill(reply, { [`${SITE}/pricing`]: html("Choose the plan that fits your business.") });
    assert.equal(card.ai.plans.small, "unknown");
    assert.equal(card.ai.plans.medium, "unknown");
    assert.equal(card.ai.plans.large, "unknown");
  });

  it("a site where every fetch fails gives an all-unknown card", async () => {
    const fake = fakeFetch({ [`${SITE}/`]: new Error("down") });
    const llm = fakeLlm(() => JSON.stringify(goodReply()));
    const card = await fillCard(entry, { fetchImpl: fake.impl, resolveHost: publicResolve, llm: llm.provider, cache: createMemoryCache() });
    assert.deepEqual(card.ai, emptyCardAi());
    assert.equal(card.ai.ran, false);
    assert.equal(llm.calls.length, 0);
    assert.deepEqual(card.pages.home, { error: "network" });
  });

  it("an AI that replies with junk gives an all-unknown card", async () => {
    const fake = site();
    const llm = fakeLlm(() => "sorry, I can't help");
    const card = await fillCard(entry, { fetchImpl: fake.impl, resolveHost: publicResolve, llm: llm.provider, cache: createMemoryCache() });
    assert.deepEqual(card.ai, emptyCardAi());
  });
});

describe("fillCard: saving AI calls", () => {
  it("reuses the previous answers when no page changed", async () => {
    const first = await fill(goodReply());
    const again = await fill(goodReply(), {}, { previous: first.card });
    assert.equal(again.llm.calls.length, 0);
    assert.deepEqual(again.card.ai, first.card.ai);
  });

  it("asks again when a page changed", async () => {
    const first = await fill(goodReply());
    const again = await fill(goodReply(), { [`${SITE}/pricing`]: html(`${TEXT.pricing} New: Team plan.`) }, { previous: first.card });
    assert.equal(again.llm.calls.length, 1);
  });
});
