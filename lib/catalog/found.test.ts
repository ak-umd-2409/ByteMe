import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { factsFixture } from "../safety/fixtures.ts";
import { judge } from "../safety/judge.ts";
import { fakeFetch, publicResolve } from "../testing/fakes.ts";
import { emptyCardAi } from "./fill/index.ts";
import type { CardFacts } from "./fill/types.ts";
import { applyFound, loadFound, type FoundFact } from "./found.ts";
import type { ListEntry } from "./list.ts";

const SITE = "https://goodtool.example";
const entry: ListEntry = {
  id: "goodtool",
  name: "GoodTool",
  url: `${SITE}/`,
  category: "AI receptionist",
  useCases: ["missed-calls"],
  industries: ["hvac"],
  sensitive: false,
  batch: 1,
};
const card = (): CardFacts => ({
  input: entry,
  collectedAt: "2026-11-07",
  pages: { home: null, pricing: null, features: null, integrations: null, help: null, privacy: null },
  ai: emptyCardAi(),
});

const SECURITY = "All customer data is stored in AWS data centers in the United States. Plans start at $29 per month.";
const site = () =>
  fakeFetch({
    [`${SITE}/security`]: { body: `<p>${SECURITY}</p>` },
    [`${SITE}/privacy`]: { body: "<p>We do not use your data to build or tune any models.</p>" },
    "https://blog.example/goodtool-review": { body: `<p>${SECURITY}</p>` },
    "https://app.termly.example/policy/123": { body: `<p>${SECURITY}</p>` },
  });
const fact = (over: Partial<FoundFact> = {}): FoundFact => ({
  field: "whereStored",
  answer: "United States",
  quote: "All customer data is stored in AWS data centers in the United States.",
  url: `${SITE}/security`,
  foundBy: "Rishabh",
  foundAt: "2026-11-08",
  ...over,
});
const run = (found: FoundFact[], safety = factsFixture({ ai: { whereStored: "unknown" } })) =>
  applyFound(found, card(), safety, { fetchImpl: site().impl, resolveHost: publicResolve });

describe("applyFound", () => {
  it("accepts a quote found word for word on the vendor's page, marked as found by a person", async () => {
    const out = await run([fact()]);
    assert.deepEqual(out.rejected, []);
    assert.deepEqual(out.accepted, ["whereStored"]);
    assert.deepEqual(out.safety.ai.whereStored, {
      answer: "United States",
      quote: "All customer data is stored in AWS data centers in the United States.",
      pageUrl: `${SITE}/security`,
      source: "person",
      foundBy: "Rishabh",
    });
  });

  it("an accepted whereStored fact turns dataLocation from unknown to pass", async () => {
    const before = factsFixture({ ai: { whereStored: "unknown" } });
    assert.equal(judge(before).checks.dataLocation.result, "unknown");
    const out = await run([fact()], before);
    assert.equal(judge(out.safety).checks.dataLocation.result, "pass");
  });

  it("an accepted trainsOnYourData fact turns a held report ready", async () => {
    const before = factsFixture({ ai: { trainsOnYourData: "unknown" } });
    assert.equal(judge(before).verdict, "held");
    const found = fact({
      field: "trainsOnYourData",
      answer: "no",
      quote: "We do not use your data to build or tune any models.",
      url: `${SITE}/privacy`,
    });
    const out = await run([found], before);
    assert.deepEqual(out.rejected, []);
    assert.equal(judge(out.safety).verdict, "ready");
  });

  it("fills a card answer, such as a price", async () => {
    const out = await run([fact({ field: "plans.small", answer: "29", quote: "Plans start at $29 per month." })]);
    assert.deepEqual(out.accepted, ["plans.small"]);
    assert.equal((out.card.ai.plans.small as { answer: string }).answer, "29");
    assert.equal((out.card.ai.plans.small as { source?: string }).source, "person");
  });

  it("rejects a quote that isn't on the page", async () => {
    const out = await run([fact({ quote: "All data is stored in the United States forever." })]);
    assert.deepEqual(out.accepted, []);
    assert.equal(out.rejected[0].field, "whereStored");
    assert.match(out.rejected[0].why, /isn't on that page/);
    assert.equal(out.safety.ai.whereStored, "unknown");
  });

  it("rejects an answer that isn't in its quote", async () => {
    const out = await run([fact({ answer: "Canada" })]);
    assert.deepEqual(out.accepted, []);
    assert.match(out.rejected[0].why, /answer/i);
  });

  it("rejects a field we don't know", async () => {
    const out = await run([fact({ field: "favoriteColor" })]);
    assert.deepEqual(out.accepted, []);
    assert.match(out.rejected[0].why, /favoriteColor/);
  });

  it("rejects a page on another website, such as a review blog", async () => {
    const out = await run([fact({ url: "https://blog.example/goodtool-review" })]);
    assert.deepEqual(out.accepted, []);
    assert.match(out.rejected[0].why, /vendor's own website/);
  });

  it("accepts the tool's own privacy page even when it is hosted on another website", async () => {
    const termly = "https://app.termly.example/policy/123";
    const safety = factsFixture({
      ai: { whereStored: "unknown" },
      pages: { privacy: { url: termly, finalUrl: termly, status: 200, fetchedAt: "2026-11-07", contentHash: "t", text: SECURITY } },
    });
    const out = await run([fact({ url: termly })], safety);
    assert.deepEqual(out.accepted, ["whereStored"]);
  });

  it("rejects a page we couldn't open", async () => {
    const out = await run([fact({ url: `${SITE}/missing` })]);
    assert.match(out.rejected[0].why, /couldn't open/);
  });

  it("rejects a fact with missing parts", async () => {
    const out = await run([{ field: "whereStored" } as FoundFact]);
    assert.deepEqual(out.accepted, []);
    assert.equal(out.rejected.length, 1);
  });

  it("doesn't change the inputs", async () => {
    const safety = factsFixture({ ai: { whereStored: "unknown" } });
    await run([fact()], safety);
    assert.equal(safety.ai.whereStored, "unknown");
  });
});

describe("loadFound", () => {
  it("gives an empty list for a tool with no file", () => {
    assert.deepEqual(loadFound("no-such-tool-anywhere"), []);
  });
  it("refuses an unsafe id", () => {
    assert.deepEqual(loadFound("../../etc/passwd"), []);
  });
});
