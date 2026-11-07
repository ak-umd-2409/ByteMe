import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validRecord } from "./fixtures.ts";
import { validateCatalog, validateRecord } from "./validate.ts";

const mentions = (errors: string[], text: string) => errors.some((e) => e.includes(text));

describe("validateRecord", () => {
  it("accepts a complete record", () => {
    assert.deepEqual(validateRecord(validRecord()), []);
  });

  it("rejects a problem type that is not one of the 12", () => {
    const r = validRecord() as any;
    r.useCases = ["missed-calls", "time-travel"];
    assert.ok(mentions(validateRecord(r), "useCases"));
  });

  it("requires every unknown field to be listed in needsVerification", () => {
    const r = validRecord();
    r.pricing.small.monthlyUsd = "unknown";
    assert.ok(mentions(validateRecord(r), "pricing.small.monthlyUsd"));
    r.needsVerification.push("pricing.small.monthlyUsd");
    assert.deepEqual(validateRecord(r), []);
  });

  it("requires a quote and source for any privacy answer that isn't unknown", () => {
    const r = validRecord();
    r.privacyCard.trainsOnYourData.quote = null;
    assert.ok(mentions(validateRecord(r), "privacyCard.trainsOnYourData"));
  });

  it("requires reviewedAt on verified tools", () => {
    const r = validRecord();
    delete r.reviewedAt;
    assert.ok(mentions(validateRecord(r), "reviewedAt"));
  });

  it("requires sample tools to use .example domains", () => {
    const r = validRecord();
    r.sample = true;
    r.vendor.website = "https://real.com";
    assert.ok(mentions(validateRecord(r), ".example"));
  });

  it("requires prices dated Nov 2026", () => {
    const r = validRecord() as any;
    r.pricing.asOf = "Oct 2026";
    assert.ok(mentions(validateRecord(r), "pricing.asOf"));
  });
});

describe("validateCatalog", () => {
  it("flags duplicate ids", () => {
    assert.ok(mentions(validateCatalog([validRecord(), validRecord()]), "duplicate"));
  });
});
