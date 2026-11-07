import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractPolicyFacts } from "../business/policies.ts";
import { locationContext, MD_RURAL_COUNTIES, SBDC_REGIONS } from "../business/location.ts";
import { scanWebsite } from "../business/website.ts";
import { analyzeBusiness } from "../business/onboarding.ts";
import { getPlacesProvider } from "../business/places.ts";
import { applyCorrections } from "../business/profile.ts";
import { createMemoryCache } from "../shared/cache.ts";
import { loadConfig } from "../shared/config.ts";
import { disabledProvider } from "../llm/client.ts";
import { fakeFetch, publicResolve } from "../testing/fakes.ts";
import { handleAnalyze, handleDiscover, handlePayback } from "../api/handlers.ts";
import { discoverProblems } from "../problems/discover.ts";
import { paybackFor } from "../problems/payback.ts";
import { evaluateRules, RULES } from "./maryland.ts";
import { rulesForProfile } from "./forProfile.ts";

const deps = { places: getPlacesProvider(loadConfig({})), llm: disabledProvider };
const apiDeps = { config: loadConfig({}), places: deps.places, llm: disabledProvider };
const base = { stateCode: "MD", industry: "hvac" as const, handlesHealthData: null, handlesLargeCustomerList: null, hasOutboundCallConsent: null, phoneToolsLikely: false };

describe("rules that apply to you (2.8)", () => {
  it("every rule has plain text, an effect and a source link", () => {
    for (const r of RULES) {
      assert.ok(r.title && r.plain && r.effect, r.id);
      assert.match(r.source.url, /^https:\/\//, r.id);
    }
  });

  it("Maryland HVAC: recording applies once phone tools are likely; HIPAA and grocery pricing don't", () => {
    const report = evaluateRules({ ...base, phoneToolsLikely: true });
    const by = Object.fromEntries(report.rules.map((r) => [r.id, r.status]));
    assert.equal(by["md-call-recording"], "applies");
    assert.equal(by["us-hipaa"], "not_applicable");
    assert.equal(by["md-grocery-pricing"], "not_applicable");
    assert.equal(by["md-modpa"], "may_apply", "unknown list size is 'may apply', not a guess");
    assert.equal(report.rules[0].status, "applies", "applicable rules come first");
    assert.match(report.disclaimer, /Not legal advice/);
  });

  it("owner answers change the outcome", () => {
    assert.equal(evaluateRules({ ...base, handlesLargeCustomerList: true }).rules.find((r) => r.id === "md-modpa")!.status, "applies");
    assert.equal(evaluateRules({ ...base, handlesLargeCustomerList: false }).rules.find((r) => r.id === "md-modpa")!.status, "not_applicable");
    assert.equal(evaluateRules({ ...base, industry: "health_clinic" }).rules.find((r) => r.id === "us-hipaa")!.status, "applies");
    assert.equal(evaluateRules({ ...base, industry: "cafe" }).rules.find((r) => r.id === "md-grocery-pricing")!.status, "may_apply");
    assert.equal(evaluateRules({ ...base, stateCode: "VA" }).rules.find((r) => r.id === "md-call-recording")!.status, "not_applicable");
  });

  it("assumed defaults count as unknown, owner answers count as known", async () => {
    const a = await analyzeBusiness({ placeId: "public-frederick-heating-ac" }, deps);
    assert.equal(rulesForProfile(a.profile).rules.find((r) => r.id === "md-modpa")!.status, "may_apply");
    const told = applyCorrections(a.profile, { owner: { handlesLargeCustomerList: false } });
    assert.equal(rulesForProfile(told).rules.find((r) => r.id === "md-modpa")!.status, "not_applicable");
  });
});

describe("location context (2.9–2.11)", () => {
  it("covers all 24 Maryland jurisdictions with an SBDC region, and 18 rural counties", () => {
    const counties = SBDC_REGIONS.flatMap((r) => r.counties);
    assert.equal(new Set(counties).size, 24);
    assert.equal(MD_RURAL_COUNTIES.size, 18);
    for (const c of MD_RURAL_COUNTIES) assert.ok(counties.includes(c), `${c} has an SBDC region`);
  });

  it("Frederick County: Northern SBDC, rural, with sourced language and internet figures", () => {
    const loc = locationContext({ county: "Frederick County", stateCode: "MD" });
    assert.equal(loc.sbdc?.name, "Northern Region");
    assert.equal(loc.rural?.value, true);
    assert.match(loc.languages!.text, /17\.7%/);
    assert.match(loc.languages!.source.url, /census\.gov/);
    assert.equal(loc.internet?.broadbandPct, 93.2);
  });

  it("says what's missing instead of guessing", () => {
    const garrett = locationContext({ county: "Garrett County", stateCode: "MD" });
    assert.equal(garrett.languages, null);
    assert.ok(garrett.missing.length > 0);
    assert.equal(garrett.sbdc?.name, "Western Region");
    const va = locationContext({ county: "Fairfax County", stateCode: "VA" });
    assert.equal(va.sbdc, null);
  });
});

describe("policy scan (2.6)", () => {
  it("extracts facts with the exact sentence they came from", () => {
    const text =
      "Privacy Policy. Last updated: March 3, 2025. We do not sell your personal information to anyone. We share information with service providers who help us run our business. To request deletion of your personal data, email us.";
    const facts = extractPolicyFacts("privacy", text, "https://shop.test/privacy");
    const keys = facts.map((f) => f.key);
    assert.ok(keys.includes("no_sale") && keys.includes("shares") && keys.includes("deletion") && keys.includes("updated"));
    assert.ok(!keys.includes("sells"), "'do not sell' is not read as 'sells'");
    for (const f of facts) assert.ok(text.includes(f.snippet.replace(/…$/, "")), `${f.key} snippet is verbatim`);
  });

  it("reads refund windows and fees; says nothing about what isn't there", () => {
    const facts = extractPolicyFacts("refund", "Returns are accepted within 30 days of purchase. A cancellation fee of $50 applies.", "https://shop.test/refund");
    assert.ok(facts.some((f) => f.label === "Refund or return window: 30 days"));
    assert.ok(facts.some((f) => f.key === "cancellation_fee"));
    assert.deepEqual(extractPolicyFacts("refund", "Thank you for shopping with us.", "u"), []);
  });

  it("the website scan attaches facts to policy pages it reads", async () => {
    const { impl } = fakeFetch({
      "https://shop.test/": { body: '<html><body><a href="/privacy">Privacy Policy</a></body></html>' },
      "https://shop.test/privacy": { body: "<html><body><h1>Privacy</h1><p>We never sell your personal data. We use cookies to understand site traffic.</p></body></html>" },
    });
    const scan = await scanWebsite("https://shop.test", { fetchImpl: impl, resolveHost: publicResolve, cache: createMemoryCache() });
    const p = scan.analysis.policies.privacy;
    assert.equal(p.present, true);
    assert.ok(p.facts?.some((f) => f.key === "no_sale"));
    assert.ok(p.facts?.some((f) => f.key === "cookies"));
  });
});

describe("pays for itself (3.3)", () => {
  it("matches the worked example and shows its math", () => {
    const r = paybackFor({ problemKey: "missed_inquiries", monthlyCost: 49 }, "hvac", { missed_per_week: 8, conversion_rate: 0.25, average_job_value: 300 });
    assert.equal(r.monthlyValue, 2598);
    assert.equal(r.days, 1); // $49 ÷ ($2,598 ÷ 30) = 0.57 → about 1 day
    assert.match(r.label, /\(est\.\)/);
    assert.ok(r.math?.includes("$2,598"));
  });

  it("handles free tools, problems without an estimate, and slow paybacks", () => {
    assert.equal(paybackFor({ problemKey: "missed_inquiries", monthlyCost: 0 }, "hvac").days, 0);
    assert.equal(paybackFor({ problemKey: "poor_review_management", monthlyCost: 30 }, "hvac").days, null);
    const slow = paybackFor({ problemKey: "missed_inquiries", monthlyCost: 5000 }, "hvac");
    assert.ok(slow.days! > 30 && /longer than a month/.test(slow.label));
  });

  it("API validates and computes", async () => {
    const ok = await handlePayback({ industry: "hvac", items: [{ problemKey: "missed_inquiries", monthlyCost: 49 }] });
    assert.equal(ok.status, 200);
    assert.equal((await handlePayback({ industry: "hvac", items: [{ problemKey: "nope", monthlyCost: 1 }] })).status, 400);
    assert.equal((await handlePayback({ industry: "hvac", items: [{ problemKey: "missed_inquiries", monthlyCost: -5 }] })).status, 400);
  });
});

describe("API carries the new context", () => {
  it("analyze returns location and rules; discover returns updated rules", async () => {
    const a = (await handleAnalyze({ placeId: "public-frederick-heating-ac", owner: { monthlyBudget: 200 } }, apiDeps)).body as any;
    assert.equal(a.location.sbdc.name, "Northern Region");
    assert.ok(a.rules.rules.length >= 5);
    const round = JSON.parse(JSON.stringify(a));
    const d = await handleDiscover({ profile: round.profile, reviews: round.reviews, website: round.website, listings: round.listings }, apiDeps);
    assert.equal(d.status, 200);
    assert.ok((d.body as any).rules.headline);
  });

  it("owner-reported problems and time sinks become evidence (3.5)", async () => {
    const a = await analyzeBusiness({ placeId: "public-frederick-heating-ac", owner: { monthlyBudget: 200 } }, deps);
    const told = applyCorrections(a.profile, { owner: { reportedProblems: ["repetitive_admin"], biggestTimeSink: "invoices and paperwork every night" } });
    const d = discoverProblems({ profile: told, reviews: a.reviews, website: a.website, listings: a.listings });
    const admin = d.problems.find((p) => p.key === "repetitive_admin")!;
    assert.notEqual(admin.status, "hypothesis");
    assert.ok(admin.evidence.some((e) => e.source === "owner_reported"));
  });
});
