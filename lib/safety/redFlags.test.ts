import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { factsFixture } from "./fixtures.ts";
import { editDistance, findLookalike, findRedFlags } from "./redFlags.ts";

const DOWNLOAD = "Website is under 6 months old and asks you to download software.";

describe("editDistance", () => {
  it("counts letter changes", () => {
    assert.equal(editDistance("squarre", "square"), 1);
  });
  it("ignores case", () => {
    assert.equal(editDistance("Jobber", "jobber"), 0);
  });
});

describe("findLookalike", () => {
  it("catches a misspelled brand", () => {
    assert.deepEqual(findLookalike("squarre-voice.example"), { brand: "Square", word: "squarre" });
  });
  it("catches number-for-letter swaps", () => {
    assert.equal(findLookalike("quickb00ks.com")?.brand, "QuickBooks");
  });
  it("never flags official domains", () => {
    assert.equal(findLookalike("squareup.com"), null);
    assert.equal(findLookalike("quickbooks.intuit.com"), null);
    assert.equal(findLookalike("www.getjobber.com"), null);
  });
  it("matches short brand words only exactly", () => {
    assert.equal(findLookalike("fixit.com"), null);
    assert.equal(findLookalike("wix-helper.com")?.brand, "Wix");
  });
});

describe("findRedFlags", () => {
  it("finds none on a good tool", () => {
    assert.deepEqual(findRedFlags(factsFixture()), []);
  });
  it("flags a missing privacy page", () => {
    assert.deepEqual(findRedFlags(factsFixture({ pages: { privacy: null } })), ["No privacy policy found."]);
  });
  it("does not flag a privacy page that failed to load", () => {
    assert.deepEqual(findRedFlags(factsFixture({ pages: { privacy: { error: "timeout" } } })), []);
  });
  it("flags a 2-month-old site that asks for a download", () => {
    const f = factsFixture({ domain: { registeredAt: "2026-09-07" }, downloadPrompt: true });
    assert.deepEqual(findRedFlags(f), [DOWNLOAD]);
  });
  it("does not flag a new site without a download", () => {
    assert.deepEqual(findRedFlags(factsFixture({ domain: { registeredAt: "2026-09-07" } })), []);
  });
  it("does not flag an 8-month-old site with a download", () => {
    assert.deepEqual(findRedFlags(factsFixture({ domain: { registeredAt: "2026-03-07" }, downloadPrompt: true })), []);
  });
  it("flags a site on Google's unsafe list", () => {
    assert.deepEqual(findRedFlags(factsFixture({ safeBrowsing: "listed" })), ["Google lists this website as unsafe."]);
  });
  it("lists every flag found", () => {
    const f = factsFixture({ domain: { name: "squarre-voice.example" }, pages: { privacy: null } });
    assert.deepEqual(findRedFlags(f), [
      "Name and website imitate Square (squarre vs. Square).",
      "No privacy policy found.",
    ]);
  });
});
