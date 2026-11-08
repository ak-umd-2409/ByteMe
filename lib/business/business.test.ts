import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryCache } from "../shared/cache.ts";
import { disabledProvider } from "../llm/client.ts";
import { fakeFetch, fakeLlm, publicResolve } from "../testing/fakes.ts";
import { classifyIndustry } from "./industry.ts";
import { analyzeBusiness, OnboardingError } from "./onboarding.ts";
import { createGooglePlacesProvider, mapGooglePlace, mockPlacesProvider, PlacesError } from "./places.ts";
import { applyCorrections } from "./profile.ts";
import { analyzeReviews, isVerbatim, splitPastedReviews } from "./reviews.ts";
import { detectTechnology } from "./techDetect.ts";
import type { SourceReview } from "./types.ts";
import type { RawPage } from "./website.ts";
import { scanWebsite } from "./website.ts";

const review = (id: string, text: string, rating: number | null = 2): SourceReview => ({
  id,
  source: "owner_pasted",
  author: null,
  rating,
  text,
  publishedAt: null,
  relativeTime: null,
  authorUrl: null,
});

describe("business lookup", () => {
  it("finds mock businesses and returns [] for no match", async () => {
    const matches = await mockPlacesProvider.search("mike's heating", "Frederick");
    assert.equal(matches[0]?.placeId, "mock-mikes-heating");
    assert.deepEqual(await mockPlacesProvider.search("zzzz qqqq"), []);
    assert.equal(await mockPlacesProvider.details("mock-does-not-exist"), null);
  });

  it("maps a Google Places response and sends the field mask + key header", async () => {
    const placeId = "ChIJabcdefghij12345";
    const { impl, calls } = fakeFetch({
      [`https://places.googleapis.com/v1/places/${placeId}?languageCode=en&regionCode=US`]: {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: placeId,
          displayName: { text: "Real Plumbing Co" },
          formattedAddress: "1 Main St, Rockville, MD 20850, USA",
          addressComponents: [
            { longText: "Rockville", types: ["locality"] },
            { longText: "Montgomery County", types: ["administrative_area_level_2"] },
            { longText: "Maryland", shortText: "MD", types: ["administrative_area_level_1"] },
            { longText: "20850", types: ["postal_code"] },
          ],
          primaryType: "plumber",
          rating: 4.4,
          userRatingCount: 87,
          reviews: [{ name: "r1", rating: 2, text: { text: "Nobody answered the phone." } }],
        }),
      },
    });
    const provider = createGooglePlacesProvider("test-key", { fetchImpl: impl, cache: createMemoryCache() });
    const details = await provider.details(placeId);
    assert.equal(details?.name, "Real Plumbing Co");
    assert.equal(details?.address.stateCode, "MD");
    assert.equal(details?.address.county, "Montgomery County");
    assert.equal(details?.reviews.length, 1);
    assert.equal(details?.provider, "google_places");
    const headers = calls[0]!.init!.headers as Record<string, string>;
    assert.equal(headers["x-goog-api-key"], "test-key");
    assert.ok(headers["x-goog-fieldmask"].includes("reviews"));
  });

  it("returns null for 404 and malformed ids, and a PlacesError for API failures", async () => {
    const { impl } = fakeFetch({
      "https://places.googleapis.com/v1/places:searchText": { status: 403, body: '{"error":"denied"}' },
    });
    const provider = createGooglePlacesProvider("k", { fetchImpl: impl, cache: createMemoryCache() });
    assert.equal(await provider.details("ChIJmissing00000000"), null);
    assert.equal(await provider.details("../../etc"), null);
    await assert.rejects(provider.search("pizza"), (error: unknown) => error instanceof PlacesError && error.status === 502);
  });

  it("maps a listing with no reviews, hours or website without crashing", () => {
    const details = mapGooglePlace({ id: "ChIJbare0000000000", displayName: { text: "Bare" } });
    assert.equal(details.website, null);
    assert.deepEqual(details.reviews, []);
    assert.deepEqual(details.hours, []);
  });

  it("classifies industry from Google types, then keywords, else unknown", () => {
    assert.equal(classifyIndustry({ primaryType: "plumber" }).method, "places_type");
    assert.equal(classifyIndustry({ name: "Sunrise Dental Care" }).method, "keyword");
    assert.equal(classifyIndustry({ name: "Zyx Holdings" }).method, "unknown");
  });
});

describe("review analysis", () => {
  it("finds complaint themes with verbatim quotes and source references", async () => {
    const analysis = await analyzeReviews([
      review("a", "Called three times and got voicemail every time. Never got a call back."),
      review("b", "Great work, very friendly tech!", 5),
    ]);
    const missed = analysis.complaints.find((t) => t.key === "missed_calls");
    assert.ok(missed, "missed_calls detected");
    for (const e of missed!.evidence) assert.ok(isVerbatim(e.quote!, "Called three times and got voicemail every time. Never got a call back."));
    assert.equal(missed!.evidence[0]!.reviewId, "a");
    assert.ok(analysis.praise.some((t) => t.key === "praise_friendly"));
    assert.equal(analysis.method, "rules");
  });

  it("does not count praise words in a low-star review as praise", async () => {
    const analysis = await analyzeReviews([review("a", "Friendly on the phone but never showed up.", 1)]);
    assert.equal(analysis.praise.length, 0);
  });

  it("drops LLM findings whose quote is not in the review (invented evidence)", async () => {
    const { provider } = fakeLlm(() =>
      JSON.stringify({
        findings: [
          { reviewId: "a", theme: "pricing_unclear", quote: "they overcharged me by $500" },
          { reviewId: "a", theme: "slow_response", quote: "took a week to hear back" },
          { reviewId: "ghost", theme: "rude_service", quote: "took a week to hear back" },
        ],
      }),
    );
    const analysis = await analyzeReviews([review("a", "Honestly it took a week to hear back from anyone.")], { llm: provider });
    const keys = analysis.complaints.map((t) => t.key);
    assert.ok(keys.includes("slow_response"));
    assert.ok(!keys.includes("pricing_unclear"), "invented quote rejected");
    assert.ok(!keys.includes("rude_service"), "unknown review id rejected");
  });

  it("falls back to rules when the LLM returns malformed JSON", async () => {
    const { provider } = fakeLlm(() => "I think the main themes are… {oops");
    const analysis = await analyzeReviews([review("a", "Left a voicemail, no one called back.")], { llm: provider });
    assert.equal(analysis.method, "rules");
    assert.ok(analysis.complaints.length > 0);
  });

  it("splits pasted reviews and reads star ratings", () => {
    const reviews = splitPastedReviews("★★☆☆☆ Nobody picks up the phone.\n\n5/5 Fantastic, fixed it in an hour!\n\n");
    assert.equal(reviews.length, 2);
    assert.equal(reviews[0]!.rating, 2);
    assert.equal(reviews[1]!.rating, 5);
    assert.equal(reviews[0]!.source, "owner_pasted");
  });

  it("reports Google's 5-review limit as a limitation", async () => {
    const analysis = await analyzeReviews([{ ...review("g", "fine"), source: "google" }]);
    assert.ok(analysis.limitations.some((l) => /5/.test(l)));
  });
});

describe("website analysis", () => {
  it("extracts services, prices, booking, hours and phone-only CTAs from the sample site", async () => {
    const scan = await scanWebsite("https://mikes-heating.example", { cache: createMemoryCache() });
    const a = scan.analysis;
    assert.equal(a.reachable, true);
    assert.ok(a.pagesScanned >= 2);
    assert.ok(a.services.length > 0);
    assert.ok(a.prices.some((p) => p.value.amount === 89));
    assert.equal(a.booking.onlineBooking, false);
    assert.ok(a.phoneOnlyCallsToAction.length > 0);
    assert.ok(a.afterHoursMessages.length > 0);
    assert.equal(a.policies.privacy.present, true);
    for (const finding of a.prices) assert.ok(finding.evidence.url.startsWith("https://mikes-heating.example"));
  });

  it("reports an unreachable website without throwing", async () => {
    const { impl } = fakeFetch({ "https://down.test/": new TypeError("fetch failed") });
    const scan = await scanWebsite("https://down.test", { fetchImpl: impl, resolveHost: publicResolve, cache: createMemoryCache() });
    assert.equal(scan.analysis.reachable, false);
    assert.ok(scan.analysis.problem);
    assert.equal(scan.analysis.booking.onlineBooking, false);
  });

  it("skips sites whose robots.txt disallows us", async () => {
    const { impl, calls } = fakeFetch({
      "https://private.test/robots.txt": { body: "User-agent: *\nDisallow: /", headers: { "content-type": "text/plain" } },
      "https://private.test/": { body: "<html>secret</html>" },
    });
    const scan = await scanWebsite("https://private.test", { fetchImpl: impl, resolveHost: publicResolve, cache: createMemoryCache() });
    assert.equal(scan.analysis.pages[0]?.status, "blocked_by_robots");
    assert.ok(!calls.some((c) => c.url === "https://private.test/"));
  });

  it("handles a site with almost no information", async () => {
    const { impl } = fakeFetch({ "https://tiny.test/": { body: "<html><body><h1>Welcome</h1></body></html>" } });
    const scan = await scanWebsite("https://tiny.test", { fetchImpl: impl, resolveHost: publicResolve, cache: createMemoryCache() });
    assert.equal(scan.analysis.reachable, true);
    assert.deepEqual(scan.analysis.prices, []);
    assert.equal(scan.analysis.policies.refund.present, false);
    assert.equal(scan.analysis.contactForm.present, false);
  });

  it("ignores LLM website findings whose evidence is not on any page", async () => {
    const { provider } = fakeLlm(() =>
      JSON.stringify({ services: [{ value: "Free solar panels", evidence: "We install free solar panels" }], products: [] }),
    );
    const scan = await scanWebsite("https://mikes-heating.example", { llm: provider, cache: createMemoryCache() });
    assert.ok(!scan.analysis.services.some((s) => /solar/i.test(s.value)));
  });
});

const page = (html: string, headers: Record<string, string> = {}): RawPage => ({
  url: "https://shop.test/",
  kind: "home",
  html,
  text: html,
  headers,
});

describe("technology detection", () => {
  it("detects tools from product-specific signatures with evidence", () => {
    const report = detectTechnology([
      page('<script src="https://js.squareup.com/v2/paymentform"></script><a href="https://calendly.com/mike/visit">Book</a>'),
    ]);
    const names = report.detected.map((d) => d.name);
    assert.ok(names.includes("Square"));
    assert.ok(names.includes("Calendly"));
    for (const d of report.detected) {
      assert.equal(d.confidence, "verified");
      assert.ok(d.evidence.length > 0);
    }
  });

  it("does not claim tools from ordinary words", () => {
    const report = detectTechnology([page("<p>Our showroom has 2,000 square feet. We use quick books of tickets and a toast to you!</p>")]);
    assert.deepEqual(report.detected.map((d) => d.name), []);
  });

  it("asks the owner about tools that can't be seen from outside", () => {
    const report = detectTechnology([], { industry: "hvac" });
    assert.ok(report.askOwnerAbout.length > 0);
    assert.ok(report.limitations.length > 0);
  });
});

describe("onboarding and profile", () => {
  it("builds a profile with provenance for every field", async () => {
    const analysis = await analyzeBusiness(
      { placeId: "mock-mikes-heating", owner: { monthlyBudget: 150 } },
      { places: mockPlacesProvider, llm: disabledProvider },
    );
    const p = analysis.profile;
    assert.equal(p.business.name.value, "Mike's Heating & Cooling");
    assert.equal(p.business.name.source, "mock_places");
    assert.equal(p.owner.monthlyBudget.value, 150);
    assert.equal(p.owner.monthlyBudget.source, "owner");
    assert.equal(p.business.industry.value, "hvac");
    assert.equal(analysis.mode.llm, "off");
    assert.ok(analysis.warnings.some((w) => /mock/i.test(w)));
  });

  it("works for a business with no website", async () => {
    const analysis = await analyzeBusiness({ placeId: "mock-garrett-farm" }, { places: mockPlacesProvider, llm: disabledProvider });
    assert.equal(analysis.website, null);
    assert.ok(analysis.warnings.some((w) => /website/i.test(w)));
  });

  it("works with manual entry and no Google listing", async () => {
    const analysis = await analyzeBusiness(
      { manual: { name: "Corner Cuts Barbershop", address: { city: "Laurel", stateCode: "MD" } }, pastedReviews: "1/5 Nobody answers the phone." },
      { places: mockPlacesProvider, llm: disabledProvider },
    );
    assert.equal(analysis.profile.business.name.source, "owner");
    assert.equal(analysis.mode.places, "none");
    assert.ok(analysis.reviews.complaints.length > 0);
  });

  it("rejects unknown places and empty requests", async () => {
    const deps = { places: mockPlacesProvider, llm: disabledProvider };
    await assert.rejects(analyzeBusiness({ placeId: "mock-nope" }, deps), (e: unknown) => e instanceof OnboardingError && e.status === 404);
    await assert.rejects(analyzeBusiness({}, deps), (e: unknown) => e instanceof OnboardingError && e.status === 400);
  });

  it("applies owner corrections, marks them as owner-sourced, and confirms", async () => {
    const { profile } = await analyzeBusiness({ placeId: "mock-mikes-heating" }, { places: mockPlacesProvider, llm: disabledProvider });
    const fixed = applyCorrections(
      profile,
      { business: { phone: "(301) 555-0199" }, owner: { monthlyBudget: 250, techComfort: "needs_help" } },
      { confirm: true, now: new Date("2026-11-07T12:00:00Z") },
    );
    assert.equal(fixed.business.phone.value, "(301) 555-0199");
    assert.equal(fixed.business.phone.source, "owner");
    assert.equal(fixed.owner.monthlyBudget.value, 250);
    assert.ok(!fixed.missingForRecommendations.includes("owner.monthlyBudget"));
    assert.equal(fixed.confirmedAt, "2026-11-07T12:00:00.000Z");
    assert.equal(profile.business.phone.source, "mock_places", "original profile is not mutated");
  });
});
