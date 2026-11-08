/**
 * Finds and reads a tool's Home, Pricing, Features, Integrations and Help
 * pages (at most 6 pages). Same rules as the Safety Check's page finder:
 * public pages only, robots.txt respected, never throws. A page is either
 * read, `null` (not found) or `{ error }` (it may exist but we couldn't read it).
 */
import { extractLinks, htmlToText } from "../../business/html.ts";
import { robotsAllows, safeFetch, SafeFetchError, type FetchedPage } from "../../shared/safeFetch.ts";
import { SAFETY_CONFIG } from "../../safety/config.ts";
import { registrableDomain } from "../../safety/collect/external.ts";
import { contentHash } from "../../safety/signals.ts";
import type { CollectDeps, FetchedPageFact, PageFact } from "../../safety/types.ts";
import type { CardPageKind } from "./types.ts";

type FoundKind = Exclude<CardPageKind, "home" | "privacy">;
const SEARCH_ORDER: FoundKind[] = ["pricing", "features", "integrations", "help"];
export const MAX_CARD_PAGES = 6;
/** Guessed paths that turn out missing still cost a request, so requests have their own cap. */
export const MAX_CARD_REQUESTS = 10;

const KIND_PATTERNS: Record<FoundKind, RegExp> = {
  pricing: /\b(pricing|prices|plans)\b/i,
  features: /\b(features?|products?|how it works)\b/i,
  integrations: /\b(integrations?|apps|app marketplace)\b/i,
  help: /\b(help|support|help center|getting started)\b/i,
};
const FALLBACK_PATHS: Record<FoundKind, string[]> = {
  pricing: ["/pricing", "/plans"],
  features: ["/features", "/product"],
  integrations: ["/integrations", "/apps"],
  help: ["/help", "/support"],
};

function kindOf(href: string, text: string): FoundKind | null {
  const path = new URL(href).pathname;
  if (path === "/" || path === "") return null;
  const haystack = `${path.replace(/[-_/]+/g, " ")} ${text}`;
  return SEARCH_ORDER.find((kind) => KIND_PATTERNS[kind].test(haystack)) ?? null;
}

const errorCode = (error: unknown) => (error instanceof SafeFetchError ? error.code : "network");

export const emptyCardPages = (value: PageFact): Record<CardPageKind, PageFact> => ({
  home: value,
  pricing: value,
  features: value,
  integrations: value,
  help: value,
  privacy: null,
});

export async function findCardPages(url: string, deps: CollectDeps): Promise<Record<CardPageKind, PageFact>> {
  const fetchedAt = (deps.now ?? (() => new Date()))().toISOString().slice(0, 10);
  let pagesLeft = MAX_CARD_PAGES;
  let requestsLeft = MAX_CARD_REQUESTS;
  const fetchOpts = {
    fetchImpl: deps.fetchImpl,
    resolveHost: deps.resolveHost,
    timeoutMs: deps.timeoutMs,
    userAgent: deps.userAgent,
    maxBytes: SAFETY_CONFIG.maxPageBytes,
  };
  const get = (target: string) => {
    requestsLeft -= 1;
    return safeFetch(target, fetchOpts);
  };
  const toFact = (page: FetchedPage): FetchedPageFact => {
    const text = htmlToText(page.body);
    return { url: page.requestedUrl, finalUrl: page.finalUrl, status: page.status, fetchedAt, contentHash: contentHash(text), text };
  };

  let home: FetchedPage;
  try {
    home = await get(url);
  } catch (error) {
    return emptyCardPages({ error: errorCode(error) });
  }
  if (home.status >= 400) return emptyCardPages({ error: `http_${home.status}` });
  const origin = new URL(home.finalUrl).origin;
  const site = registrableDomain(new URL(home.finalUrl).hostname);

  let robots = "";
  try {
    // robots.txt doesn't count toward the page limit.
    const r = await safeFetch(`${origin}/robots.txt`, fetchOpts);
    if (r.status < 400) robots = r.body;
  } catch {
    // A missing or unreadable robots.txt means "allowed".
  }
  const allowed = (target: string) => robotsAllows(robots, new URL(target).pathname);

  // A tool listed at a sub-page of a big site (squareup.com/us/en/appointments)
  // only reads pages under that sub-page, so it never gets another product's prices.
  const scope = new URL(url).pathname.replace(/\/+$/, "");
  const links = extractLinks(home.body, home.finalUrl).filter((link) => {
    try {
      const target = new URL(link.href);
      return registrableDomain(target.hostname) === site && (!scope || target.pathname.startsWith(`${scope}/`));
    } catch {
      return false;
    }
  });
  const pages = emptyCardPages(null);
  pages.home = toFact(home);
  pagesLeft -= 1;
  const used = new Set<string>([home.finalUrl]);

  const read = async (kind: FoundKind, target: string): Promise<"ok" | "missing" | string> => {
    if (!allowed(target)) return "robots";
    if (pagesLeft <= 0 || requestsLeft <= 0) return "limit";
    try {
      const page = await get(target);
      used.add(page.finalUrl);
      if (page.status < 400) {
        pagesLeft -= 1;
        pages[kind] = toFact(page);
        return "ok";
      }
      return page.status === 404 || page.status === 410 ? "missing" : `http_${page.status}`;
    } catch (error) {
      return errorCode(error);
    }
  };

  for (const kind of SEARCH_ORDER) {
    const linked = links.find((link) => !used.has(link.href) && kindOf(link.href, link.text) === kind);
    if (linked) {
      used.add(linked.href);
      const outcome = await read(kind, linked.href);
      if (outcome !== "ok") pages[kind] = { error: outcome === "missing" ? "http_404" : outcome };
      continue;
    }
    // Not linked: guess the usual paths. 404 means "not here"; anything else that stops us is remembered.
    let firstProblem: string | null = null;
    for (const path of FALLBACK_PATHS[kind]) {
      const target = `${origin}${scope}${path}`;
      if (used.has(target)) continue;
      const outcome = await read(kind, target);
      if (outcome === "ok") break;
      if (outcome !== "missing") firstProblem ??= outcome;
      if (outcome === "limit") break;
    }
    if (pages[kind] === null && firstProblem) pages[kind] = { error: firstProblem };
  }
  return pages;
}
