import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PUBLIC_SNAPSHOTS } from "../../data/real/index.ts";
import { demoCatalog } from "../../data/mock/recommendations.ts";
import { disabledProvider } from "../llm/client.ts";
import { discoverProblems } from "../problems/discover.ts";
import { calculateImpact } from "../problems/impact.ts";
import { toRecommendationInput } from "../problems/toRecommendation.ts";
import { recommend } from "../recommend/engine.ts";
import { loadConfig } from "../shared/config.ts";
import { industryInfo } from "./industry.ts";
import { checkListings, type ListingRecord } from "./listings.ts";
import { analyzeBusiness } from "./onboarding.ts";
import { getPlacesProvider } from "./places.ts";

const places = getPlacesProvider(loadConfig({}));
const deps = { places, llm: disabledProvider, now: () => new Date("2026-11-07T12:00:00Z") };
const owner = { monthlyBudget: 200, goals: ["more_customers" as const] };

async function run(placeId: string) {
  const a = await analyzeBusiness({ placeId, owner }, deps);
  const d = discoverProblems({ profile: a.profile, reviews: a.reviews, website: a.website, listings: a.listings }, new Date("2026-11-07T12:00:00Z"));
  return { a, d };
}

describe("real business snapshots", () => {
  it("every snapshot fact used as evidence links to a captured public source", () => {
    for (const s of PUBLIC_SNAPSHOTS) {
      const sourceUrls = new Set(s.sources.map((x) => x.url.split("?")[0].replace(/\/$/, "")));
      const norm = (u: string) => u.split(/[?#]/)[0].replace(/\/$/, "");
      for (const r of s.details.reviews) {
        assert.ok(r.url, `${r.id} has a link`);
        assert.ok(r.text || r.summary, `${r.id} has a quote or a summary`);
        if (r.text) assert.ok(r.text.split(/\s+/).length <= 15, `${r.id} excerpt is short`);
      }
      for (const l of s.listings) if (l.url) assert.ok([...sourceUrls].some((u) => norm(l.url!).startsWith(u) || u.startsWith(norm(l.url!).split("/").slice(0, 3).join("/"))), `${s.placeId}/${l.id} url is listed in sources`);
      // At most one exact excerpt per source page.
      const perPage = new Map<string, number>();
      for (const r of s.details.reviews.filter((x) => x.text)) perPage.set(r.url!, (perPage.get(r.url!) ?? 0) + 1);
      for (const [url, n] of perPage) assert.ok(n <= 1, `more than one excerpt from ${url}`);
    }
  });

  it("search ranks the business whose name matches above one that only shares a town", async () => {
    const matches = await places.search("Frederick Heating");
    assert.equal(matches[0]?.placeId, "public-frederick-heating-ac");
    assert.equal((await places.search("Dave's Cooling"))[0]?.placeId, "public-daves-cooling-heating");
  });

  it("Frederick Heating: contradictory listings are confirmed, with every listing linked", async () => {
    const { a, d } = await run("public-frederick-heating-ac");
    const kinds = a.listings.issues.map((i) => i.kind);
    assert.ok(kinds.includes("services"));
    assert.ok(kinds.includes("duplicate"));
    const card = d.problems.find((p) => p.key === "inconsistent_business_info")!;
    assert.equal(card.status, "confirmed");
    for (const e of card.evidence) assert.ok(e.verified && (e.reference?.url || e.links?.length), "listing evidence is linked");
    assert.equal(a.reviews.complaints.length, 0, "no invented complaints");
  });

  it("guesses that reviews contradict show the counter-evidence and rank last", async () => {
    for (const id of ["public-frederick-heating-ac", "public-daves-cooling-heating"]) {
      const { d } = await run(id);
      const missed = d.problems.find((p) => p.key === "missed_inquiries")!;
      assert.equal(missed.status, "hypothesis");
      assert.ok(missed.counterEvidence && missed.counterEvidence.mentions >= 2, `${id}: praise for quick replies shown`);
      assert.ok(missed.counterEvidence.examples.every((e) => e.text && (e.isQuote ? true : e.text.length > 0)));
      const hyps = d.problems.filter((p) => p.status === "hypothesis");
      assert.equal(hyps.at(-1)?.key, "missed_inquiries", `${id}: contradicted guess ranks last`);
    }
  });

  it("both real businesses produce a valid Part 4 request", async () => {
    for (const id of ["public-frederick-heating-ac", "public-daves-cooling-heating"]) {
      const { a, d } = await run(id);
      const input = toRecommendationInput(a.profile, d);
      assert.ok(input.ok, `${id} ready for Part 4`);
      if (!input.ok) continue;
      assert.equal(input.request.business.state, "MD");
      const out = recommend(input.request.business, input.request.problems, demoCatalog);
      assert.equal(out.problems.length, input.request.problems.length);
    }
  });
});

describe("service claim comparison", () => {
  const l = (id: string, services: ListingRecord["services"]): ListingRecord => ({
    id, directory: "other", label: id, url: null, capturedAt: "2026-11-07", capturedVia: "page_fetch",
    name: null, address: null, phone: null, hours: null, rating: null, reviewCount: null, services,
  });
  it("flags only real yes/no contradictions", () => {
    const check = checkListings([l("a", { emergency_service: true }), l("b", { emergency_service: false }), l("c", { emergency_service: null })]);
    const issue = check.issues.find((i) => i.kind === "services")!;
    assert.deepEqual(issue.listingIds.sort(), ["a", "b"]);
    assert.equal(checkListings([l("a", { senior_discount: true }), l("b", {})]).issues.length, 0, "silence is not disagreement");
  });
});

describe("calculator terms", () => {
  it("every editable term has a plain question and limits; the constant has none", () => {
    const r = calculateImpact("missed_inquiries", industryInfo("hvac"));
    assert.ok(r.ok);
    if (!r.ok) return;
    for (const t of r.estimate.terms) {
      if (t.source === "constant") assert.equal(t.question, null);
      else assert.ok(t.question && t.question.endsWith("?") || t.question?.includes("?"), `${t.key} has a question`);
    }
  });
});
