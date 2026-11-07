import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validRecord } from "./fixtures.ts";
import { toCatalogTool } from "./toCatalogTool.ts";

describe("toCatalogTool", () => {
  it("maps status, price, note and integrations", () => {
    const tool = toCatalogTool(validRecord())!;
    assert.equal(tool.status, "verified");
    assert.equal(tool.reviewedAt, "2026-11-07");
    assert.equal(tool.monthlyPrice, 49);
    assert.ok(tool.pricingNote.startsWith("As of Nov 2026: "));
    assert.deepEqual(tool.integrations, { Square: "native", QuickBooks: "via-zapier" });
    assert.equal(tool.website, "https://example.com");
  });

  it("treats unknown rules flags as the safer value for the owner", () => {
    const r = validRecord();
    for (const k of Object.keys(r.rulesFlags) as (keyof typeof r.rulesFlags)[]) r.rulesFlags[k] = "unknown";
    const f = toCatalogTool(r)!.flags;
    assert.equal(f.recordsCalls, true);
    assert.equal(f.outboundAICalls, true);
    assert.equal(f.personalizesPrices, true);
    assert.equal(f.announcesRecording, false);
    assert.equal(f.hipaaReady, false);
  });

  it("never claims a tool handles outbound-call consent without evidence", () => {
    const r = validRecord();
    r.rulesFlags.outboundAiCalls = "unknown";
    assert.equal(toCatalogTool(r)!.flags.requiresOutboundConsent, false);
    r.rulesFlags.outboundAiCalls = true;
    assert.equal(toCatalogTool(r)!.flags.requiresOutboundConsent, false);
  });

  it("treats an unknown contract as requiring one", () => {
    const r = validRecord();
    assert.equal(toCatalogTool(r)!.flags.requiresContract, false);
    r.pricing.contract = "unknown";
    assert.equal(toCatalogTool(r)!.flags.requiresContract, true);
  });

  it("never translates a tool whose small price is unknown", () => {
    const r = validRecord();
    r.pricing.small.monthlyUsd = "unknown";
    assert.equal(toCatalogTool(r), null);
  });

  it("marks sample tools as demo only", () => {
    const r = validRecord();
    assert.equal(toCatalogTool(r)!.demoOnly, false);
    r.sample = true;
    assert.equal(toCatalogTool(r)!.demoOnly, true);
  });
});
