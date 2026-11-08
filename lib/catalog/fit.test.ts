import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validRecord } from "./fixtures.ts";
import { fitsIndustry, leftOutReason } from "./fit.ts";

describe("fitsIndustry", () => {
  it("keeps a tool made for any business", () => {
    const r = validRecord();
    r.industries = ["any"];
    assert.equal(fitsIndustry(r, "Restaurant"), true);
  });

  it("keeps a tool listed for the owner's business type, by label or key", () => {
    const r = validRecord();
    r.industries = ["professional_services"];
    assert.equal(fitsIndustry(r, "Professional services"), true);
    assert.equal(fitsIndustry(r, "professional_services"), true);
  });

  it("drops a tool listed only for other business types", () => {
    const r = validRecord();
    r.industries = ["professional_services"];
    assert.equal(fitsIndustry(r, "Restaurant"), false);
    assert.equal(fitsIndustry(r, "HVAC"), false);
  });

  it("only keeps any-business tools when the type is unknown", () => {
    const r = validRecord();
    r.industries = ["hvac"];
    assert.equal(fitsIndustry(r, "Dog grooming"), false);
    r.industries = ["any"];
    assert.equal(fitsIndustry(r, "Dog grooming"), true);
  });
});

describe("leftOutReason", () => {
  it("explains the Maryland recording rule in plain words, not as a failed safety check", () => {
    const r = validRecord();
    const why = leftOutReason(r, "Call recording consent could not be confirmed for Maryland.");
    assert.equal(why, "Not shown: we couldn't confirm it warns callers before recording (Maryland law).");
  });

  it("explains each owner rule plainly", () => {
    const r = validRecord();
    for (const engine of [
      "Health data requires a suitable tool and a signed business associate agreement.",
      "Personalized pricing is unsuitable for this Maryland food business.",
      "Outbound AI calls require a documented consent path.",
      "Data deletion or minimization could not be confirmed for this customer list.",
      "You asked for no call recording.",
      "You asked for no contract.",
      "Spanish support is required.",
      "Offline operation is required.",
    ]) {
      const why = leftOutReason(r, engine);
      assert.match(why, /^Not shown: /, engine);
      assert.doesNotMatch(why, /safety check/i, engine);
    }
  });

  it("passes through a rule it doesn't know, still marked as not shown", () => {
    assert.equal(leftOutReason(validRecord(), "Some new rule."), "Not shown: Some new rule.");
  });

  it("keeps the safety-check reason for tools that aren't verified", () => {
    const r = validRecord();
    r.badge = "listed";
    assert.match(leftOutReason(r, "Not yet verified by a human reviewer."), /Waiting for a person/);
    r.badge = "blocked";
    r.safetyCheck.redFlags = ["Copies a brand name."];
    assert.equal(leftOutReason(r, "Not yet verified by a human reviewer."), "Copies a brand name.");
  });

  it("uses the engine's reason when we don't have the record", () => {
    assert.equal(leftOutReason(undefined, "You asked for no contract."), "Not shown: you asked for no long contract.");
  });
});
