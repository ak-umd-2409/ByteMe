import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryCache } from "../shared/cache.ts";
import type { PlacesProvider } from "./places.ts";
import { fetchSerpReviews, mapSerpReviews, withSerpReviews } from "./serpReviews.ts";
import type { PlaceDetails } from "./types.ts";

const PLACE = "ChIJLSrtCdbHt4kR9WRLxlg5c1c";

const details = (reviews: PlaceDetails["reviews"] = []): PlaceDetails => ({
  placeId: PLACE,
  name: "Craving Hour Halal",
  address: { formatted: "8401 Baltimore Ave, College Park, MD 20740, USA", street: null, city: "College Park", county: null, state: "Maryland", stateCode: "MD", postalCode: "20740", country: "US" },
  phone: null,
  website: null,
  hours: [],
  rating: 4.8,
  reviewCount: 199,
  primaryType: "restaurant",
  primaryTypeLabel: "Restaurant",
  types: [],
  googleMapsUrl: null,
  businessStatus: null,
  reviews,
  provider: "google_places",
});

const google = (d: PlaceDetails): PlacesProvider => ({ kind: "google_places", search: async () => [], details: async () => structuredClone(d) });

const serpBody = {
  reviews: [
    { review_id: "r1", rating: 2, iso_date: "2026-10-01T00:00:00Z", date: "a month ago", snippet: "Called twice, nobody picked up.", extracted_snippet: { original: "Called twice, nobody picked up." }, user: { name: "Sam" }, link: "https://maps.google.com/r1" },
    { review_id: "r2", rating: 5, snippet: "" },
  ],
};

function fakeFetch(status: number, body: unknown) {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(String(url));
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { impl, calls };
}

describe("SerpApi reviews", () => {
  it("maps reviews, labels the source, and drops ones without text", () => {
    const out = mapSerpReviews(PLACE, serpBody.reviews);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.source, "google");
    assert.equal(out[0]!.platform, "Google (via SerpApi)");
    assert.equal(out[0]!.text, "Called twice, nobody picked up.");
    assert.equal(out[0]!.url, "https://maps.google.com/r1");
  });

  it("asks by Google place ID, in English", async () => {
    const { impl, calls } = fakeFetch(200, serpBody);
    await fetchSerpReviews(PLACE, "k", { fetchImpl: impl });
    const u = new URL(calls[0]!);
    assert.equal(u.hostname, "serpapi.com");
    assert.equal(u.searchParams.get("engine"), "google_maps_reviews");
    assert.equal(u.searchParams.get("place_id"), PLACE);
    assert.equal(u.searchParams.get("hl"), "en");
  });

  it("fills in reviews only when Google sent none", async () => {
    const { impl, calls } = fakeFetch(200, serpBody);
    const filled = await withSerpReviews(google(details()), "k", { fetchImpl: impl, cache: createMemoryCache() }).details(PLACE);
    assert.equal(filled?.reviews.length, 1);
    const own = details([{ id: "g1", source: "google", rating: 4, text: "Good food", author: null, authorUrl: null, publishedAt: null, relativeTime: null }]);
    const kept = await withSerpReviews(google(own), "k", { fetchImpl: impl, cache: createMemoryCache() }).details(PLACE);
    assert.equal(kept?.reviews[0]!.id, "g1");
    assert.equal(calls.length, 1, "no SerpApi call when Google already sent reviews");
  });

  it("carries on without reviews when SerpApi fails or the free searches run out", async () => {
    const { impl } = fakeFetch(429, { error: "Your account has run out of searches." });
    const out = await withSerpReviews(google(details()), "k", { fetchImpl: impl, cache: createMemoryCache() }).details(PLACE);
    assert.equal(out?.reviews.length, 0);
    assert.equal(out?.name, "Craving Hour Halal");
  });
});
