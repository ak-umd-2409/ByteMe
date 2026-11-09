import assert from "node:assert/strict";
import { describe, it } from "node:test";
import real from "../../data/catalog/real.json" with { type: "json" };
import { validRecord } from "../catalog/fixtures.ts";
import type { CatalogRecord } from "../catalog/types.ts";
import { costSummary, DEFAULT_FIX_SHARE, payback, paybackWords, priceOf, totals, type PaybackInput } from "./roi.ts";

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
      if (r.pricing.small.monthlyUsd === "unknown") assert.equal(p.monthly, null, r.id);
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
