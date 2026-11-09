import assert from "node:assert/strict";
import { describe, it } from "node:test";
import real from "../../data/catalog/real.json" with { type: "json" };
import { validRecord } from "../catalog/fixtures.ts";
import type { CatalogRecord } from "../catalog/types.ts";
import { costSummary, DEFAULT_FIX_SHARE, payback, paybackWords, priceExtras, priceOf, totals, type PaybackInput } from "./roi.ts";
import { answerInQuote, type PricingFact } from "../catalog/pricingDetails.ts";

const catalog = ((real as unknown as { tools?: CatalogRecord[] }).tools ?? (real as unknown as CatalogRecord[])) as CatalogRecord[];
const tool = (over: Partial<CatalogRecord["pricing"]["small"]>, pricing: Partial<CatalogRecord["pricing"]> = {}): CatalogRecord => {
  const r = validRecord();
  return { ...r, pricing: { ...r.pricing, ...pricing, small: { ...r.pricing.small, ...over } } };
};

describe("priceOf", () => {
  it("labels a cheapest-plan price as a starting price, with its source and date", () => {
    const p = priceOf(tool({ monthlyUsd: 24, note: "Cheapest paid plan" }));
    assert.equal(p.label, "starting");
    assert.equal(p.monthly, 24);
    assert.ok(p.sourceUrl);
    assert.equal(p.checked, "Nov 2026");
  });
  it("never invents a price: unknown stays unknown", () => {
    const p = priceOf(tool({ monthlyUsd: "unknown", note: "" }));
    assert.equal(p.label, "unavailable");
    assert.equal(p.monthly, null);
  });
  it("says a yearly contract is yearly, and lists what we couldn't confirm", () => {
    const p = priceOf(tool({ monthlyUsd: 10, note: "Plus plan" }, { contract: "annual", freeTier: "unknown" }));
    assert.equal(p.label, "verified");
    assert.equal(p.billing, "yearly");
    assert.ok(p.notConfirmed.includes("setup fee"));
    assert.ok(p.notConfirmed.includes("free plan or trial"));
  });
  it("gives every real catalog tool a label and a source page", () => {
    for (const r of catalog) {
      const p = priceOf(r);
      assert.ok(p.label);
      // No invented prices: a price is either the approved catalog's, or a checked pricing-page fact.
      if (r.pricing.small.monthlyUsd === "unknown") assert.ok(p.monthly === null || p.monthly === p.monthlyBilled || p.monthly === p.annualBilled, r.id);
      else assert.equal(p.monthly, r.pricing.small.monthlyUsd, r.id);
      assert.match(p.sourceUrl ?? "", /^https:\/\//, r.id);
    }
  });
});

describe("totals", () => {
  it("adds known prices and names the ones left out", () => {
    const t = totals([tool({ monthlyUsd: 10 }), tool({ monthlyUsd: 24.17 }), { ...tool({ monthlyUsd: "unknown" }), name: "Workiz" }]);
    assert.equal(t.monthly, 34.17);
    assert.equal(t.firstYear, 410.04);
    assert.deepEqual(t.missing, ["Workiz"]);
  });
});

const base: PaybackInput = {
  problemMonthly: { low: 400, expected: 800, high: 1200 },
  kind: "revenue_opportunity",
  toolMonthly: 100,
  fixShare: DEFAULT_FIX_SHARE,
  setupHours: 3,
  hourlyValue: 50,
  timeToMoney: 0.5,
};

describe("payback", () => {
  it("works out three scenarios with setup time as a one-time cost", () => {
    const r = payback(base);
    assert.ok(r.ok);
    const [c, e, o] = r.scenarios;
    assert.equal(e!.revenue, 400); // 800 × 50%
    assert.equal(e!.net, 300);
    assert.equal(e!.oneTime, 150);
    assert.equal(e!.paybackDays, Math.ceil((150 / 300) * 30.4)); // 16
    assert.equal(c!.net, 0); // 400 × 25% − 100
    assert.equal(c!.paybackDays, null);
    assert.equal(o!.net, 800);
  });
  it("counts only part of saved time as money, and keeps it apart from revenue", () => {
    const r = payback({ ...base, kind: "time_cost" });
    assert.ok(r.ok);
    const e = r.scenarios[1]!;
    assert.equal(e.revenue, 0);
    assert.equal(e.timeValue, 400);
    assert.equal(e.counted, 200);
    assert.equal(e.hoursSaved, 8);
  });
  it("says so instead of guessing when the problem's cost is unknown", () => {
    const r = payback({ ...base, problemMonthly: null });
    assert.equal(r.ok, false);
  });
  it("won't work out a payback without a published price", () => {
    const r = payback({ ...base, toolMonthly: null });
    assert.equal(r.ok, false);
  });
  it("is the same every time (no randomness)", () => {
    assert.deepEqual(payback(base), payback(base));
  });
  it("shows the working in plain steps", () => {
    const r = payback(base);
    assert.ok(r.ok && r.steps.some((s) => /possible, not promised/.test(s)));
  });
});

describe("paybackWords", () => {
  it("reads plainly", () => {
    assert.equal(paybackWords(null), "Doesn't pay back at these numbers");
    assert.equal(paybackWords(0), "Right away");
    assert.equal(paybackWords(16), "About 16 days");
    assert.equal(paybackWords(122), "About 4 months");
  });
});

describe("costSummary", () => {
  it("lists only sections with a tool, with labelled prices and totals", () => {
    const r = { ...validRecord(), id: "x", name: "X", pricing: { ...validRecord().pricing, small: { monthlyUsd: 12, note: "Cheapest paid plan" } } } as CatalogRecord;
    const out = costSummary({ sections: [{ heading: "Free fix", tool: null }, { heading: "Missed calls", tool: { id: "x" } }] }, [r]);
    assert.equal(out.tools.length, 1);
    assert.equal(out.tools[0]!.price.label, "starting");
    assert.equal(out.totals.firstYear, 144);
  });
});

describe("checked pricing-page details", () => {
  const byId = (id: string) => catalog.find((r) => r.id === id)!;
  it("adds the trial, monthly vs yearly price, limits and extra-use charges for Upfirst", () => {
    const p = priceOf(byId("upfirst"));
    assert.equal(p.trialDays, 14);
    assert.equal(p.monthlyBilled, 24.95);
    assert.equal(p.annualBilled, 20);
    assert.deepEqual(p.overage, ["$1.50 per extra call"]);
    assert.ok(!p.notConfirmed.includes("free plan or trial"));
    assert.ok(priceExtras(p).includes("14-day free trial"));
  });
  it("gives a starting price, from its own page, to a tool the catalog had no price for", () => {
    const p = priceOf(byId("semrush"));
    assert.equal(p.monthly, 139);
    assert.equal(p.label, "starting");
  });
  it("still says setup fees aren't confirmed when the page doesn't say", () => {
    assert.ok(priceOf(byId("upfirst")).notConfirmed.includes("setup fee"));
  });
});

describe("answerInQuote (the word-for-word check)", () => {
  const f = (field: PricingFact["field"], answer: string, quote: string): PricingFact => ({ field, answer, quote, url: "https://x.example" });
  it("rejects answers the quote doesn't say", () => {
    assert.ok(answerInQuote(f("freeTrialDays", "30", "Start your 14-day free trial")));
    assert.ok(answerInQuote(f("annualBilled", "20", "$24.95 billed monthly")));
    assert.ok(answerInQuote(f("setupFee", "0", "Onboarding is quick")));
    assert.ok(answerInQuote(f("freePlan", "no", "There's no free plan")), "a page can't confirm 'no'");
    assert.ok(answerInQuote(f("limit", "500 calls", "30 calls Starter")));
  });
  it("accepts answers the quote does say", () => {
    assert.equal(answerInQuote(f("freeTrialDays", "7", "Start 7 -day trial")), null);
    assert.equal(answerInQuote(f("annualBilled", "20", "$24.95 billed monthly $20 billed annually /mo")), null);
    assert.equal(answerInQuote(f("perUser", "yes", "Essentials $89 user/month")), null);
  });
});
