/**
 * Finds and reads a tool's Home, About, Contact, Privacy, Pricing and Terms
 * pages. Never throws: a page is either read, `null` (not found) or
 * `{ error }` (it may exist but we couldn't read it).
 */
import { extractLinks, htmlToText } from "../../business/html.ts";
import { classifyPage } from "../../business/website.ts";
import { robotsAllows, safeFetch, SafeFetchError, type FetchedPage } from "../../shared/safeFetch.ts";
import { SAFETY_CONFIG } from "../config.ts";
import { contentHash, hasDownloadPrompt } from "../signals.ts";
import { registrableDomain } from "./external.ts";
import type { CollectDeps, FetchedPageFact, PageFact, PageKind } from "../types.ts";

type OtherKind = Exclude<PageKind, "home">;
/** Privacy first: it is a core check and a red flag, so it gets the page budget first. */
const SEARCH_ORDER: OtherKind[] = ["privacy", "about", "contact", "pricing", "terms"];

export interface FoundPages {
  pages: Record<PageKind, PageFact>;
  https: boolean;
  downloadPrompt: boolean;
}

const emptyPages = (value: PageFact): Record<PageKind, PageFact> => ({
  home: value,
  about: value,
  contact: value,
  privacy: value,
  pricing: value,
  terms: value,
});

const errorCode = (error: unknown) => (error instanceof SafeFetchError ? error.code : "network");

export async function findPages(url: string, deps: CollectDeps): Promise<FoundPages> {
  const fetchedAt = (deps.now ?? (() => new Date()))().toISOString().slice(0, 10);
  let budget = SAFETY_CONFIG.maxPages;
  const get = async (target: string): Promise<FetchedPage> => {
    budget -= 1;
    return safeFetch(target, {
      fetchImpl: deps.fetchImpl,
      resolveHost: deps.resolveHost,
      timeoutMs: deps.timeoutMs,
      userAgent: deps.userAgent,
      maxBytes: SAFETY_CONFIG.maxPageBytes,
    });
  };
  const toFact = (page: FetchedPage): FetchedPageFact => {
    const text = htmlToText(page.body);
    return { url: page.requestedUrl, finalUrl: page.finalUrl, status: page.status, fetchedAt, contentHash: contentHash(text), text };
  };

  // Home page. If it fails, every other page is "couldn't read", never "missing".
  const unreachable = (code: string): FoundPages => ({ pages: emptyPages({ error: code }), https: false, downloadPrompt: false });
  let home: FetchedPage;
  try {
    home = await get(url);
  } catch (error) {
    return unreachable(errorCode(error));
  }
  if (home.status >= 400) return unreachable(`http_${home.status}`);
  const origin = new URL(home.finalUrl).origin;
  const site = registrableDomain(new URL(home.finalUrl).hostname);

  let robots = "";
  try {
    const r = await get(`${origin}/robots.txt`);
    if (r.status < 400) robots = r.body;
  } catch {
    // A missing or unreadable robots.txt means "allowed".
  }
  const allowed = (target: string) => robotsAllows(robots, new URL(target).pathname);

  const allLinks = extractLinks(home.body, home.finalUrl);
  const sameSite = (href: string) => registrableDomain(new URL(href).hostname) === site;
  const links = allLinks.filter((link) => sameSite(link.href));
  // A policy hosted elsewhere (Termly, a parent company) needs a person to look: held, never "missing".
  const offSitePrivacy = allLinks.some((link) => !sameSite(link.href) && classifyPage(link.href, link.text) === "privacy");

  const pages = emptyPages(null);
  pages.home = toFact(home);
  const used = new Set<string>([home.finalUrl]);

  // Pass 1: pages the home page links to. These are certain, so they come first.
  const unresolved: OtherKind[] = [];
  for (const kind of SEARCH_ORDER) {
    const linked = links.find((link) => !used.has(link.href) && classifyPage(link.href, link.text) === kind);
    if (!linked) {
      unresolved.push(kind);
      continue;
    }
    used.add(linked.href);
    if (!allowed(linked.href)) pages[kind] = { error: "robots" };
    else if (budget <= 0) pages[kind] = { error: "limit" };
    else {
      try {
        const page = await get(linked.href);
        pages[kind] = page.status >= 400 ? { error: `http_${page.status}` } : toFact(page);
      } catch (error) {
        pages[kind] = { error: errorCode(error) };
      }
    }
  }

  // Pass 2: guess the usual paths. 404 means "not here"; anything else that
  // stops us (robots, 403, timeout, page limit) is remembered, so the page is
  // "couldn't read", not "missing".
  for (const kind of unresolved) {
    let firstProblem: string | null = null;
    for (const path of SAFETY_CONFIG.fallbackPaths[kind]) {
      const target = `${origin}${path}`;
      if (used.has(target)) continue;
      if (!allowed(target)) {
        firstProblem ??= "robots";
        continue;
      }
      if (budget <= 0) {
        firstProblem ??= "limit";
        break;
      }
      try {
        const page = await get(target);
        if (page.status < 400) {
          used.add(page.finalUrl);
          pages[kind] = toFact(page);
          break;
        }
        if (page.status !== 404 && page.status !== 410) firstProblem ??= `http_${page.status}`;
      } catch (error) {
        firstProblem ??= errorCode(error);
      }
    }
    if (pages[kind] === null && firstProblem) pages[kind] = { error: firstProblem };
  }
  if (pages.privacy === null && offSitePrivacy) pages.privacy = { error: "off_site" };

  return {
    pages,
    https: home.finalUrl.startsWith("https:"),
    downloadPrompt: hasDownloadPrompt(home.body, home.finalUrl),
  };
}
