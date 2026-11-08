import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isVerbatim } from "../business/reviews.ts";
import { loadFound } from "../catalog/found.ts";
import { loadCatalog } from "../catalog/index.ts";
import { validateCatalog } from "../catalog/validate.ts";
import { factsFixture } from "./fixtures.ts";
import { judge } from "./judge.ts";
import { loadFacts, validateFacts } from "./saved.ts";
import { isFetched, type SafetyFacts } from "./types.ts";

const AI_KEYS = ["companyName", "address", "leaderName", "trainsOnYourData", "canDeleteData", "whereStored", "securityCertification"] as const;

describe("loadFacts", () => {
  it("returns null for a tool with no saved fact sheet", () => {
    assert.equal(loadFacts("no-such-tool"), null);
  });
  it("refuses ids that aren't simple slugs", () => {
    assert.equal(loadFacts("../catalog/sample"), null);
  });
});

describe("validateFacts", () => {
  it("accepts a good fact sheet", () => {
    assert.deepEqual(validateFacts(factsFixture()), []);
  });
  it("rejects a broken one", () => {
    const bad = factsFixture() as unknown as Record<string, unknown>;
    delete bad.pages;
    assert.ok(validateFacts(bad).some((e) => e.includes("pages")));
    assert.ok(validateFacts(null).length > 0);
  });
});

describe("saved fact sheets for the sample catalog", () => {
  for (const record of loadCatalog())
    describe(record.id, () => {
      const facts = loadFacts(record.id) as SafetyFacts;
      it("has a valid fact sheet", () => {
        assert.ok(facts, "missing data/safety file");
        assert.deepEqual(validateFacts(facts), []);
      });
      it("its saved safety report is exactly what the judge says", () => {
        assert.deepEqual(record.safetyCheck, judge(facts));
      });
      it("its verdict matches its badge", () => {
        assert.equal(record.safetyCheck.verdict, record.badge === "blocked" ? "blocked" : "ready");
      });
      it("every AI quote is on its page", () => {
        for (const key of AI_KEYS) {
          const answer = facts.ai[key];
          if (answer === "unknown") continue;
          const page = Object.values(facts.pages).find((p) => isFetched(p) && p.finalUrl === answer.pageUrl);
          if (page && isFetched(page)) {
            assert.ok(isVerbatim(answer.quote, page.text), `${key} quote not on ${answer.pageUrl}`);
            continue;
          }
          // A fact a person found was checked on its live page at build time. That page isn't
          // saved, so the same sentence must be in the tool's found-facts file.
          assert.equal((answer as { source?: string }).source, "person", `${key}: no saved page ${answer.pageUrl}`);
          const found = loadFound(record.id).some((f) => f.field === key && f.quote.trim() === answer.quote);
          assert.ok(found, `${key}: person's answer isn't in data/catalog/found/${record.id}.json`);
        }
      });
    });

  it("the catalog is still valid", () => {
    assert.deepEqual(validateCatalog(loadCatalog()), []);
  });
});
