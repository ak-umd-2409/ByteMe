/**
 * Test helper: a fact sheet where every Safety Check passes. Tests override
 * one thing at a time. Never used by production code paths.
 */
import type { FetchedPageFact, SafetyFacts } from "./types.ts";

export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> | null }
    : T;

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Deep-merge plain objects; arrays, strings, null and `{ error }` pages replace. */
function merge<T>(base: T, over: unknown): T {
  if (!isPlain(base) || !isPlain(over) || "error" in over) return (over === undefined ? base : over) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = v === undefined ? out[k] : merge(out[k], v);
  return out as T;
}

const SITE = "https://goodtool.example";

export const FIXTURE_TEXT = {
  home: "GoodTool answers your phone with AI. Start your free trial today.",
  about:
    "GoodTool Inc. is a software company. Our office is at 100 Main Street, College Park, MD 20740. Jane Rivera is our CEO and founder.",
  contact: "Contact us at hello@goodtool.example. GoodTool Inc., 100 Main Street, College Park, MD 20740.",
  privacy: [
    "GoodTool Inc. Privacy Policy.",
    "We do not use your data to build or tune any models.",
    "You can delete your account and all of your data at any time from the settings page.",
    "Your data is stored in the United States.",
    "We are SOC 2 Type II certified.",
    // Filler that keeps the policy over 150 words without risky words.
    ...Array.from({ length: 12 }, (_, i) =>
      `Section ${i + 1}. We collect only what we need to run the service, we keep it safe with encryption, and we share it only with the vendors who help us run the service for you.`,
    ),
  ].join(" "),
  pricing: "Starter plan $29 per month. Cancel anytime.",
  terms: "These terms explain how you may use GoodTool.",
};

const page = (path: string, text: string): FetchedPageFact => ({
  url: `${SITE}${path}`,
  finalUrl: `${SITE}${path}`,
  status: 200,
  fetchedAt: "2026-11-07",
  contentHash: `hash-${path || "home"}`,
  text,
});

export function factsFixture(overrides: DeepPartial<SafetyFacts> = {}): SafetyFacts {
  const base: SafetyFacts = {
    input: { url: `${SITE}/`, name: "GoodTool", handlesSensitiveData: false },
    collectedAt: "2026-11-07",
    pages: {
      home: page("/", FIXTURE_TEXT.home),
      about: page("/about", FIXTURE_TEXT.about),
      contact: page("/contact", FIXTURE_TEXT.contact),
      privacy: page("/privacy", FIXTURE_TEXT.privacy),
      pricing: page("/pricing", FIXTURE_TEXT.pricing),
      terms: page("/terms", FIXTURE_TEXT.terms),
    },
    domain: { name: "goodtool.example", registeredAt: "2023-11-07", source: "rdap" },
    https: true,
    downloadPrompt: false,
    ai: {
      ran: { about: true, privacy: true },
      companyName: { answer: "GoodTool Inc.", quote: "GoodTool Inc. is a software company.", pageUrl: `${SITE}/about` },
      address: {
        answer: "100 Main Street, College Park, MD 20740",
        quote: "Our office is at 100 Main Street, College Park, MD 20740.",
        pageUrl: `${SITE}/about`,
      },
      leaderName: { answer: "Jane Rivera", quote: "Jane Rivera is our CEO and founder.", pageUrl: `${SITE}/about` },
      trainsOnYourData: { answer: "no", quote: "We do not use your data to build or tune any models.", pageUrl: `${SITE}/privacy` },
      canDeleteData: {
        answer: "yes",
        quote: "You can delete your account and all of your data at any time from the settings page.",
        pageUrl: `${SITE}/privacy`,
      },
      whereStored: { answer: "United States", quote: "Your data is stored in the United States.", pageUrl: `${SITE}/privacy` },
      securityCertification: { answer: "SOC 2 Type II", quote: "We are SOC 2 Type II certified.", pageUrl: `${SITE}/privacy` },
    },
    riskySentences: [],
    safeBrowsing: "not_run",
  };
  return merge(structuredClone(base), overrides);
}
