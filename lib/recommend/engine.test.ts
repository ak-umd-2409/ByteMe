import assert from "node:assert/strict";
import { test } from "node:test";
import { recommend, scoreTool, exclusionReason } from "./engine.ts";
import type { BusinessProfile, CatalogTool, Problem } from "./types.ts";

const business: BusinessProfile = {
  name: "Mike's Heating & Cooling",
  industry: "HVAC",
  state: "MD",
  county: "Frederick",
  monthlyBudget: 200,
  currentTools: ["Square", "QuickBooks"],
  needsHelp: false,
  dealBreakers: [],
};
const problems: Problem[] = [
  {
    id: "calls",
    useCase: "missed-calls",
    title: "Missed calls",
    evidence: "Owner reports missed calls",
  },
  {
    id: "quotes",
    useCase: "quotes",
    title: "Slow quotes",
    evidence: "Owner reports late quotes",
  },
];
const tool = (id: string, changes: Partial<CatalogTool> = {}): CatalogTool => ({
  id,
  name: id,
  category: "Phone",
  description: "Answers calls",
  website: "https://example.com",
  status: "verified",
  reviewedAt: "2026-11-07",
  useCases: ["missed-calls"],
  industries: ["any"],
  monthlyPrice: 49,
  pricingNote: "Example price",
  integrations: { Square: "native" },
  setupMinutes: 30,
  reviewRating: 4.5,
  reviewCount: 20,
  languages: ["English"],
  flags: { recordsCalls: true, announcesRecording: true, dataDeletion: true },
  privacySummary: "Example policy",
  setupSummary: "Set up forwarding",
  demoOnly: true,
  ...changes,
});

test("never recommends listed, blocked, or unreviewed tools", () => {
  const result = recommend(business, problems, [
    tool("good"),
    tool("listed", { status: "listed" }),
    tool("blocked", { status: "blocked" }),
    tool("unreviewed", { reviewedAt: undefined }),
  ]);
  const ids = result.problems.flatMap((p) =>
    p.options.flatMap((o) => o.choices.map((c) => c.tool.id)),
  );
  assert.deepEqual([...new Set(ids)], ["good"]);
  assert.equal(result.problems[0].excluded.length, 3);
});

test("health, food pricing, and owner deal breakers act as hard filters", () => {
  assert.match(
    exclusionReason(tool("health"), { ...business, handlesHealthData: true }) ||
      "",
    /health/i,
  );
  assert.match(
    exclusionReason(tool("pricing", { flags: { personalizesPrices: true } }), {
      ...business,
      industry: "restaurant",
    }) || "",
    /pricing/i,
  );
  assert.match(
    exclusionReason(tool("contract", { flags: { requiresContract: true } }), {
      ...business,
      dealBreakers: ["no-contract"],
    }) || "",
    /contract/i,
  );
});

test("Fit Score follows 35/25/20/10/10 weights and budget taper", () => {
  const max = scoreTool(
    tool("max", { reviewRating: 5, setupMinutes: 30 }),
    problems[0],
    business,
  );
  assert.equal(max.total, 100);
  assert.deepEqual(max.parts, {
    problem: 35,
    integration: 25,
    budget: 20,
    setup: 10,
    reviews: 10,
  });
  const high = scoreTool(
    tool("expensive", { monthlyPrice: 300 }),
    problems[0],
    business,
  );
  assert.equal(high.parts.budget, 0);
  const via = scoreTool(
    tool("via", { integrations: { Square: "via-zapier" } }),
    problems[0],
    business,
  );
  assert.equal(via.parts.integration, 12.5);
});

test("shows distinct types when eligible and a combined kit within budget", () => {
  const tools = [
    tool("square-addon", {
      existingProduct: "Square",
      monthlyPrice: 25,
      setupMinutes: 10,
    }),
    tool("phone-pro", { monthlyPrice: 60, reviewRating: 5 }),
    tool("quote-helper", {
      useCases: ["quotes"],
      monthlyPrice: 70,
      category: "Quotes",
      integrations: { QuickBooks: "native" },
    }),
  ];
  const result = recommend(business, problems, tools);
  const kinds = result.problems[0].options.map((o) => o.kind);
  assert.ok(kinds.includes("already-have"));
  assert.ok(kinds.includes("quick-fix"));
  assert.ok(kinds.includes("starter-kit"));
  assert.ok(kinds.includes("lowest-cost"));
  const quick = result.problems[0].options.find((o) => o.kind === "quick-fix")!;
  const existing = result.problems[0].options.find(
    (o) => o.kind === "already-have",
  )!;
  assert.notEqual(quick.choices[0].tool.id, existing.choices[0].tool.id);
  const kit = result.problems[0].options.find((o) => o.kind === "starter-kit")!;
  assert.equal(kit.choices.length, 2);
  assert.ok(kit.monthlyPrice <= business.monthlyBudget);
  assert.equal(new Set(kit.choices.map((c) => c.tool.id)).size, 2);
});

test("builds an industry Starter Kit with a domain-specific tool", () => {
  const result = recommend(
    { ...business, industry: "Restaurant" },
    [problems[0]],
    [
      tool("restaurant-messages", {
        industries: ["restaurant"],
        useCases: ["customer-messaging"],
        monthlyPrice: 25,
        category: "Restaurant messaging",
      }),
      tool("phone", { monthlyPrice: 50 }),
      tool("booking", {
        useCases: ["booking"],
        monthlyPrice: 20,
        category: "Booking",
      }),
    ],
  );
  const kit = result.starterKits.find((candidate) => candidate.kitType === "industry")!;
  assert.equal(kit.title, "Restaurant Starter Kit");
  assert.ok(kit.choices.some((candidate) => candidate.tool.id === "restaurant-messages"));
  assert.ok(kit.choices.length >= 2 && kit.choices.length <= 4);
  assert.ok(kit.monthlyPrice <= business.monthlyBudget);
});

test("builds a problem Starter Kit from complementary workflow roles", () => {
  const result = recommend(business, [problems[0]], [
    tool("phone", { monthlyPrice: 50 }),
    tool("booking", {
      useCases: ["booking"],
      monthlyPrice: 20,
      category: "Booking",
    }),
    tool("follow-up", {
      useCases: ["customer-messaging"],
      monthlyPrice: 15,
      category: "Messaging",
    }),
  ]);
  const kit = result.problems[0].options.find(
    (candidate) => candidate.kind === "starter-kit" && candidate.kitType === "problem",
  )!;
  assert.equal(kit.title, "Missed calls Starter Kit");
  assert.deepEqual(
    new Set(kit.choices.map((candidate) => candidate.fitFor.useCase)),
    new Set(["missed-calls", "booking", "customer-messaging"]),
  );
  assert.ok(kit.choices.every((candidate) => candidate.score.total > 0));
});

test("no eligible tools produces no invented recommendation", () => {
  const result = recommend(business, problems, [
    tool("blocked", { status: "blocked" }),
  ]);
  assert.deepEqual(result.problems[0].options, []);
});

test("done for you appears for owners who request help", () => {
  const result = recommend(
    { ...business, needsHelp: true },
    [problems[0]],
    [tool("good")],
  );
  assert.ok(result.problems[0].options.some((o) => o.kind === "done-for-you"));
});

test("a strict budget suppresses the kit rather than proposing an unaffordable bundle", () => {
  const result = recommend({ ...business, monthlyBudget: 30 }, problems, [
    tool("phone", { monthlyPrice: 25 }),
    tool("quotes", { useCases: ["quotes"], monthlyPrice: 25 }),
  ]);
  assert.ok(result.problems[0].options.some((o) => o.kind === "quick-fix"));
  assert.ok(!result.problems[0].options.some((o) => o.kind === "starter-kit"));
});

test("verified outbound AI tools stay eligible with a consent warning", () => {
  const result = recommend(
    business,
    [problems[0]],
    [
      tool("outbound", {
        flags: { outboundAICalls: true, requiresOutboundConsent: true },
      }),
    ],
  );
  assert.ok(result.problems[0].options.length > 0);
  const choice = result.problems[0].options[0].choices[0];
  assert.equal(choice.tool.id, "outbound");
  assert.ok(choice.warnings.some((warning) => /consent/i.test(warning)));
  assert.equal(result.problems[0].excluded.length, 0);
});

test("verified recording tools stay eligible with a Maryland setup warning", () => {
  const result = recommend(
    business,
    [problems[0]],
    [tool("recording", { flags: { recordsCalls: true } })],
  );
  assert.ok(result.problems[0].options.length > 0);
  const choice = result.problems[0].options[0].choices[0];
  assert.ok(choice.warnings.some((warning) => /recording notice/i.test(warning)));
});

test("surfaces other verified candidates when best fit is also the cheapest", () => {
  const result = recommend(
    business,
    [problems[0]],
    [
      tool("best-and-cheapest", { monthlyPrice: 40, reviewRating: 5 }),
      tool("second-verified", { monthlyPrice: 80, reviewRating: 4.5 }),
    ],
  );
  const ids = result.problems[0].options
    .filter((option) => option.kind !== "starter-kit")
    .flatMap((option) => option.choices.map((candidate) => candidate.tool.id));
  assert.deepEqual([...new Set(ids)], ["best-and-cheapest", "second-verified"]);
  assert.ok(result.problems[0].options.some((option) => option.kind === "alternative"));
});

test("keeps a broad set of verified alternatives visible", () => {
  const result = recommend(
    business,
    [problems[0]],
    Array.from({ length: 12 }, (_, index) =>
      tool(`verified-${index + 1}`, { monthlyPrice: 40 + index * 5, reviewRating: 4.5 }),
    ),
  );
  const ids = new Set(
    result.problems[0].options
      .filter((option) => option.kind !== "starter-kit")
      .flatMap((option) => option.choices.map((candidate) => candidate.tool.id)),
  );
  assert.equal(ids.size, 10);
});

test("shows an above-budget verified alternative with a clear warning", () => {
  const result = recommend(
    business,
    [problems[0]],
    [
      tool("within-budget", { monthlyPrice: 50 }),
      tool("above-budget", { monthlyPrice: 250 }),
    ],
  );
  const alternative = result.problems[0].options.find(
    (option) => option.kind === "alternative",
  )!;
  assert.equal(alternative.choices[0].tool.id, "above-budget");
  assert.ok(alternative.choices[0].warnings.some((warning) => /above your monthly budget/i.test(warning)));
});

test("an owner's no-recording choice still excludes recording tools", () => {
  const result = recommend(
    { ...business, dealBreakers: ["no-recording"] },
    [problems[0]],
    [tool("recording")],
  );
  assert.equal(result.problems[0].options.length, 0);
  assert.match(result.problems[0].excluded[0].reason, /asked for no call recording/i);
});
