/**
 * The real catalog (data/catalog/real.json). See docs/specs/b-real-catalog.md §8–10.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import real from "../../data/catalog/real.json" with { type: "json" };
import sample from "../../data/catalog/sample.json" with { type: "json" };
import { USE_CASES } from "../recommend/types.ts";
import { getVerifiedTools, loadCatalog } from "./index.ts";
import type { CatalogRecord } from "./types.ts";

const realRecords = real as unknown as CatalogRecord[];
const SCAMS = ["fastbooks-ai", "replybot-pro", "squarre-voice-ai"];

describe("what the app reads", () => {
  it("is the real catalog plus only the 3 sample scams", () => {
    const ids = loadCatalog().map((r) => r.id).sort();
    assert.deepEqual(ids, [...realRecords.map((r) => r.id), ...SCAMS].sort());
  });

  it("keeps the sample file down to the 3 blocked scams", () => {
    assert.deepEqual((sample as { id: string }[]).map((r) => r.id).sort(), SCAMS);
  });

  it("never shows a made-up tool as verified or listed", () => {
    for (const r of loadCatalog()) if (r.sample) assert.equal(r.badge, "blocked", r.id);
  });
});

describe("coverage (batch 1)", () => {
  for (const useCase of USE_CASES)
    it(`has at least 1 verified tool for ${useCase}`, () => {
      assert.ok(getVerifiedTools({ useCase }).length >= 1, `no verified tool for ${useCase}`);
    });

  for (const industry of ["hvac", "plumbing", "restaurant", "cafe", "salon", "retail", "professional_services"] as const)
    it(`gives a ${industry} owner at least 3 verified tools`, () => {
      assert.ok(getVerifiedTools({ industry }).length >= 3, `${industry}: ${getVerifiedTools({ industry }).length}`);
    });

  it("gives a health clinic at least 1 HIPAA-ready tool that signs a BAA", () => {
    const ready = getVerifiedTools({ industry: "health_clinic" }).filter((t) => t.flags.hipaaReady && t.flags.baaAvailable);
    assert.ok(ready.length >= 1, "gap: no verified HIPAA-ready tool for health clinics yet");
  });
});
