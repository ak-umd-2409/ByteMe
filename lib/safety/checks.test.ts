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
  leaderWarning,
  trainingWarning,
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
  it("is unknown when the address wasn't found anywhere", () => {
    assert.equal(checkWhoIsBehind(factsFixture({ ai: { address: "unknown" } })).result, "unknown");
  });
  it("passes with the address from the privacy page", () => {
    const policyAddress = { answer: "100 Main Street, College Park, MD 20740", quote: "GoodTool Inc. Privacy Policy.", pageUrl: "https://goodtool.example/privacy" };
    assert.equal(checkWhoIsBehind(factsFixture({ ai: { address: "unknown", policyAddress } })).result, "pass");
  });
  it("passes without a leader's name, with a warning", () => {
    const f = factsFixture({ ai: { leaderName: "unknown" } });
    assert.equal(checkWhoIsBehind(f).result, "pass");
    assert.equal(leaderWarning(f), "We couldn't find the name of the person who runs this company.");
  });
  it("gives no leader warning when the leader is named", () => {
    assert.equal(leaderWarning(factsFixture()), null);
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
  const ANON = "We only use de-identified, aggregated call data to improve our AI.";
  const OPTOUT = "You can opt out of model training at any time in your account settings.";
  it("passes when it only learns from data with names removed, with a plain warning", () => {
    const f = factsFixture({ riskySentences: [ANON], ai: { trainsOnYourData: { answer: "anonymized", quote: ANON } } });
    assert.equal(checkDataUse(f).result, "pass");
    assert.match(trainingWarning(f)!, /^This tool learns from how people use it\./);
  });
  it("passes when you can switch learning off, with a plain warning", () => {
    const f = factsFixture({ riskySentences: [OPTOUT], ai: { trainsOnYourData: { answer: "opt-out", quote: OPTOUT } } });
    assert.equal(checkDataUse(f).result, "pass");
    assert.match(trainingWarning(f)!, /^Ask them to stop this after you sign up\./);
    // Some tools stop by email or through support, not a setting: never promise a setting.
    assert.doesNotMatch(trainingWarning(f)!, /setting/i);
  });
  it("is unknown when names are removed but another sentence says it trains on recordings", () => {
    const other = "We use call recordings to train our models.";
    const f = factsFixture({ riskySentences: [ANON, other], ai: { trainsOnYourData: { answer: "anonymized", quote: ANON } } });
    assert.equal(checkDataUse(f).result, "unknown");
  });
  it("is unknown when 'only if you say yes' is contradicted by another sentence", () => {
    const quote = "We only use your recordings to train our models if you opt in.";
    const other = "We may also use your data for training and improving our Services.";
    const f = factsFixture({ riskySentences: [quote, other], ai: { trainsOnYourData: { answer: "opt-in", quote } } });
    assert.equal(checkDataUse(f).result, "unknown");
  });
  it("passes 'only if you say yes' when every training sentence asks first", () => {
    const quote = "We only use your recordings to train our models if you opt in.";
    const f = factsFixture({ riskySentences: [quote], ai: { trainsOnYourData: { answer: "opt-in", quote } } });
    assert.equal(checkDataUse(f).result, "pass");
  });
  it("writes a company name ending in a period without a double period", () => {
    const f = factsFixture({ ai: { companyName: { answer: "GoodTool Inc.", quote: "GoodTool Inc. is a software company." }, address: "unknown" } });
    assert.equal(checkWhoIsBehind(f).reason, "We couldn't find an address for GoodTool Inc.");
  });
  it("gives no training warning when it doesn't learn from your data", () => {
    assert.equal(trainingWarning(factsFixture()), null);
  });
  it("passes when the only risky sentence is the no-training quote itself", () => {
    const f = factsFixture({ riskySentences: ["We do not use your data to build or tune any models."] });
    assert.equal(checkDataUse(f).result, "pass");
  });
  it("is unknown when the AI quotes a sentence that says it DOES train as a 'no'", () => {
    const quote = "We use your business content to train our AI models.";
    const f = factsFixture({ riskySentences: [quote], ai: { trainsOnYourData: { answer: "no", quote } } });
    assert.equal(checkDataUse(f).result, "unknown");
  });
  it("is unknown when the 'no training' sentence has an exception", () => {
    const quote = "We do not train our models on your data unless you turn on sharing.";
    const f = factsFixture({ riskySentences: [quote], ai: { trainsOnYourData: { answer: "no", quote } } });
    assert.equal(checkDataUse(f).result, "unknown");
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
      "This tool handles payments or health information, but we found no proof that an outside company checked its security (like PCI or SOC 2).",
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
    assert.equal(item.reason, "We couldn't find which country your information is kept in.");
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
