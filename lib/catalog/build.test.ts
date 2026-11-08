import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { factsFixture } from "../safety/fixtures.ts";
import { judge } from "../safety/judge.ts";
import type { FetchedPageFact } from "../safety/types.ts";
import { buildRecord } from "./build.ts";
import { combine } from "./combine.ts";
import { emptyCardAi } from "./fill/index.ts";
import type { CardFacts } from "./fill/types.ts";
import { gapsFor } from "./gaps.ts";
import type { ListEntry } from "./list.ts";
import { validateRecord } from "./validate.ts";

const SITE = "https://goodtool.example";
const entry: ListEntry = {
  id: "goodtool",
  name: "GoodTool",
  url: `${SITE}/`,
  category: "AI receptionist",
  useCases: ["missed-calls"],
  industries: ["hvac", "plumbing"],
  existingProduct: "GoodSuite",
  sensitive: false,
  batch: 1,
};
const page = (path: string): FetchedPageFact => ({
  url: `${SITE}${path}`,
  finalUrl: `${SITE}${path}`,
  status: 200,
  fetchedAt: "2026-11-07",
  contentHash: path,
  text: "",
});
const q = <T extends string>(answer: T, quote: string, path: string) => ({ answer, quote, pageUrl: `${SITE}${path}` });

function knownCard(): CardFacts {
  const ai = emptyCardAi();
  ai.ran = true;
  ai.description = q("GoodTool answers your phone with AI.", "GoodTool answers your phone with AI.", "/");
  ai.plans = { small: q("29", "Starter plan $29 per month.", "/pricing"), medium: q("59", "Pro $59 per month.", "/pricing"), large: "unknown" };
  ai.planNotes = { small: "Starter", medium: "Pro", large: "" };
  ai.freeTier = q("no", "Starter plan $29 per month.", "/pricing");
  ai.contract = q("monthly", "Billed monthly.", "/pricing");
  ai.cancellation = q("Cancel anytime", "Cancel anytime.", "/pricing");
  ai.worksWith = [
    { product: "QuickBooks", type: "native", quote: "Works with QuickBooks.", pageUrl: `${SITE}/integrations` },
    { product: "Gmail", type: "zapier", quote: "Gmail via Zapier.", pageUrl: `${SITE}/integrations` },
  ];
  ai.setupMinutes = q("15", "Set up in 15 minutes.", "/help");
  ai.setupMode = q("self_serve", "Set up in 15 minutes.", "/help");
  ai.languages = q("English, Spanish", "Works in English and Spanish.", "/features");
  ai.recordsCalls = q("yes", "Every call is recorded.", "/features");
  ai.announcesRecording = q("yes", "Callers hear that the call is recorded.", "/features");
  ai.hipaaReady = q("no", "GoodTool is not for medical offices.", "/features");
  ai.outboundAiCalls = q("no", "GoodTool never calls anyone.", "/features");
  ai.personalizedPricing = q("no", "GoodTool never calls anyone.", "/features");
  ai.sharesOrSells = q("no", "We never sell your data.", "/privacy");
  return {
    input: entry,
    collectedAt: "2026-11-07",
    pages: { home: page("/"), pricing: page("/pricing"), features: page("/features"), integrations: page("/integrations"), help: page("/help"), privacy: page("/privacy") },
    ai,
  };
}
function unknownCard(): CardFacts {
  return { ...knownCard(), pages: { home: { error: "network" }, pricing: null, features: null, integrations: null, help: null, privacy: null }, ai: emptyCardAi() };
}
const ready = () => factsFixture();
const blocked = () => factsFixture({ safeBrowsing: "listed" });
const held = () => factsFixture({ ai: { trainsOnYourData: "unknown" } });
const build = (card = knownCard(), facts = ready(), previous: Parameters<typeof buildRecord>[4] = null) =>
  buildRecord(entry, card, facts, judge(facts), previous);

describe("buildRecord", () => {
  it("every record built from a ready or blocked report passes the data checker", () => {
    for (const card of [knownCard(), unknownCard()])
      for (const facts of [ready(), blocked()]) assert.deepEqual(validateRecord(build(card, facts)), []);
  });

  it("is listed when ready or held, blocked when blocked, never verified on its own", () => {
    assert.equal(build().badge, "listed");
    assert.equal(build(knownCard(), held()).badge, "listed");
    assert.equal(build(knownCard(), blocked()).badge, "blocked");
    assert.equal(build().reviewedAt, undefined);
  });

  it("copies the list choices and the card answers", () => {
    const r = build();
    assert.equal(r.id, "goodtool");
    assert.equal(r.category, "AI receptionist");
    assert.deepEqual(r.industries, ["hvac", "plumbing"]);
    assert.equal(r.existingProduct, "GoodSuite");
    assert.equal(r.vendor.company, "GoodTool Inc.");
    assert.equal(r.vendor.domain, "goodtool.example");
    assert.equal(r.description, "GoodTool answers your phone with AI.");
    assert.deepEqual(r.pricing.small, { monthlyUsd: 29, note: "Starter plan" });
    assert.equal(r.pricing.asOf, "Nov 2026");
    assert.equal(r.pricing.freeTier, false);
    assert.equal(r.pricing.contract, "monthly");
    assert.equal(r.pricing.pricingUrl, `${SITE}/pricing`);
    assert.deepEqual(r.worksWith, [
      { product: "QuickBooks", type: "native" },
      { product: "Gmail", type: "zapier" },
    ]);
    assert.equal(r.setupMinutes, 15);
    assert.equal(r.setupMode, "self_serve");
    assert.deepEqual(r.languages, ["English", "Spanish"]);
    assert.deepEqual(r.rulesFlags, { recordsCalls: true, announcesRecording: true, hipaaReady: false, outboundAiCalls: false, personalizedPricing: false });
    assert.equal(r.lastChecked, "2026-11-07");
  });

  it("puts an unknown small price in needsVerification", () => {
    const card = knownCard();
    card.ai.plans.small = "unknown";
    const r = build(card);
    assert.equal(r.pricing.small.monthlyUsd, "unknown");
    assert.ok(r.needsVerification.includes("pricing.small.monthlyUsd"));
  });

  it("marks our own stand-ins for unknown text as needing checking", () => {
    const r = build(unknownCard());
    for (const path of ["description", "setupMode", "languages", "pricing.pricingUrl", "rulesFlags.hipaaReady"])
      assert.ok(r.needsVerification.includes(path), path);
    assert.deepEqual(r.languages, ["English"]);
    assert.equal(r.setupMode, "needs_help");
  });

  it("builds the privacy card from the Safety Check answers plus sharesOrSells from the card", () => {
    const r = build();
    assert.equal(r.privacyCard.trainsOnYourData.answer, "no");
    assert.equal(r.privacyCard.trainsOnYourData.quote, "We do not use your data to build or tune any models.");
    assert.equal(r.privacyCard.trainsOnYourData.sourceUrl, `${SITE}/privacy`);
    assert.equal(r.privacyCard.whereStored.answer, "United States");
    assert.equal(r.privacyCard.securityCertification.answer, "SOC 2 Type II");
    assert.deepEqual(
      { answer: r.privacyCard.sharesOrSells.answer, quote: r.privacyCard.sharesOrSells.quote },
      { answer: "no", quote: "We never sell your data." },
    );
    const u = build(unknownCard(), factsFixture({ ai: { whereStored: "unknown" } }));
    assert.deepEqual(u.privacyCard.whereStored, { answer: "unknown", plain: u.privacyCard.whereStored.plain, quote: null, sourceUrl: null });
    assert.ok(u.privacyCard.whereStored.plain.length > 0);
  });

  it("lists every page a kept answer quoted as a source, once each", () => {
    const r = build();
    for (const path of ["/", "/pricing", "/integrations", "/help", "/features", "/privacy", "/about"])
      assert.ok(r.sources.includes(`${SITE}${path}`), path);
    assert.equal(new Set(r.sources).size, r.sources.length);
  });

  it("an approved tool stays verified when nothing changed and it is still ready", () => {
    const approved = { ...build(), badge: "verified" as const, reviewedAt: "2026-11-08", reviewedBy: "Rishabh" };
    const again = build(knownCard(), ready(), approved);
    assert.equal(again.badge, "verified");
    assert.equal(again.reviewedAt, "2026-11-08");
    assert.equal(again.reviewedBy, "Rishabh");
    assert.ok(!gapsFor(again, judge(ready()), approved).some((g) => g.includes("Needs approval again")));
  });

  it("an approved tool needs approval again when its price changed", () => {
    const approved = { ...build(), badge: "verified" as const, reviewedAt: "2026-11-08", reviewedBy: "Rishabh" };
    const card = knownCard();
    card.ai.plans.small = q("39", "Starter plan $39 per month.", "/pricing");
    const again = build(card, ready(), approved);
    assert.equal(again.badge, "listed");
    assert.equal(again.reviewedAt, undefined);
    assert.ok(gapsFor(again, judge(ready()), approved).some((g) => g.includes("Needs approval again")));
  });

  it("an approved tool that is no longer ready drops to listed", () => {
    const approved = { ...build(), badge: "verified" as const, reviewedAt: "2026-11-08", reviewedBy: "Rishabh" };
    assert.equal(build(knownCard(), held(), approved).badge, "listed");
  });
});

describe("gapsFor", () => {
  it("lists what we couldn't confirm in plain words, with the field to fill", () => {
    const facts = factsFixture({ ai: { whereStored: "unknown" } });
    const r = build(unknownCard(), facts);
    const gaps = gapsFor(r, judge(facts));
    assert.ok(gaps.some((g) => /price of the cheapest plan/i.test(g) && g.includes("plans.small")), gaps.join("\n"));
    assert.ok(gaps.some((g) => /which country/i.test(g) && g.includes("whereStored")), gaps.join("\n"));
  });

  it("says why a tool is blocked", () => {
    const facts = blocked();
    const gaps = gapsFor(build(knownCard(), facts), judge(facts));
    assert.ok(gaps.some((g) => g.includes("Google lists this website as unsafe.")));
  });

  it("is empty for a complete, ready tool", () => {
    const card = knownCard();
    card.ai.plans.large = q("99", "Team $99 per month.", "/pricing");
    assert.deepEqual(gapsFor(build(card), judge(ready())), []);
  });
});

describe("combine", () => {
  it("writes valid records sorted by id", () => {
    const a = { ...build(), id: "b-tool" };
    const b = { ...build(), id: "a-tool" };
    const out = combine([a, b]);
    assert.equal(out.ok, true);
    if (out.ok) {
      assert.deepEqual(JSON.parse(out.json).map((r: { id: string }) => r.id), ["a-tool", "b-tool"]);
      assert.ok(out.json.endsWith("\n"));
    }
  });

  it("leaves out held tools and says so", () => {
    const out = combine([build(), { ...build(knownCard(), held()), id: "held-tool" }]);
    assert.equal(out.ok, true);
    if (out.ok) {
      assert.deepEqual(JSON.parse(out.json).map((r: { id: string }) => r.id), ["goodtool"]);
      assert.deepEqual(out.skipped, ["held-tool"]);
    }
  });

  it("refuses an invalid record", () => {
    const bad = { ...build(), pricing: { ...build().pricing, asOf: "Oct 2026" } };
    const out = combine([bad]);
    assert.equal(out.ok, false);
    if (!out.ok) assert.ok(out.errors.some((e) => e.includes("pricing.asOf")));
  });

  it("refuses duplicate ids", () => {
    const out = combine([build(), build()]);
    assert.equal(out.ok, false);
    if (!out.ok) assert.ok(out.errors.some((e) => e.includes("duplicate")));
  });
});
