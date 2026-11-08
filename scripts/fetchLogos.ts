/**
 * Save each catalog tool's logo from the vendor's own website.
 *
 *   npm run catalog:logos            (all tools in data/catalog/real.json)
 *   npm run catalog:logos -- --id brevo
 *
 * For each tool: fetch the vendor's home page with safeFetch (public hosts only,
 * timeouts, size cap), respect robots.txt, pick the best icon the page declares
 * (apple-touch-icon, then SVG/PNG icon, then /favicon.ico), download it from the
 * vendor's own domain only, and keep it if it is a real image at least 32px.
 * Writes public/logos/<id>.<ext> and data/catalog/logos.json.
 * Never uses Google's favicon service, Clearbit or any other logo API.
 * A tool with no usable icon gets no entry, and the app shows a letter badge.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { CatalogRecord } from "../lib/catalog/types.ts";
import { checkIcon, onVendorDomain, pickIconUrls, type LogoEntry } from "../lib/catalog/logos.ts";
import { robotsAllows, safeFetch, type FetchLike } from "../lib/shared/safeFetch.ts";

/** Hosts we never fetch from, whatever the catalog says (team rule: never scrape Google). */
const NEVER = ["google.com"];
const UA = "MainStreetAI-LogoFetcher/0.1 (+https://github.com/ak-umd-2409/ByteMe)";
const MAP = "data/catalog/logos.json";

const { values } = parseArgs({ options: { id: { type: "string" } } });
const tools = (JSON.parse(readFileSync("data/catalog/real.json", "utf8")) as CatalogRecord[]).filter((t) => !values.id || t.id === values.id);
const map: Record<string, LogoEntry> = existsSync(MAP) ? JSON.parse(readFileSync(MAP, "utf8")) : {};
mkdirSync("public/logos", { recursive: true });

/** safeFetch decodes bodies as text; keep the raw bytes of the last response for images. */
let lastBytes = new Uint8Array();
const byteFetch: FetchLike = async (input, init) => {
  const res = await fetch(input, init);
  const buf = new Uint8Array(await res.arrayBuffer());
  lastBytes = buf;
  return new Response(res.status >= 200 && res.status !== 204 && res.status !== 304 ? buf : null, { status: res.status, headers: res.headers });
};
const get = (url: string, maxBytes = 1_500_000) => safeFetch(url, { fetchImpl: byteFetch, userAgent: UA, timeoutMs: 10_000, maxBytes });

const robotsCache = new Map<string, string | null>();
async function allowed(url: string): Promise<boolean> {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    try {
      const r = await get(`${u.origin}/robots.txt`, 500_000);
      robotsCache.set(u.origin, r.status === 200 ? r.body : r.status >= 400 && r.status < 500 ? "" : null);
    } catch {
      robotsCache.set(u.origin, null);
    }
  }
  const txt = robotsCache.get(u.origin);
  return txt !== null && txt !== undefined && robotsAllows(txt, u.pathname, "mainstreetai");
}

const noLogo: string[] = [];
for (const tool of tools) {
  const { website, domain } = tool.vendor;
  const why = (msg: string) => {
    console.log(`  ${tool.id}: no logo (${msg})`);
    noLogo.push(tool.id);
  };
  if (tool.sample) continue;
  if (NEVER.some((d) => onVendorDomain(website, d))) {
    why("we don't fetch from Google");
    continue;
  }
  try {
    if (!(await allowed(website))) {
      why("robots.txt says no");
      continue;
    }
    const page = await get(website, 5_000_000);
    if (page.status !== 200) {
      why(`home page returned ${page.status}`);
      continue;
    }
    let saved: LogoEntry | null = null;
    for (const iconUrl of pickIconUrls(page.body, page.finalUrl, domain)) {
      if (!(await allowed(iconUrl))) continue;
      try {
        const icon = await get(iconUrl, 1_000_000);
        if (icon.status !== 200 || !onVendorDomain(icon.finalUrl, domain)) continue;
        const ok = checkIcon(lastBytes);
        if (!ok) continue;
        for (const ext of ["png", "svg", "ico"]) rmSync(`public/logos/${tool.id}.${ext}`, { force: true });
        writeFileSync(`public/logos/${tool.id}.${ok.ext}`, lastBytes);
        saved = { path: `/logos/${tool.id}.${ok.ext}`, sourceUrl: iconUrl, fetchedAt: new Date().toISOString() };
        console.log(`  ${tool.id}: ${saved.path} (${ok.ext}, ${ok.px === Infinity ? "vector" : `${ok.px}px`}) from ${iconUrl}`);
        break;
      } catch {
        // Try the next icon.
      }
    }
    if (saved) map[tool.id] = saved;
    else why("no usable icon on the vendor's own site");
  } catch (error) {
    why((error as Error).message);
  }
}

const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(MAP, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`\nSaved ${Object.keys(sorted).length} logos to ${MAP}.${noLogo.length ? ` Letter badge for: ${noLogo.join(", ")}` : ""}`);
