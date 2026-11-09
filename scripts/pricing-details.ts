/**
 * Pricing details from each vendor's own pricing page.
 *
 *   npm run catalog:pricing -- fetch <outDir>   save each pricing page as plain text, to read and quote from
 *   npm run catalog:pricing -- check            re-fetch each page, keep only facts whose quote is on it
 *                                                word for word and says the answer; write data/catalog/pricing.json
 *
 * safeFetch only (public hosts, timeouts, size cap), robots.txt respected, and never Google
 * (team rule). A page we can't read leaves that tool's details "not confirmed".
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CatalogRecord } from "../lib/catalog/types.ts";
import { answerInQuote, type PricingDetails, type PricingDraft } from "../lib/catalog/pricingDetails.ts";
import { htmlToText } from "../lib/business/html.ts";
import { isVerbatim } from "../lib/business/reviews.ts";
import { robotsAllows, safeFetch } from "../lib/shared/safeFetch.ts";

const UA = "MainStreetAI-PricingCheck/0.1 (+https://github.com/ak-umd-2409/ByteMe)";
const NEVER = /(^|\.)google\.com$/i;
const [mode, outDir] = process.argv.slice(2);
const tools = JSON.parse(readFileSync("data/catalog/real.json", "utf8")) as CatalogRecord[];

const robots = new Map<string, string | null>();
async function allowed(url: string): Promise<string | null> {
  const u = new URL(url);
  if (NEVER.test(u.hostname)) return "we never fetch from Google";
  if (!robots.has(u.origin)) {
    try {
      const r = await safeFetch(`${u.origin}/robots.txt`, { userAgent: UA, timeoutMs: 10_000, maxBytes: 500_000 });
      robots.set(u.origin, r.status === 200 ? r.body : r.status >= 400 && r.status < 500 ? "" : null);
    } catch {
      robots.set(u.origin, null);
    }
  }
  const txt = robots.get(u.origin);
  if (txt === null || txt === undefined) return "couldn't read robots.txt";
  return robotsAllows(txt, u.pathname, "mainstreetai") ? null : "robots.txt says no";
}

const pageCache = new Map<string, string | { error: string }>();
async function pageText(url: string): Promise<string | { error: string }> {
  if (pageCache.has(url)) return pageCache.get(url)!;
  const no = await allowed(url);
  let out: string | { error: string };
  if (no) out = { error: no };
  else
    try {
      const r = await safeFetch(url, { userAgent: UA, timeoutMs: 15_000, maxBytes: 4_000_000 });
      out = r.status >= 200 && r.status < 300 ? htmlToText(r.body) : { error: `HTTP ${r.status}` };
    } catch (e) {
      out = { error: (e as Error).message };
    }
  pageCache.set(url, out);
  return out;
}

if (mode === "fetch") {
  if (!outDir) throw new Error("usage: fetch <outDir>");
  mkdirSync(outDir, { recursive: true });
  for (const t of tools) {
    const text = await pageText(t.pricing.pricingUrl);
    if (typeof text === "string") writeFileSync(join(outDir, `${t.id}.txt`), text);
    console.log(`${t.id}: ${typeof text === "string" ? `${text.length} chars` : text.error}`);
  }
} else if (mode === "check") {
  const dir = "data/catalog/pricing";
  const out: Record<string, PricingDetails> = {};
  for (const file of existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : []) {
    const d = JSON.parse(readFileSync(join(dir, file), "utf8")) as PricingDraft;
    const tool = tools.find((t) => t.id === d.id);
    if (!tool) {
      console.log(`${d.id}: not in the catalog, skipped`);
      continue;
    }
    const kept = [];
    for (const f of d.facts) {
      const vendorHost = new URL(tool.vendor.website).hostname.replace(/^www\./, "");
      if (!new URL(f.url).hostname.replace(/^www\./, "").endsWith(vendorHost)) {
        console.log(`  ✗ ${d.id} ${f.field}: not the vendor's own site`);
        continue;
      }
      const text = await pageText(f.url);
      if (typeof text !== "string") {
        console.log(`  ✗ ${d.id} ${f.field}: ${text.error}`);
        continue;
      }
      if (!isVerbatim(f.quote, text)) {
        console.log(`  ✗ ${d.id} ${f.field}: quote not on the page`);
        continue;
      }
      const why = answerInQuote(f);
      if (why) {
        console.log(`  ✗ ${d.id} ${f.field}: ${why}`);
        continue;
      }
      kept.push(f);
      console.log(`  ✓ ${d.id} ${f.field} = ${f.answer}`);
    }
    if (kept.length) out[d.id] = { plan: d.plan, checkedAt: new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }), facts: kept };
  }
  writeFileSync("data/catalog/pricing.json", `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Wrote data/catalog/pricing.json: ${Object.keys(out).length} tools.`);
} else {
  console.log("usage: npm run catalog:pricing -- fetch <outDir> | check");
}
