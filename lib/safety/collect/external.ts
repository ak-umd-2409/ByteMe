/**
 * Outside lookups: domain registration date (RDAP) and Google Safe Browsing.
 * Both call fixed, trusted hosts, so they use plain fetch with a timeout,
 * not safeFetch. Never throw.
 */
import type { CollectDeps, SafetyFacts } from "../types.ts";

/** The part of a host someone registered: tool.com, tool.co.uk. */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  const n = labels.length;
  const secondLevel = ["co", "com", "org", "net"];
  if (n >= 3 && labels[n - 1].length === 2 && secondLevel.includes(labels[n - 2])) return labels.slice(-3).join(".");
  return labels.slice(-2).join(".");
}

async function fetchWithTimeout(url: string, init: RequestInit, deps: CollectDeps): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 8_000);
  try {
    return await (deps.fetchImpl ?? fetch)(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupDomain(host: string, deps: CollectDeps): Promise<SafetyFacts["domain"]> {
  const name = registrableDomain(host);
  const result: SafetyFacts["domain"] = { name, registeredAt: null, source: "rdap" };
  try {
    const response = await fetchWithTimeout(`https://rdap.org/domain/${name}`, { headers: { accept: "application/rdap+json" } }, deps);
    if (!response.ok) return result;
    const body = (await response.json()) as { events?: { eventAction?: string; eventDate?: string }[] };
    const date = body.events?.find((e) => e.eventAction === "registration")?.eventDate;
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}/.test(date)) result.registeredAt = date.slice(0, 10);
  } catch {
    // RDAP is best effort: no date means "couldn't tell".
  }
  return result;
}

export async function checkSafeBrowsing(url: string, deps: CollectDeps): Promise<SafetyFacts["safeBrowsing"]> {
  const key = deps.safeBrowsingKey;
  if (!key) return "not_run";
  try {
    const response = await fetchWithTimeout(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client: { clientId: "mainstreet-ai", clientVersion: "0.1" },
          threatInfo: {
            threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: [{ url }],
          },
        }),
      },
      deps,
    );
    if (!response.ok) return "not_run";
    const body = (await response.json()) as { matches?: unknown[] };
    return Array.isArray(body.matches) && body.matches.length > 0 ? "listed" : "clean";
  } catch {
    return "not_run";
  }
}
