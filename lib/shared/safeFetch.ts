import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Safe fetching of owner-supplied website URLs.
 *
 * - Only http(s), only public hosts: private, loopback, link-local and metadata
 *   addresses are refused (SSRF protection), including after redirects.
 * - Timeouts and a response size cap.
 * - robots.txt is respected for our user agent.
 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export type ResolveHost = (hostname: string) => Promise<string[]>;

export interface SafeFetchOptions {
  fetchImpl?: FetchLike;
  resolveHost?: ResolveHost;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  userAgent?: string;
}

export interface FetchedPage {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  headers: Record<string, string>;
}

export class SafeFetchError extends Error {
  code: "invalid_url" | "blocked_host" | "timeout" | "too_large" | "http_error" | "network" | "robots";
  constructor(code: SafeFetchError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

const defaultResolve: ResolveHost = async (hostname) =>
  (await lookup(hostname, { all: true })).map((entry) => entry.address);

/** True for addresses that must never be fetched from the server. */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb)/.test(lower);
  }
  return true;
}

/** Normalize an owner-typed website into a URL, or null if unusable. */
export function normalizeWebsiteUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 500) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname || url.username || url.password) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

export async function assertPublicHost(url: URL, resolveHost: ResolveHost = defaultResolve) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local"))
    throw new SafeFetchError("blocked_host", "Local addresses can't be scanned.");
  const addresses = isIP(host) ? [host] : await resolveHost(host).catch(() => {
    throw new SafeFetchError("network", "That website address could not be found.");
  });
  if (addresses.length === 0 || addresses.some(isPrivateAddress))
    throw new SafeFetchError("blocked_host", "That address points to a private network and can't be scanned.");
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new SafeFetchError("too_large", "Page is too large to scan.");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new SafeFetchError("too_large", "Page is too large to scan.");
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<FetchedPage> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const resolveHost = opts.resolveHost ?? defaultResolve;
  const maxRedirects = opts.maxRedirects ?? 3;
  let url = normalizeWebsiteUrl(rawUrl);
  if (!url) throw new SafeFetchError("invalid_url", "That doesn't look like a website address.");
  const requestedUrl = url.toString();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicHost(url, resolveHost);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8_000);
    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": opts.userAgent ?? "MainStreetAI-Scanner/0.1",
          accept: "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5",
        },
      });
    } catch (error) {
      clearTimeout(timer);
      if ((error as Error).name === "AbortError") throw new SafeFetchError("timeout", "The website took too long to respond.");
      throw new SafeFetchError("network", "The website could not be reached.");
    }
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      clearTimeout(timer);
      const next = normalizeWebsiteUrl(new URL(response.headers.get("location")!, url).toString());
      if (!next) throw new SafeFetchError("invalid_url", "The website redirected to an invalid address.");
      url = next;
      continue;
    }
    try {
      const body = await readCapped(response, opts.maxBytes ?? 1_500_000);
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => (headers[key] = value));
      return {
        requestedUrl,
        finalUrl: url.toString(),
        status: response.status,
        contentType: response.headers.get("content-type") ?? "",
        body,
        headers,
      };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new SafeFetchError("http_error", "The website redirected too many times.");
}

/** Parse robots.txt and decide whether `path` may be fetched by our agent. */
export function robotsAllows(robotsTxt: string, path: string, agent = "mainstreetai"): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    const match = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!match) continue;
    const field = match[1].toLowerCase();
    const value = match[2].trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === "allow" || field === "disallow") && current) {
      lastWasAgent = false;
      if (value) current.rules.push({ allow: field === "allow", path: value });
    } else lastWasAgent = false;
  }
  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && agent.includes(a)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  let best: { allow: boolean; length: number } | null = null;
  for (const rule of chosen.flatMap((g) => g.rules)) {
    const pattern = rule.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    const anchored = pattern.endsWith("\\$") ? `^${pattern.slice(0, -2)}$` : `^${pattern}`;
    if (new RegExp(anchored).test(path) && (!best || rule.path.length > best.length))
      best = { allow: rule.allow, length: rule.path.length };
  }
  return best ? best.allow : true;
}
