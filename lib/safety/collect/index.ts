/**
 * The collector: gathers facts about one tool's website. Uses the internet
 * and the AI; never throws. See docs/specs/b-safety-check.md §3.
 */
import { getLlmProvider } from "../../llm/client.ts";
import { loadConfig } from "../../shared/config.ts";
import { normalizeWebsiteUrl } from "../../shared/safeFetch.ts";
import { findRiskySentences } from "../signals.ts";
import { isFetched, type CollectDeps, type SafetyFacts, type SafetyInput } from "../types.ts";
import { askAi } from "./ai.ts";
import { checkSafeBrowsing, lookupDomain } from "./external.ts";
import { findPages } from "./pages.ts";

export async function collectFacts(input: SafetyInput, deps: CollectDeps = {}): Promise<SafetyFacts> {
  const config = loadConfig();
  const d: CollectDeps = {
    timeoutMs: config.httpTimeoutMs,
    userAgent: config.userAgent,
    safeBrowsingKey: process.env.GOOGLE_SAFE_BROWSING_API_KEY?.trim() || null,
    ...deps,
  };
  d.llm ??= getLlmProvider(config);
  const now = (d.now ?? (() => new Date()))();
  d.now = () => now;

  const url = normalizeWebsiteUrl(input.url)?.toString() ?? input.url;
  const host = normalizeWebsiteUrl(input.url)?.hostname ?? input.url;
  const found = await findPages(url, d);
  const [ai, domain, safeBrowsing] = await Promise.all([askAi(found.pages, d), lookupDomain(host, d), checkSafeBrowsing(url, d)]);
  const privacy = found.pages.privacy;
  return {
    input: { ...input, url },
    collectedAt: now.toISOString().slice(0, 10),
    pages: found.pages,
    domain,
    https: found.https,
    downloadPrompt: found.downloadPrompt,
    ai,
    riskySentences: isFetched(privacy) ? findRiskySentences(privacy.text) : [],
    safeBrowsing,
  };
}
