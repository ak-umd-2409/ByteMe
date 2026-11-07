/**
 * The Safety Check fact sheet: everything the collector found about one tool's
 * website, and nothing else. The judge decides only from this.
 * See docs/specs/b-safety-check.md §2.
 */
import type { Cache } from "../shared/cache.ts";
import type { LlmProvider } from "../llm/client.ts";
import type { FetchLike, ResolveHost } from "../shared/safeFetch.ts";

export type PageKind = "home" | "about" | "contact" | "privacy" | "pricing" | "terms";
export const PAGE_KINDS: readonly PageKind[] = ["home", "about", "contact", "privacy", "pricing", "terms"];

export interface FetchedPageFact {
  url: string;
  finalUrl: string;
  status: number;
  fetchedAt: string;
  contentHash: string;
  text: string;
}

/** null = not found; { error } = the fetch failed (timeout, robots, http_403, ...). */
export type PageFact = FetchedPageFact | { error: string } | null;

/** An AI answer counts only with a quote found word for word on the page. */
export type AiAnswer<T extends string> = { answer: T; quote: string; pageUrl: string } | "unknown";

export interface SafetyInput {
  url: string;
  name: string;
  /** Takes payments or health info. */
  handlesSensitiveData: boolean;
}

export interface SafetyFacts {
  input: SafetyInput;
  /** ISO date (YYYY-MM-DD). The judge compares dates with this, never the clock. */
  collectedAt: string;
  pages: Record<PageKind, PageFact>;
  domain: { name: string; registeredAt: string | null; source: "rdap" };
  https: boolean;
  downloadPrompt: boolean;
  ai: {
    /** true only when the AI returned a valid answer for that page group. */
    ran: { about: boolean; privacy: boolean };
    companyName: AiAnswer<string>;
    address: AiAnswer<string>;
    leaderName: AiAnswer<string>;
    trainsOnYourData: AiAnswer<"yes" | "no" | "opt-in">;
    canDeleteData: AiAnswer<"yes" | "no">;
    whereStored: AiAnswer<string>;
    securityCertification: AiAnswer<string>;
  };
  riskySentences: string[];
  safeBrowsing: "clean" | "listed" | "not_run";
}

export interface CollectDeps {
  fetchImpl?: FetchLike;
  resolveHost?: ResolveHost;
  timeoutMs?: number;
  userAgent?: string;
  llm?: LlmProvider;
  cache?: Cache;
  /** The last saved fact sheet, so unchanged pages reuse their AI answers. */
  previous?: SafetyFacts | null;
  safeBrowsingKey?: string | null;
  now?: () => Date;
}

export const isFetched = (page: PageFact): page is FetchedPageFact =>
  page !== null && !("error" in page);
