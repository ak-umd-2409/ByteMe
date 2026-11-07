import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  certificationWarning,
  checkDataLocation,
  checkDataUse,
  checkDomainAge,
  checkPricingClarity,
  checkPrivacyPolicy,
  checkSecurityBasics,
  checkWhoIsBehind,
} from "./checks.ts";
import { factsFixture } from "./fixtures.ts";
import type { FetchedPageFact } from "./types.ts";

const ALL = [
  checkWhoIsBehind,
  checkPrivacyPolicy,
  checkDataUse,
  checkSecurityBasics,
  checkDomainAge,
  checkDataLocation,
  checkPricingClarity,
];

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
const pricingPage = (text: string): FetchedPageFact => ({ ...(factsFixture().pages.pricing as FetchedPageFact), text });

describe("every check on a good tool", () => {
  for (const check of ALL)
    it(`${check.name} passes with a reason and evidence`, () => {
      const item = check(factsFixture());
      assert.equal(item.result, "pass");
      assert.ok(item.reason.length > 0);
      assert.ok(item.evidence.length > 0);
    });
  it("whoIsBehind evidence carries the AI quotes", () => {
    const quotes = checkWhoIsBehind(factsFixture()).evidence.map((e) => e.quote);
    assert.ok(quotes.includes("Jane Rivera is our CEO and founder."));
  });
});

describe("checkWhoIsBehind", () => {
  it("fails when the AI read the pages and found no company name", () => {
    assert.equal(checkWhoIsBehind(factsFixture({ ai: { companyName: "unknown" } })).result, "fail");
  });
  it("is unknown when the AI didn't run", () => {
    assert.equal(checkWhoIsBehind(factsFixture({ ai: { ran: { about: false }, companyName: "unknown" } })).result, "unknown");
  });
  it("is unknown when only some of the three were found", () => {
    assert.equal(checkWhoIsBehind(factsFixture({ ai: { leaderName: "unknown" } })).result, "unknown");
  });
  it("is unknown when About and Contact are both missing", () => {
    const f = factsFixture({ pages: { about: null, contact: null }, ai: { companyName: "unknown" } });
    assert.equal(checkWhoIsBehind(f).result, "unknown");
  });
});

describe("checkPrivacyPolicy", () => {
  it("is unknown for a tiny policy (149 words)", () => {
    const privacy = { ...(factsFixture().pages.privacy as FetchedPageFact), text: words(149) };
    assert.equal(checkPrivacyPolicy(factsFixture({ pages: { privacy } })).result, "unknown");
  });
  it("fails when there is no privacy page", () => {
    assert.equal(checkPrivacyPolicy(factsFixture({ pages: { privacy: null } })).result, "fail");
  });
  it("is unknown when the privacy page failed to load", () => {
    assert.equal(checkPrivacyPolicy(factsFixture({ pages: { privacy: { error: "timeout" } } })).result, "unknown");
  });
});

describe("checkDataUse", () => {
  it("passes for opt-in training with deletion", () => {
    const f = factsFixture({ ai: { trainsOnYourData: { answer: "opt-in" } } });
    assert.equal(checkDataUse(f).result, "pass");
  });
  it("fails when it trains on your data", () => {
    assert.equal(checkDataUse(factsFixture({ ai: { trainsOnYourData: { answer: "yes" } } })).result, "fail");
  });
  it("fails when you can't delete your data", () => {
    assert.equal(checkDataUse(factsFixture({ ai: { canDeleteData: { answer: "no" } } })).result, "fail");
  });
  it("is unknown when training wasn't found", () => {
    assert.equal(checkDataUse(factsFixture({ ai: { trainsOnYourData: "unknown" } })).result, "unknown");
  });
  it("passes when the only risky sentence is the no-training quote itself", () => {
    const f = factsFixture({ riskySentences: ["We do not use your data to build or tune any models."] });
    assert.equal(checkDataUse(f).result, "pass");
  });
  it("is unknown when the AI says no training but a risky sentence exists", () => {
    const item = checkDataUse(factsFixture({ riskySentences: ["We may use your content to improve our models."] }));
    assert.equal(item.result, "unknown");
    assert.match(item.reason, /person/i);
  });
});

describe("checkSecurityBasics", () => {
  it("fails on http only", () => {
    assert.equal(checkSecurityBasics(factsFixture({ https: false })).result, "fail");
  });
  it("is unknown when the home page wasn't reached", () => {
    assert.equal(checkSecurityBasics(factsFixture({ pages: { home: null } })).result, "unknown");
  });
  it("still passes for a sensitive tool without a certification, with a warning", () => {
    const f = factsFixture({ input: { handlesSensitiveData: true }, ai: { securityCertification: "unknown" } });
    assert.equal(checkSecurityBasics(f).result, "pass");
    assert.equal(
      certificationWarning(f),
      "Takes payments or health info, but we found no security certification (like PCI or SOC 2).",
    );
  });
  it("gives no certification warning for other tools", () => {
    assert.equal(certificationWarning(factsFixture({ ai: { securityCertification: "unknown" } })), null);
  });
});

describe("checkDomainAge", () => {
  it("passes at 13 months", () => {
    assert.equal(checkDomainAge(factsFixture({ domain: { registeredAt: "2025-10-07" } })).result, "pass");
  });
  it("fails at exactly 12 months", () => {
    assert.equal(checkDomainAge(factsFixture({ domain: { registeredAt: "2025-11-07" } })).result, "fail");
  });
  it("is unknown when the registration date wasn't found", () => {
    assert.equal(checkDomainAge(factsFixture({ domain: { registeredAt: null } })).result, "unknown");
  });
});

describe("checkDataLocation", () => {
  it("is unknown (never fail) when storage isn't stated", () => {
    const item = checkDataLocation(factsFixture({ ai: { whereStored: "unknown" } }));
    assert.equal(item.result, "unknown");
    assert.equal(item.reason, "We couldn't find where your data is stored.");
  });
});

describe("checkPricingClarity", () => {
  it("passes for a monthly price", () => {
    const f = factsFixture({ pages: { pricing: pricingPage("$29 per month, cancel anytime") } });
    assert.equal(checkPricingClarity(f).result, "pass");
  });
  it("fails for contact sales only", () => {
    const f = factsFixture({ pages: { pricing: pricingPage("Contact sales for pricing") } });
    assert.equal(checkPricingClarity(f).result, "fail");
  });
  it("fails with no pricing page", () => {
    assert.equal(checkPricingClarity(factsFixture({ pages: { pricing: null } })).result, "fail");
  });
  it("is unknown when the pricing page failed to load", () => {
    assert.equal(checkPricingClarity(factsFixture({ pages: { pricing: { error: "timeout" } } })).result, "unknown");
  });
  it("fails for yearly-only pricing", () => {
    const f = factsFixture({ pages: { pricing: pricingPage("$300 per year") } });
    assert.equal(checkPricingClarity(f).result, "fail");
  });
});
