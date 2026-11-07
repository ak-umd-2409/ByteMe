import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mockPlacesProvider, PlacesError, type PlacesProvider } from "../business/places.ts";
import { disabledProvider } from "../llm/client.ts";
import { loadConfig } from "../shared/config.ts";
import { handleAnalyze, handleConfirm, handleDetails, handleDiscover, handleImpact, handleSearch, type ApiDeps } from "./handlers.ts";

const deps: ApiDeps = { config: loadConfig({}), places: mockPlacesProvider, llm: disabledProvider, now: () => new Date("2026-11-07T12:00:00Z") };
const json = <T>(x: unknown) => JSON.parse(JSON.stringify(x)) as T;
type Body = Record<string, any>;

describe("API handlers (mock mode, no keys)", () => {
  it("search → details → analyze → confirm → discover round-trips through JSON", async () => {
    const search = await handleSearch({ q: "mike's heating", near: "Frederick, MD" }, deps);
    assert.equal(search.status, 200);
    const placeId = (search.body as Body).matches[0].placeId;
    assert.equal((search.body as Body).sampleData, true);

    assert.equal((await handleDetails({ placeId }, deps)).status, 200);

    const analyze = await handleAnalyze({ placeId, owner: { monthlyBudget: 200, techComfort: "self_serve" } }, deps);
    assert.equal(analyze.status, 200);
    const analysis = json<Body>(analyze.body);

    const confirm = await handleConfirm({ profile: analysis.profile, corrections: { owner: { teamSize: 4 } } }, deps);
    assert.equal(confirm.status, 200);
    const confirmed = json<Body>(confirm.body);
    assert.equal(confirmed.readyForRecommendations, true);
    assert.equal(confirmed.profile.confirmedAt, "2026-11-07T12:00:00.000Z");

    const discover = await handleDiscover({ profile: confirmed.profile, reviews: analysis.reviews, website: analysis.website }, deps);
    assert.equal(discover.status, 200);
    const body = discover.body as Body;
    assert.ok(body.discovery.problems.length > 0);
    assert.equal(body.recommendationInput.ok, true);
    assert.ok(body.recommendationInput.request.problems.length > 0);
  });

  it("returns 400 with field paths for invalid input", async () => {
    const bad = await handleSearch({ q: "" }, deps);
    assert.equal(bad.status, 400);
    assert.equal((bad.body as Body).error.code, "invalid_request");
    const badDiscover = await handleDiscover({ profile: 3 }, deps);
    assert.equal(badDiscover.status, 400);
    assert.ok((badDiscover.body as Body).error.details.some((d: string) => d.startsWith("profile")));
    assert.equal((await handleAnalyze({ owner: { monthlyBudget: -5 } }, deps)).status, 400);
  });

  it("returns 404 for unknown businesses", async () => {
    assert.equal((await handleDetails({ placeId: "mock-unknown-place" }, deps)).status, 404);
    assert.equal((await handleAnalyze({ placeId: "mock-unknown-place" }, deps)).status, 404);
  });

  it("returns 502 (not a crash) when the Places API is down", async () => {
    const down: PlacesProvider = {
      kind: "google_places",
      search: async () => Promise.reject(new PlacesError("Business lookup is unavailable right now.", 502)),
      details: async () => Promise.reject(new PlacesError("Business lookup is unavailable right now.", 502)),
    };
    const result = await handleSearch({ q: "pizza" }, { ...deps, places: down });
    assert.equal(result.status, 502);
    assert.equal((result.body as Body).error.code, "places_unavailable");
  });

  it("impact endpoint: calculates, validates, and refuses to estimate unsupported problems", async () => {
    const ok = await handleImpact({ problemKey: "missed_inquiries", industry: "hvac", overrides: { missed_per_week: 8, conversion_rate: 0.25, average_job_value: 300 } });
    assert.equal(ok.status, 200);
    assert.equal((ok.body as Body).impact.monthly.expected, 2598);
    assert.equal((await handleImpact({ problemKey: "missed_inquiries", industry: "hvac", overrides: { conversion_rate: 9 } })).status, 400);
    assert.equal((await handleImpact({ problemKey: "poor_review_management", industry: "hvac" })).status, 422);
  });
});
