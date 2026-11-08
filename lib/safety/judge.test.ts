import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SAFETY_CHECK_NAMES } from "../catalog/types.ts";
import { factsFixture, type DeepPartial } from "./fixtures.ts";
import { judge } from "./judge.ts";
import type { SafetyFacts } from "./types.ts";

const LOOKALIKE: DeepPartial<SafetyFacts> = { input: { url: "https://squarre-voice.example/" }, domain: { name: "squarre-voice.example" } };

describe("judge", () => {
  it("marks a good tool ready with no flags or warnings", () => {
    const report = judge(factsFixture());
    assert.equal(report.verdict, "ready");
    assert.deepEqual(report.redFlags, []);
    assert.deepEqual(report.warnings, []);
    assert.equal(report.ranAt, "2026-11-07");
    for (const name of SAFETY_CHECK_NAMES) assert.equal(report.checks[name].result, "pass", name);
  });

  it("notes when the Google unsafe-site check was not run", () => {
    assert.match(judge(factsFixture()).checks.redFlags.reason, /We didn't check Google's list of unsafe websites/);
  });

  it("blocks a lookalike even when every other check passes", () => {
    const report = judge(factsFixture(LOOKALIKE));
    assert.equal(report.verdict, "blocked");
    assert.equal(report.checks.redFlags.result, "fail");
    assert.match(report.checks.redFlags.reason, /imitate Square/);
  });

  it("blocked wins over held", () => {
    const report = judge(factsFixture({ ...LOOKALIKE, ai: { address: "unknown" } }));
    assert.equal(report.verdict, "blocked");
  });

  const coreCases: [string, DeepPartial<SafetyFacts>][] = [
    ["whoIsBehind", { ai: { address: "unknown" } }],
    ["privacyPolicy", { pages: { privacy: { error: "timeout" } } }],
    ["dataUse", { ai: { trainsOnYourData: { answer: "yes" } } }],
    ["securityBasics", { https: false }],
    ["redFlags", { safeBrowsing: "listed" }],
  ];
  for (const [name, override] of coreCases)
    it(`a non-pass ${name} alone is not ready`, () => {
      const report = judge(factsFixture(override));
      assert.notEqual(report.checks[name as keyof typeof report.checks].result, "pass");
      assert.equal(report.verdict, name === "redFlags" ? "blocked" : "held");
    });

  const warningCases: [string, DeepPartial<SafetyFacts>][] = [
    ["domainAge", { domain: { registeredAt: "2026-06-01" } }],
    ["dataLocation", { ai: { whereStored: "unknown" } }],
    ["pricingClarity", { pages: { pricing: null } }],
  ];
  for (const [name, override] of warningCases)
    it(`a non-pass ${name} alone stays ready with one warning`, () => {
      const report = judge(factsFixture(override));
      assert.equal(report.verdict, "ready");
      assert.equal(report.warnings.length, 1);
      assert.equal(report.warnings[0], report.checks[name as keyof typeof report.checks].reason);
    });

  it("warns a sensitive tool with no certification but keeps it ready", () => {
    const report = judge(factsFixture({ input: { handlesSensitiveData: true }, ai: { securityCertification: "unknown" } }));
    assert.equal(report.verdict, "ready");
    assert.ok(report.warnings.some((w) => w.includes("checked its security")));
  });

  it("keeps a tool that only learns from data with names removed ready, with the warning", () => {
    const quote = "We only use de-identified, aggregated call data to improve our AI.";
    const report = judge(factsFixture({ riskySentences: [quote], ai: { trainsOnYourData: { answer: "anonymized", quote } } }));
    assert.equal(report.verdict, "ready");
    assert.equal(report.warnings.length, 1);
    assert.match(report.warnings[0], /^This tool learns from how people use it\./);
  });

  it("keeps a tool with no named leader ready, with a warning", () => {
    const report = judge(factsFixture({ ai: { leaderName: "unknown" } }));
    assert.equal(report.verdict, "ready");
    assert.deepEqual(report.warnings, ["We couldn't find the name of the person who runs this company."]);
  });

  it("is deterministic", () => {
    assert.deepEqual(judge(factsFixture({ ai: { whereStored: "unknown" } })), judge(factsFixture({ ai: { whereStored: "unknown" } })));
  });
});

describe("judge scenarios", () => {
  it("scam lookalike", () => {
    assert.equal(judge(factsFixture({ ...LOOKALIKE, pages: { about: null, contact: null } })).verdict, "blocked");
  });
  it("new site with download", () => {
    const report = judge(factsFixture({ domain: { registeredAt: "2026-10-01" }, downloadPrompt: true }));
    assert.equal(report.verdict, "blocked");
    assert.deepEqual(report.redFlags, ["Website is under 6 months old and asks you to download software."]);
  });
  it("vague privacy wording", () => {
    const report = judge(factsFixture({ riskySentences: ["We may use your data to improve our models."] }));
    assert.equal(report.checks.dataUse.result, "unknown");
    assert.equal(report.verdict, "held");
  });
  it("other sentences that also say 'we don't train' don't hold a tool", () => {
    const report = judge(
      factsFixture({
        riskySentences: [
          "We do not sell Customer Content, use it for advertising or marketing, or use it to train artificial intelligence models, and we do not permit our sub-processors to do so.",
          "Our AI sub-processors process Customer Content under zero data retention terms and may not use it to train their models.",
          "No AI Training : We do not use your data to train AI models.",
          "We do not process Workspace API user data to develop, improve, or train generalized AI and/or ML models.",
        ],
      }),
    );
    assert.equal(report.checks.dataUse.result, "pass");
    assert.equal(report.verdict, "ready");
  });
  for (const s of [
    "We do not ask before we train on your data.",
    "Data is not anonymized before training.",
    "We won't stop using it to train our models.",
    "If you do not opt out, we will use your content to train our AI models.",
    "We do not sell your data; we use it to train our models.",
    "We do not sell your data and we use it to train our models.",
    "Customer data is not excluded from training datasets.",
    "Content you don't delete may be used to train our models.",
    "Not for resale\nWe use your calls to train our models.",
  ])
    it(`a sentence that says it does train still needs a person: "${s.slice(0, 40)}…"`, () => {
      assert.equal(judge(factsFixture({ riskySentences: [s] })).checks.dataUse.result, "unknown");
    });
  it("a 'we don't train' sentence with an escape still needs a person", () => {
    const report = judge(factsFixture({ riskySentences: ["We do not train AI models on your data unless you agree to it."] }));
    assert.equal(report.checks.dataUse.result, "unknown");
  });
  it("staff security training isn't about AI", () => {
    const quote = "We do create aggregated and anonymized datasets for analytics and product improvement purposes.";
    const report = judge(
      factsFixture({
        riskySentences: [
          "All personnel with access to Customer Data are subject to confidentiality obligations and undergo background checks and security training, and access is governed by role-based access controls and logged for audit purposes.",
        ],
        ai: { trainsOnYourData: { answer: "anonymized", quote } },
      }),
    );
    assert.equal(report.checks.dataUse.result, "pass");
  });
  it("staff training next to AI words still needs a person", () => {
    const report = judge(factsFixture({ riskySentences: ["Staff training data and customer calls help improve our AI models."] }));
    assert.equal(report.checks.dataUse.result, "unknown");
  });
  it("AI quote not on page", () => {
    // The collector turns an unverifiable quote into "unknown".
    assert.equal(judge(factsFixture({ ai: { canDeleteData: "unknown" } })).verdict, "held");
  });
  it("http only", () => {
    assert.equal(judge(factsFixture({ https: false })).verdict, "held");
  });
  it("missing privacy page", () => {
    const report = judge(factsFixture({ pages: { privacy: null } }));
    assert.equal(report.verdict, "blocked");
    assert.deepEqual(report.redFlags, ["No privacy policy found."]);
  });
});
