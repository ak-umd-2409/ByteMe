import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PageFact } from "../../safety/types.ts";
import { answerInQuote, keepAnswer, parseMonthly, priceInQuote } from "./answers.ts";

const PRICING = "https://tool.example/pricing";
const pages: Record<string, PageFact> = {
  home: null,
  pricing: {
    url: PRICING,
    finalUrl: PRICING,
    status: 200,
    fetchedAt: "2026-11-07",
    contentHash: "h1",
    text: "Starter is $49 per month. Pro is $1,200 a year. Cancel anytime from your account.",
  },
  features: { error: "robots" },
};

describe("keepAnswer", () => {
  it("keeps an answer whose quote is on a fetched page and contains the answer", () => {
    assert.deepEqual(keepAnswer({ answer: "49", quote: "Starter is $49 per month.", pageUrl: PRICING }, pages), {
      answer: "49",
      quote: "Starter is $49 per month.",
      pageUrl: PRICING,
    });
  });

  it("drops a quote that isn't on the page", () => {
    assert.equal(keepAnswer({ answer: "49", quote: "Starter costs only $49 per month.", pageUrl: PRICING }, pages), "unknown");
  });

  it("drops a pageUrl we never fetched", () => {
    const raw = { answer: "49", quote: "Starter is $49 per month.", pageUrl: "https://tool.example/other" };
    assert.equal(keepAnswer(raw, pages), "unknown");
  });

  it("drops an answer outside the allowed list", () => {
    const raw = { answer: "maybe", quote: "Cancel anytime from your account.", pageUrl: PRICING };
    assert.equal(keepAnswer(raw, pages, ["monthly", "annual"] as const), "unknown");
  });

  it("keeps an allowed enum answer without needing the word in the quote", () => {
    const raw = { answer: "Monthly", quote: "Cancel anytime from your account.", pageUrl: PRICING };
    assert.deepEqual(keepAnswer(raw, pages, ["monthly", "annual"] as const), { answer: "monthly", quote: raw.quote, pageUrl: PRICING });
  });

  it("drops an answer that isn't in its own quote", () => {
    assert.equal(keepAnswer({ answer: "59", quote: "Starter is $49 per month.", pageUrl: PRICING }, pages), "unknown");
  });

  it("treats null, bare words and missing fields as unknown", () => {
    for (const raw of [null, "49", { answer: null, quote: null }, { answer: "49" }, 7])
      assert.equal(keepAnswer(raw, pages), "unknown");
  });
});

describe("answerInQuote", () => {
  it("compares numbers by digits, ignoring commas and dollar signs", () => {
    assert.equal(answerInQuote("1200", "Pro is $1,200 a year"), true);
  });

  it("does not match a different number", () => {
    assert.equal(answerInQuote("49", "Starter $59/mo"), false);
  });

  it("does not match a number hidden inside a bigger one", () => {
    assert.equal(answerInQuote("49", "Starter $149/mo"), false);
  });

  it("matches a monthly price billed annually", () => {
    assert.equal(answerInQuote("40", "$40/mo billed annually"), true);
  });

  it("matches a price followed by a comma", () => {
    assert.equal(answerInQuote("49", "Plans: $49, $99 and $199"), true);
  });

  it("matches cents", () => {
    assert.equal(answerInQuote("49.99", "Only $49.99 a month"), true);
  });

  it("compares text ignoring case", () => {
    assert.equal(answerInQuote("Spanish", "Available in English and spanish"), true);
  });

  it("does not match text missing from the quote", () => {
    assert.equal(answerInQuote("French", "Available in English and spanish"), false);
  });

  it("does not need yes or no in the quote", () => {
    assert.equal(answerInQuote("yes", "Every call is recorded."), true);
  });
});

describe("parseMonthly", () => {
  it("reads a plain number", () => assert.equal(parseMonthly("49"), 49));
  it("reads zero", () => assert.equal(parseMonthly("0"), 0));
  it("reads cents", () => assert.equal(parseMonthly("49.99"), 49.99));
  it("refuses words", () => assert.equal(parseMonthly("free"), "unknown"));
});

describe("keepAnswer: fixed-choice answers need a whole sentence", () => {
  const FEATURES = "https://tool.example/features";
  const page = (text: string): Record<string, PageFact> => ({
    features: { url: FEATURES, finalUrl: FEATURES, status: 200, fetchedAt: "2026-11-07", contentHash: "f", text },
  });
  const yes = (quote: string, text: string) => keepAnswer({ answer: "yes", quote, pageUrl: FEATURES }, page(text), ["yes", "no"] as const);

  it('rejects "HIPAA compliant" cut out of "We are not HIPAA compliant."', () => {
    assert.equal(yes("HIPAA compliant", "Great for clinics. We are not HIPAA compliant. Call us."), "unknown");
  });
  it("keeps a whole sentence", () => {
    assert.notEqual(yes("We are HIPAA compliant.", "Great for clinics. We are HIPAA compliant. Call us."), "unknown");
  });
  it("keeps a whole sentence even without its final period", () => {
    assert.notEqual(yes("We are HIPAA compliant", "Great for clinics. We are HIPAA compliant. Call us."), "unknown");
  });
  it("keeps a line of its own, like a list item", () => {
    assert.notEqual(yes("HIPAA compliant", "Features\nHIPAA compliant\nCall recording"), "unknown");
  });
});

describe("priceInQuote", () => {
  it("accepts a dollar price", () => assert.equal(priceInQuote("49", "Starter is $49 per month."), true));
  it("accepts a monthly price billed annually", () => assert.equal(priceInQuote("40", "$40/mo billed annually"), true));
  it("accepts thousands", () => assert.equal(priceInQuote("1200", "Enterprise $1,200 per month"), true));
  it("rejects a yearly price", () => assert.equal(priceInQuote("588", "Billed annually at $588/year ($49/mo)"), false));
  it("accepts the monthly price next to a yearly one", () => assert.equal(priceInQuote("49", "Billed annually at $588/year ($49/mo)"), true));
  it("rejects 'a year' and 'per year'", () => {
    assert.equal(priceInQuote("1200", "Pro is $1,200 a year"), false);
    assert.equal(priceInQuote("1200", "Pro is $1,200 per year"), false);
  });
  it("rejects a number that isn't a price", () => assert.equal(priceInQuote("10000", "Trusted by 10,000 businesses"), false));
  it("rejects an answer that isn't digits", () => assert.equal(priceInQuote("$49", "Starter is $49 per month."), false));
});
