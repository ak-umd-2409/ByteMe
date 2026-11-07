import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validRecord } from "../catalog/fixtures.ts";
import type { CatalogRecord } from "../catalog/types.ts";
import { validateCatalog } from "../catalog/validate.ts";
import { approveTool } from "./approve.ts";

const listed = (): CatalogRecord => {
  const r = validRecord();
  r.badge = "listed";
  delete r.reviewedAt;
  delete r.reviewedBy;
  return r;
};

describe("approveTool", () => {
  it("approves a ready tool", () => {
    const result = approveTool(listed(), "Rishabh", "2026-11-08");
    assert.ok(result.ok);
    assert.equal(result.record.badge, "verified");
    assert.equal(result.record.reviewedAt, "2026-11-08");
    assert.equal(result.record.reviewedBy, "Rishabh");
    assert.deepEqual(validateCatalog([result.record]), []);
  });

  it("refuses a held tool", () => {
    const r = listed();
    r.safetyCheck.verdict = "held";
    assert.deepEqual(approveTool(r, "Rishabh", "2026-11-08"), {
      ok: false,
      reason: "This tool didn't pass the core safety checks, so it can't be approved.",
    });
  });

  it("refuses a blocked tool", () => {
    const r = listed();
    r.badge = "blocked";
    r.safetyCheck.verdict = "blocked";
    assert.deepEqual(approveTool(r, "Rishabh", "2026-11-08"), { ok: false, reason: "This tool is blocked and can't be approved." });
  });

  it("refuses without a reviewer name", () => {
    assert.equal(approveTool(listed(), "  ", "2026-11-08").ok, false);
  });

  it("never changes the record it was given", () => {
    const r = listed();
    const before = structuredClone(r);
    approveTool(r, "Rishabh", "2026-11-08");
    assert.deepEqual(r, before);
  });
});
