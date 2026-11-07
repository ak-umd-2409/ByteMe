import { extractPolicyFacts } from "./policies.ts";
import { mockWebsites } from "../../data/mock/onboarding.ts";
import { llmJson, type LlmProvider } from "../llm/client.ts";
import { cached, hashKey, sharedCache, type Cache } from "../shared/cache.ts";
import { log } from "../shared/logger.ts";
import {
  normalizeWebsiteUrl,
  robotsAllows,
  safeFetch,
  SafeFetchError,
  type FetchLike,
  type ResolveHost,
} from "../shared/safeFetch.ts";
import { v } from "../shared/validate.ts";
import { extractLinks, headings, htmlToText, listItems, pageTitle } from "./html.ts";
import type { Finding, PageKind, ScannedPage, WebEvidence, WebsiteAnalysis } from "./types.ts";

/**
 * Website analysis. Reads a handful of public pages on the business's own
 * domain and extracts facts with deterministic patterns. An optional LLM pass
 * adds services/products/FAQs, but only items whose evidence text appears
 * verbatim on a scanned page are kept.
 */

export interface RawPage {
  url: string;
  kind: PageKind;
  html: string;
  text: string;
  headers: Record<string, string>;
}

export interface WebsiteScan {
  analysis: WebsiteAnalysis;
  /** Raw HTML for technology detection. Not returned by the API. */
  raw: RawPage[];
}

export interface ScanOptions {
  fetchImpl?: FetchLike;
  resolveHost?: ResolveHost;
  maxPages?: number;
  timeoutMs?: number;
  userAgent?: string;
  llm?: LlmProvider;
  cache?: Cache;
}

const KIND_RULES: [PageKind, RegExp][] = [
  ["booking", /\b(book|booking|schedule|appointment|reserv)/i],
  ["contact", /\b(contact|get in touch|reach us)/i],
  ["services", /\b(services?|what we do|menu|treatments)\b/i],
  ["pricing", /\b(pricing|prices|rates|cost)\b/i],
  ["faq", /\b(faq|frequently asked|questions)\b/i],
  ["privacy", /\bprivacy\b/i],
  ["refund", /\b(refund|returns?|cancellation)\b/i],
  ["terms", /\b(terms|conditions)\b/i],
  ["about", /\b(about|our story|who we are)\b/i],
];
const KIND_PRIORITY: PageKind[] = ["contact", "services", "pricing", "booking", "faq", "privacy", "refund", "terms", "about"];

export function classifyPage(url: string, linkText: string): PageKind {
  let path = "";
  try {
    path = new URL(url).pathname;
  } catch {
    path = url;
  }
  if (path === "/" || path === "") return "home";
  const haystack = `${path.replace(/[-_/]+/g, " ")} ${linkText}`;
  for (const [kind, pattern] of KIND_RULES) if (pattern.test(haystack)) return kind;
  return "other";
}

const BOOKING_PROVIDERS: [RegExp, string][] = [
  [/calendly\.com/i, "Calendly"],
  [/acuityscheduling\.com|as\.me\//i, "Acuity Scheduling"],
  [/squareup\.com\/appointments|square\.site\/book|book\.squareup\.com/i, "Square Appointments"],
  [/clienthub\.getjobber\.com|getjobber\.com\/.*(request|book)/i, "Jobber"],
  [/housecallpro\.com\/.*book|book\.housecallpro\.com/i, "Housecall Pro"],
  [/booksy\.com/i, "Booksy"],
  [/vagaro\.com/i, "Vagaro"],
  [/mindbodyonline\.com|mindbody\.io/i, "Mindbody"],
  [/opentable\.com/i, "OpenTable"],
  [/resy\.com/i, "Resy"],
  [/toasttab\.com/i, "Toast online ordering"],
  [/zocdoc\.com/i, "Zocdoc"],
  [/setmore\.com/i, "Setmore"],
  [/schedulicity\.com/i, "Schedulicity"],
];
const BOOK_CTA = /\b(book (now|online|an appointment|a visit|your appointment)|schedule (online|now|an appointment|service)|request (an )?appointment|order online|reserve (a table|now|online))\b/i;
const PHONE_ONLY_CTA =
  /\b((call|phone|text) (us )?(to|for) (book|schedule|an appointment|a quote|a free estimate|an estimate|a free quote|reservations?)|to book,? (call|dm|message) us|call for (a )?(free )?(quote|estimate)|call to (book|schedule)|dm us)\b/i;
const AFTER_HOURS =
  /\b(leave (us )?a (message|voicemail)|call you back (the )?next (business )?day|(we'll|we will|we’ll) (call|get back to) you (the )?next (business )?day|after hours,? (please )?leave)\b/i;
const PRICE = /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g;
const DAY = "(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\\.?";
const TIME = "\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|a\\.m\\.|p\\.m\\.)?";
const HOURS_LINE = new RegExp(`\\b${DAY}(?:\\s*(?:-|–|—|to|through)\\s*${DAY})?\\s*:?\\s*${TIME}\\s*(?:-|–|—|to)\\s*${TIME}`, "i");
const PHONE = /(?:\+?1[\s.-]?)?\(?\b([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/g;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

const snippetOf = (text: string, index: number, length: number) => {
  const lineStart = text.lastIndexOf("\n", index) + 1;
  const lineEnd = text.indexOf("\n", index + length);
  return text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim().slice(0, 200);
};

const uniqueBy = <T>(items: T[], key: (item: T) => string) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

function emptyAnalysis(requestedUrl: string, problem: string | null): WebsiteAnalysis {
  return {
    requestedUrl,
    reachable: false,
    problem,
    pages: [],
    pagesScanned: 0,
    services: [],
    products: [],
    prices: [],
    hours: [],
    phones: [],
    emails: [],
    booking: { onlineBooking: false, evidence: null, provider: null },
    contactForm: { present: false, evidence: null },
    faq: { present: false, url: null, questions: [] },
    policies: {
      privacy: { present: false, url: null },
      refund: { present: false, url: null },
      terms: { present: false, url: null },
    },
    phoneOnlyCallsToAction: [],
    afterHoursMessages: [],
    method: "rules",
    limitations: problem ? [problem] : [],
  };
}

/** Fetcher for fictional `.example` sites in data/mock/onboarding.ts. */
export const mockWebFetch: FetchLike = async (input) => {
  const url = new URL(input);
  const page = mockWebsites[url.origin]?.[url.pathname.replace(/\/$/, "") || "/"];
  return page === undefined
    ? new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } })
    : new Response(page, { status: 200, headers: { "content-type": url.pathname.endsWith(".txt") ? "text/plain" : "text/html" } });
};
const mockResolve: ResolveHost = async () => ["93.184.216.34"];

/** Extract facts from already-fetched pages (pure; easy to test). */
export function extractFromPages(requestedUrl: string, pages: ScannedPage[], raw: RawPage[]): WebsiteAnalysis {
  const analysis = emptyAnalysis(requestedUrl, null);
  analysis.reachable = raw.length > 0;
  analysis.pages = pages;
  analysis.pagesScanned = raw.length;

  for (const page of raw) {
    const { text, html, url } = page;
    const evidence = (snippet: string): WebEvidence => ({ url, snippet: snippet.slice(0, 200) });

    for (const match of text.matchAll(PRICE)) {
      const amount = Number(match[1].replace(/,/g, ""));
      if (amount > 0 && amount < 1_000_000)
        analysis.prices.push({ value: { amount, text: match[0] }, evidence: evidence(snippetOf(text, match.index!, match[0].length)), method: "pattern" });
    }
    for (const line of text.split("\n")) {
      if (HOURS_LINE.test(line) || /^(hours|open|business hours)\s*:/i.test(line))
        analysis.hours.push({ value: line.slice(0, 160), evidence: evidence(line), method: "pattern" });
      const cta = line.match(PHONE_ONLY_CTA);
      if (cta) analysis.phoneOnlyCallsToAction.push({ value: cta[0], evidence: evidence(line), method: "pattern" });
      const afterHours = line.match(AFTER_HOURS);
      if (afterHours) analysis.afterHoursMessages.push({ value: afterHours[0], evidence: evidence(line), method: "pattern" });
    }
    for (const match of text.matchAll(PHONE))
      analysis.phones.push({ value: `(${match[1]}) ${match[2]}-${match[3]}`, evidence: evidence(snippetOf(text, match.index!, match[0].length)), method: "pattern" });
    for (const match of text.matchAll(EMAIL)) {
      if (/\.(png|jpe?g|gif|webp|svg)$/i.test(match[0])) continue;
      analysis.emails.push({ value: match[0].toLowerCase(), evidence: evidence(snippetOf(text, match.index!, match[0].length)), method: "pattern" });
    }

    const links = extractLinks(html, url);
    if (!analysis.booking.onlineBooking) {
      for (const candidate of [...links.map((l) => ({ target: l.href, text: l.text })), ...[...html.matchAll(/<(?:script|iframe)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map((m) => ({ target: m[1], text: "" }))]) {
        const provider = BOOKING_PROVIDERS.find(([pattern]) => pattern.test(candidate.target));
        if (provider) {
          analysis.booking = { onlineBooking: true, provider: provider[1], evidence: evidence(`${candidate.text || "Embedded widget"} → ${candidate.target}`) };
          break;
        }
        if (candidate.text && BOOK_CTA.test(candidate.text) && !/^tel:|^mailto:/i.test(candidate.target)) {
          analysis.booking = { onlineBooking: true, provider: null, evidence: evidence(`${candidate.text} → ${candidate.target}`) };
          break;
        }
      }
    }

    for (const form of html.matchAll(/<form\b[\s\S]*?<\/form>/gi)) {
      if (/type\s*=\s*["']email["']|name\s*=\s*["'](email|message|phone|name)["']|<textarea/i.test(form[0]) && !analysis.contactForm.present) {
        analysis.contactForm = { present: true, evidence: evidence("Contact form with email/message fields") };
      }
    }

    const questions = headings(html).filter((h) => h.endsWith("?") && h.length <= 160);
    if (page.kind === "faq" || questions.length >= 2) {
      analysis.faq.present = true;
      analysis.faq.url ??= url;
      analysis.faq.questions.push(...questions);
    }

    for (const link of links) {
      const label = `${link.text} ${new URL(link.href).pathname}`;
      if (/privacy/i.test(label) && !analysis.policies.privacy.present) analysis.policies.privacy = { present: true, url: link.href };
      if (/(refund|return|cancellation)/i.test(label) && !analysis.policies.refund.present) analysis.policies.refund = { present: true, url: link.href };
      if (/terms/i.test(label) && !analysis.policies.terms.present) analysis.policies.terms = { present: true, url: link.href };
    }
    if (page.kind === "privacy" || page.kind === "refund" || page.kind === "terms") {
      analysis.policies[page.kind] = { present: true, url, facts: extractPolicyFacts(page.kind, text, url) };
    }

    if (page.kind === "services" || page.kind === "pricing") {
      for (const item of listItems(html)) {
        if (item.length >= 3 && item.length <= 60) analysis.services.push({ value: item, evidence: evidence(item), method: "html" });
      }
    }
  }

  analysis.prices = uniqueBy(analysis.prices, (f) => `${f.value.amount}|${f.evidence.snippet}`).slice(0, 15);
  analysis.hours = uniqueBy(analysis.hours, (f) => f.value.toLowerCase()).slice(0, 10);
  analysis.phones = uniqueBy(analysis.phones, (f) => f.value).slice(0, 5);
  analysis.emails = uniqueBy(analysis.emails, (f) => f.value).slice(0, 5);
  analysis.services = uniqueBy(analysis.services, (f) => f.value.toLowerCase()).slice(0, 20);
  analysis.phoneOnlyCallsToAction = uniqueBy(analysis.phoneOnlyCallsToAction, (f) => f.evidence.snippet).slice(0, 5);
  analysis.afterHoursMessages = uniqueBy(analysis.afterHoursMessages, (f) => f.evidence.snippet).slice(0, 5);
  analysis.faq.questions = [...new Set(analysis.faq.questions)].slice(0, 15);

  if (analysis.reachable) {
    analysis.limitations.push(
      `We read ${raw.length} public page${raw.length === 1 ? "" : "s"}. Features hidden behind logins or added by apps after the page loads may not be visible.`,
    );
  }
  return analysis;
}

const llmSchema = v.object({
  services: v.array(v.object({ name: v.string({ min: 2, max: 80 }), evidence: v.string({ min: 3, max: 240 }) }), { max: 25 }),
  products: v.array(v.object({ name: v.string({ min: 2, max: 80 }), evidence: v.string({ min: 3, max: 240 }) }), { max: 25 }),
});

async function enrichWithLlm(analysis: WebsiteAnalysis, raw: RawPage[], llm: LlmProvider): Promise<boolean> {
  const corpus = raw.map((p) => `URL: ${p.url}\n${p.text.slice(0, 2_500)}`).join("\n\n").slice(0, 8_000);
  const result = await llmJson(llm, llmSchema, {
    task: "website_extract",
    system:
      'Extract the services and products a small business offers from its website text. Reply with JSON only: {"services":[{"name":"...","evidence":"..."}],"products":[...]}. ' +
      "`evidence` must be copied exactly from the text. Do not invent items. Do not include prices or numbers you were not given.",
    user: corpus,
  });
  if (!result.ok) return false;
  const norm = (s: string) => s.replace(/\s+/g, " ").toLowerCase().trim();
  const locate = (snippet: string) => raw.find((p) => norm(p.text).includes(norm(snippet)));
  const add = (target: Finding<string>[], items: { name: string; evidence: string }[]) => {
    for (const item of items) {
      const page = locate(item.evidence);
      if (!page) continue; // evidence not on any page → drop
      if (target.some((f) => f.value.toLowerCase() === item.name.toLowerCase())) continue;
      target.push({ value: item.name, evidence: { url: page.url, snippet: item.evidence.slice(0, 200) }, method: "llm" });
    }
  };
  add(analysis.services, result.value.services);
  add(analysis.products, result.value.products);
  analysis.services = analysis.services.slice(0, 25);
  analysis.products = analysis.products.slice(0, 25);
  return true;
}

export async function scanWebsite(rawUrl: string, opts: ScanOptions = {}): Promise<WebsiteScan> {
  const start = normalizeWebsiteUrl(rawUrl);
  if (!start) return { analysis: emptyAnalysis(rawUrl, "That doesn't look like a website address."), raw: [] };
  const isMock = start.hostname.endsWith(".example");
  const fetchOpts = {
    fetchImpl: isMock ? mockWebFetch : opts.fetchImpl,
    resolveHost: isMock ? mockResolve : opts.resolveHost,
    timeoutMs: opts.timeoutMs,
    userAgent: opts.userAgent,
  };
  const cache = opts.cache ?? sharedCache;
  const run = async (): Promise<WebsiteScan> => {
    let robots = "";
    try {
      const robotsPage = await safeFetch(new URL("/robots.txt", start).toString(), { ...fetchOpts, maxBytes: 200_000 });
      if (robotsPage.status === 200) robots = robotsPage.body;
    } catch {
      // No robots.txt reachable → treat as allowed.
    }
    const allowed = (url: string) => robotsAllows(robots, new URL(url).pathname);
    if (!allowed(start.toString())) {
      const analysis = emptyAnalysis(start.toString(), "This website asks automated tools not to read it, so we skipped it.");
      analysis.pages = [{ url: start.toString(), kind: "home", title: null, status: "blocked_by_robots" }];
      return { analysis, raw: [] };
    }

    const pages: ScannedPage[] = [];
    const raw: RawPage[] = [];
    const fetchPage = async (url: string, kind: PageKind) => {
      if (!allowed(url)) {
        pages.push({ url, kind, title: null, status: "blocked_by_robots" });
        return null;
      }
      try {
        const page = await safeFetch(url, fetchOpts);
        if (page.status >= 400 || !/html|text\/plain|^$/i.test(page.contentType)) {
          pages.push({ url, kind, title: null, status: "failed", error: `HTTP ${page.status}` });
          return null;
        }
        const rawPage: RawPage = { url: page.finalUrl, kind, html: page.body, text: htmlToText(page.body), headers: page.headers };
        raw.push(rawPage);
        pages.push({ url: page.finalUrl, kind, title: pageTitle(page.body), status: "scanned" });
        return rawPage;
      } catch (error) {
        const message = error instanceof SafeFetchError ? error.message : "Could not read this page.";
        pages.push({ url, kind, title: null, status: "failed", error: message });
        return null;
      }
    };

    const home = await fetchPage(start.toString(), "home");
    if (!home) {
      const failed = pages[0];
      const analysis = emptyAnalysis(start.toString(), failed?.error ?? "The website could not be reached.");
      analysis.pages = pages;
      return { analysis, raw };
    }
    const origin = new URL(home.url).origin;
    const candidates = new Map<string, PageKind>();
    for (const link of extractLinks(home.html, home.url)) {
      const url = new URL(link.href);
      if (url.origin !== origin || url.pathname === new URL(home.url).pathname) continue;
      if (/\.(pdf|jpe?g|png|gif|zip|docx?)$/i.test(url.pathname)) continue;
      url.search = "";
      const kind = classifyPage(url.toString(), link.text);
      if (kind !== "other" && !candidates.has(url.toString())) candidates.set(url.toString(), kind);
    }
    const ordered = [...candidates.entries()].sort((a, b) => KIND_PRIORITY.indexOf(a[1]) - KIND_PRIORITY.indexOf(b[1]));
    const limit = Math.max(0, (opts.maxPages ?? 6) - 1);
    await Promise.all(ordered.slice(0, limit).map(([url, kind]) => fetchPage(url, kind)));
    // Keep page order stable for reproducible results.
    raw.sort((a, b) => (a.kind === "home" ? -1 : b.kind === "home" ? 1 : a.url.localeCompare(b.url)));
    pages.sort((a, b) => (a.kind === "home" ? -1 : b.kind === "home" ? 1 : a.url.localeCompare(b.url)));

    const analysis = extractFromPages(start.toString(), pages, raw);
    if (opts.llm && (await enrichWithLlm(analysis, raw, opts.llm))) analysis.method = "rules+llm";
    if (isMock) analysis.limitations.push("This is a fictional sample website (mock mode).");
    return { analysis, raw };
  };

  const key = `web:${hashKey(start.toString(), opts.maxPages ?? 6, Boolean(opts.llm))}`;
  try {
    const scan = await cached(cache, key, 60 * 60_000, run);
    if (!scan.analysis.reachable) cache.delete(key); // don't remember temporary failures
    return scan;
  } catch (error) {
    log.warn("website.scan_failed", { url: start.toString(), error });
    return { analysis: emptyAnalysis(start.toString(), "The website could not be read."), raw: [] };
  }
}
