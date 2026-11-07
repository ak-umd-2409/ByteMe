import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PUBLIC_SNAPSHOTS } from "../../data/real/index.ts";
import { disabledProvider } from "../llm/client.ts";
import { discoverProblems } from "../problems/discover.ts";
import { toRecommendationInput } from "../problems/toRecommendation.ts";
import { recommend } from "../recommend/engine.ts";
import { demoCatalog } from "../../data/mock/recommendations.ts";
import { addressKey, checkListings, describeHours, parseHours, type ListingRecord } from "./listings.ts";
import { analyzeBusiness } from "./onboarding.ts";
import { getPlacesProvider } from "./places.ts";
import { loadConfig } from "../shared/config.ts";
import { analyzeReviews, isVerbatim } from "./reviews.ts";

const listing = (id: string, over: Partial<ListingRecord>): ListingRecord => ({
  id,
  directory: "other",
  label: id,
  url: `https://example.org/${id}`,
  capturedAt: "2026-11-07",
  capturedVia: "page_fetch",
  name: null,
  address: null,
  phone: null,
  hours: null,
  rating: null,
  reviewCount: null,
  ...over,
});

describe("hours parsing", () => {
  it("reads Google, Yelp, BBB and website formats", () => {
    assert.equal(describeHours(parseHours(["Monday: 7:00 AM – 5:00 PM", "Tuesday: 7:00 AM – 5:00 PM", "Saturday: Closed"])!), "Mon–Tue 7 AM–5 PM · Sat closed");
    assert.equal(describeHours(parseHours(["Hours: Mon–Fri 7am–6pm"])!), "Mon–Fri 7 AM–6 PM");
    assert.equal(parseHours(["Mon: Open 24 hours", "Tue: Open 24 hours", "Wed: Open 24 hours", "Thu: Open 24 hours", "Fri: Open 24 hours", "Sat: Open 24 hours", "Sun: Open 24 hours"]), "24/7");
    assert.equal(parseHours(["Open 24/7"]), "24/7");
    assert.equal(parseHours(["We love our customers"]), null);
  });

  it("normalizes street names for address comparison", () => {
    assert.equal(addressKey("10115 Old Liberty Road, Frederick, MD 21703"), addressKey("10115 Old Liberty Rd, Frederick, MD 21701"));
    assert.notEqual(addressKey("9022 Walnut Street, Union Bridge"), addressKey("10115 Old Liberty Rd"));
  });
});

describe("listings check", () => {
  it("reports no issues when listings agree", () => {
    const check = checkListings([
      listing("a", { hours: ["Mon–Fri 8am–5pm"], phone: "301-555-0100", address: "1 Main St, Town" }),
      listing("b", { hours: ["Monday: 8:00 AM – 5:00 PM"], phone: "(301) 555-0100", address: "1 Main Street, Town" }),
    ]);
    assert.deepEqual(check.issues, []);
    assert.equal(check.consistentCount, 2);
    assert.equal(check.fields.find((f) => f.field === "hours")?.status, "match");
  });

  it("flags different hours, phones, duplicates and rating gaps with the listings involved", () => {
    const check = checkListings([
      listing("y1", { directory: "yelp", label: "Yelp 1", hours: ["Open 24/7"], phone: "301-555-0100" }),
      listing("y2", { directory: "yelp", label: "Yelp 2", hours: ["Mon–Fri 7am–5pm"], phone: "301-555-0100", rating: 3.5, reviewCount: 13 }),
      listing("b", { directory: "birdeye", label: "Birdeye", hours: ["Open 24/7"], phone: "301-555-0199", rating: 4.7, reviewCount: 350 }),
    ]);
    const kinds = check.issues.map((i) => i.kind).sort();
    assert.deepEqual(kinds, ["duplicate", "hours", "phone", "rating_gap"]);
    const hours = check.issues.find((i) => i.kind === "hours")!;
    assert.equal(hours.severity, "high");
    assert.ok(hours.detail.includes("Yelp 2"));
    assert.ok(check.issues.every((i) => i.listingIds.length > 0));
  });

  it("does not flag a rating gap from a handful of reviews", () => {
    const check = checkListings([listing("a", { rating: 2.0, reviewCount: 3 }), listing("b", { rating: 4.9, reviewCount: 200 })]);
    assert.equal(check.issues.length, 0);
  });
});

describe("real business snapshot (Dave's Cooling & Heating)", () => {
  const snapshot = PUBLIC_SNAPSHOTS[0];

  it("every listing, review and website finding links to a listed source", () => {
    const sourceHosts = new Set(snapshot.sources.map((s) => new URL(s.url).host));
    for (const l of snapshot.listings) assert.ok(l.url && sourceHosts.has(new URL(l.url).host), `listing ${l.id}`);
    for (const r of snapshot.details.reviews) {
      assert.ok(r.url && sourceHosts.has(new URL(r.url).host), `review ${r.id}`);
      assert.ok(r.summary, `review ${r.id} has a summary`);
    }
    for (const f of [...snapshot.website.services, ...snapshot.website.products, ...snapshot.website.hours]) {
      assert.equal(f.method, "search_index");
      assert.ok(sourceHosts.has(new URL(f.evidence.url).host));
    }
  });

  it("keeps at most one short exact excerpt per source page", () => {
    const perPage = new Map<string, number>();
    for (const r of snapshot.details.reviews.filter((r) => r.text)) {
      assert.ok(r.text.split(/\s+/).length < 15, `excerpt too long: ${r.id}`);
      perPage.set(r.url!, (perPage.get(r.url!) ?? 0) + 1);
    }
    for (const [url, count] of perPage) assert.equal(count, 1, url);
  });

  it("uses no Google data and says so", async () => {
    assert.equal(snapshot.details.provider, "public_snapshot");
    assert.equal(snapshot.details.googleMapsUrl, null);
    assert.ok(snapshot.details.reviews.every((r) => r.source === "public_listing"));
    const places = getPlacesProvider(loadConfig({}));
    const analysis = await analyzeBusiness({ placeId: snapshot.placeId }, { places, llm: disabledProvider });
    assert.ok(analysis.warnings.some((w) => /Google API key/.test(w)));
    assert.equal(analysis.profile.sources.website, "blocked");
  });

  it("runs the full workflow: listings problem confirmed, rating gap likely, Part 4 accepts it", async () => {
    const places = getPlacesProvider(loadConfig({}));
    const [match] = await places.search("Dave's cooling heating");
    assert.equal(match.provider, "public_snapshot");
    const analysis = await analyzeBusiness(
      { placeId: match.placeId, owner: { monthlyBudget: 200, techComfort: "needs_help" } },
      { places, llm: disabledProvider },
    );
    assert.ok(analysis.listings.issues.some((i) => i.kind === "hours" && i.severity === "high"));
    assert.equal(analysis.profile.business.hours.needsOwnerInput, true, "conflicting hours are flagged for the owner");
    const result = discoverProblems({ profile: analysis.profile, reviews: analysis.reviews, website: analysis.website, listings: analysis.listings });
    const top = result.problems[0];
    assert.equal(top.key, "inconsistent_business_info");
    assert.equal(top.status, "confirmed");
    assert.equal(top.display.effort.kind, "free");
    for (const e of top.evidence) assert.ok(e.links && e.links.length > 0, "every listing signal links to listings");
    assert.equal(result.problems.find((p) => p.key === "poor_review_management")?.status, "likely");
    // No website scan → no "no online booking" claim from the website.
    assert.notEqual(result.problems.find((p) => p.key === "no_online_booking")?.status, "likely");
    assert.ok(result.overview.strengths.length > 0);
    const input = toRecommendationInput(analysis.profile, result);
    assert.ok(input.ok);
    if (input.ok) assert.equal(recommend(input.request.business, input.request.problems, demoCatalog).problems.length, input.request.problems.length);
  });
});

describe("recorded review themes", () => {
  it("uses the exact excerpt as the quote only when it supports the theme; otherwise a labelled summary", async () => {
    const analysis = await analyzeReviews([
      { id: "a", source: "public_listing", rating: null, text: "They charged us $360 to replace a $30 pressure switch", author: "K. E.", authorUrl: null, publishedAt: null, relativeTime: "11 years ago", url: "https://example.org/a", summary: "Felt overcharged.", themes: ["price_concerns"] },
      { id: "b", source: "public_listing", rating: null, text: "", author: "P. M.", authorUrl: null, publishedAt: null, relativeTime: "7 years ago", url: "https://example.org/b", summary: "Same-day AC repair.", themes: ["praise_responsive"] },
    ]);
    const price = analysis.complaints.find((t) => t.key === "price_concerns")!;
    assert.ok(price.evidence[0].quote && isVerbatim(price.evidence[0].quote, "They charged us $360 to replace a $30 pressure switch"));
    const fast = analysis.praise.find((t) => t.key === "praise_responsive")!;
    assert.equal(fast.evidence[0].quote, null);
    assert.equal(fast.evidence[0].summary, "Same-day AC repair.");
    assert.equal(fast.evidence[0].url, "https://example.org/b");
    assert.equal(analysis.newestReview, "7 years ago");
    assert.deepEqual(analysis.platforms[0], { name: "Public review page", count: 2 });
  });
});
