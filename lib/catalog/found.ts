/**
 * Facts a person found: answers the AI couldn't confirm, filled by a person
 * from the vendor's own page. Each one is checked again by code: the page is
 * fetched, the quote must be on it word for word, and the answer must be in
 * the quote. A person can't type in a made-up answer either.
 * See docs/specs/b-real-catalog.md §5. Server/script use only.
 */
import { existsSync, readFileSync } from "node:fs";
import { htmlToText } from "../business/html.ts";
import { isVerbatim } from "../business/reviews.ts";
import { robotsAllows, safeFetch } from "../shared/safeFetch.ts";
import { registrableDomain } from "../safety/collect/external.ts";
import { verify as verifySafetyAnswer } from "../safety/collect/ai.ts";
import { SAFETY_CONFIG } from "../safety/config.ts";
import { contentHash } from "../safety/signals.ts";
import { isFetched, type AiAnswer, type CollectDeps, type FetchedPageFact, type SafetyFacts } from "../safety/types.ts";
import { keepAnswer } from "./fill/answers.ts";
import type { CardAi, CardFacts } from "./fill/types.ts";

export interface FoundFact {
  field: string;
  answer: string;
  quote: string;
  url: string;
  foundBy: string;
  foundAt: string;
}

export interface FoundResult {
  card: CardFacts;
  safety: SafetyFacts;
  accepted: string[];
  rejected: { field: string; why: string }[];
}

type SafetyKey = Exclude<keyof SafetyFacts["ai"], "ran">;
const SAFETY_FIELDS: SafetyKey[] = [
  "companyName",
  "address",
  "leaderName",
  "trainsOnYourData",
  "canDeleteData",
  "whereStored",
  "securityCertification",
  "policyAddress",
];
const YES_NO = ["yes", "no"] as const;
/** Card fields a person may fill, with their allowed answers (undefined = free text that must be in the quote). */
const CARD_FIELDS: Record<string, readonly string[] | undefined> = {
  description: undefined,
  "plans.small": undefined,
  "plans.medium": undefined,
  "plans.large": undefined,
  freeTier: YES_NO,
  contract: ["monthly", "annual"],
  cancellation: undefined,
  setupMinutes: undefined,
  setupMode: ["self_serve", "needs_help"],
  languages: undefined,
  recordsCalls: YES_NO,
  announcesRecording: YES_NO,
  hipaaReady: YES_NO,
  outboundAiCalls: YES_NO,
  personalizedPricing: YES_NO,
  sharesOrSells: YES_NO,
};

const DIR = new URL("../../data/catalog/found/", import.meta.url);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The facts a person found for one tool (data/catalog/found/<id>.json), or [] if none. */
export function loadFound(id: string): FoundFact[] {
  if (!SLUG.test(id)) return [];
  const path = new URL(`${id}.json`, DIR);
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return Array.isArray(parsed) ? parsed : [];
}

const hostSite = (url: string) => {
  try {
    return registrableDomain(new URL(url).hostname);
  } catch {
    return "";
  }
};

async function readPage(url: string, deps: CollectDeps): Promise<FetchedPageFact | null> {
  const opts = { fetchImpl: deps.fetchImpl, resolveHost: deps.resolveHost, timeoutMs: deps.timeoutMs, userAgent: deps.userAgent };
  try {
    const target = new URL(url);
    try {
      const robots = await safeFetch(`${target.origin}/robots.txt`, opts);
      if (robots.status < 400 && !robotsAllows(robots.body, target.pathname)) return null;
    } catch {
      // A missing or unreadable robots.txt means "allowed".
    }
    const page = await safeFetch(url, { ...opts, maxBytes: SAFETY_CONFIG.maxPageBytes });
    if (page.status >= 400) return null;
    const text = htmlToText(page.body);
    const fetchedAt = (deps.now ?? (() => new Date()))().toISOString().slice(0, 10);
    return { url: page.requestedUrl, finalUrl: page.finalUrl, status: page.status, fetchedAt, contentHash: contentHash(text), text };
  } catch {
    return null;
  }
}

const isText = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** Check each found fact against its live page and put the accepted ones in place of "unknown". */
export async function applyFound(found: FoundFact[], card: CardFacts, safety: SafetyFacts, deps: CollectDeps = {}): Promise<FoundResult> {
  const out: FoundResult = { card: structuredClone(card), safety: structuredClone(safety), accepted: [], rejected: [] };
  const reject = (field: string, why: string) => out.rejected.push({ field: isText(field) ? field : "(no field)", why });
  // The tool's own policy pages may live on another website (Termly, a parent company).
  const ownPolicyPages = [safety.pages.privacy, safety.pages.terms]
    .filter(isFetched)
    .flatMap((p) => [p.url, p.finalUrl]);
  const vendorSite = hostSite(card.input.url);
  const pages = new Map<string, FetchedPageFact | null>();

  for (const f of found) {
    if (!f || !isText(f.field) || !isText(f.answer) || !isText(f.quote) || !isText(f.url) || !isText(f.foundBy)) {
      reject(f?.field, "Each fact needs field, answer, quote, url and foundBy.");
      continue;
    }
    const isSafety = (SAFETY_FIELDS as string[]).includes(f.field);
    if (!isSafety && !(f.field in CARD_FIELDS)) {
      reject(f.field, `"${f.field}" isn't a question we ask.`);
      continue;
    }
    if (hostSite(f.url) !== vendorSite && !ownPolicyPages.includes(f.url)) {
      reject(f.field, "The page must be on the vendor's own website (or be its own privacy or terms page).");
      continue;
    }
    if (!pages.has(f.url)) pages.set(f.url, await readPage(f.url, deps));
    const page = pages.get(f.url)!;
    if (!page) {
      reject(f.field, "We couldn't open that page.");
      continue;
    }
    if (!isVerbatim(f.quote, page.text)) {
      reject(f.field, "That sentence isn't on that page, word for word.");
      continue;
    }
    const raw = { answer: f.answer, quote: f.quote, pageUrl: page.finalUrl };
    const kept: AiAnswer<string> = isSafety
      ? verifySafetyAnswer(f.field as SafetyKey, raw, [page])
      : keepAnswer(raw, { found: page }, CARD_FIELDS[f.field]);
    if (kept === "unknown") {
      reject(f.field, "The answer isn't in that sentence, or isn't one of the allowed answers.");
      continue;
    }
    const stored = { ...kept, source: "person" as const, foundBy: f.foundBy.trim() };
    if (isSafety) (out.safety.ai as Record<string, unknown>)[f.field] = stored;
    else if (f.field.startsWith("plans.")) out.card.ai.plans[f.field.slice(6) as "small"] = stored;
    else (out.card.ai as unknown as Record<string, unknown>)[f.field as keyof CardAi] = stored;
    out.accepted.push(f.field);
  }
  return out;
}
