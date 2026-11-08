/**
 * The fact check for AI-written advisor text (used by think.ts): no product or company name,
 * dollar amount, percentage or link that isn't in the facts we gave the model.
 */
import type { CatalogRecord } from "../catalog/types.ts";

/** Well-known AI and software names a model might reach for. Mentioning one that isn't in the pack fails the check. */
const WATCHED_NAMES = [
  "ChatGPT", "OpenAI", "GPT", "Gemini", "Bard", "Claude", "Anthropic", "Copilot", "Microsoft", "Google", "Meta AI", "Llama",
  "Perplexity", "Jasper", "Copy.ai", "Writesonic", "Canva", "HubSpot", "Mailchimp", "Constant Contact", "Hootsuite", "Buffer",
  "Podium", "Birdeye", "Yext", "Ruby", "Smith.ai", "Goodcall", "Rosie", "My AI Front Desk", "Housecall Pro", "Jobber",
  "ServiceTitan", "Workiz", "Square", "Toast", "Clover", "QuickBooks", "Xero", "FreshBooks", "Wave", "Calendly", "Acuity",
  "Vagaro", "Fresha", "Mindbody", "Booksy", "Zapier", "Make", "Tidio", "Intercom", "Drift", "Zendesk", "Freshdesk", "Chatbase",
  "Dialpad", "RingCentral", "Grasshopper", "Nextiva", "Notion", "Grammarly", "Semrush", "Ahrefs", "Moz", "Proposify",
  "PandaDoc", "Brevo", "Shopify", "Wix", "Squarespace", "Upfirst", "Slang",
];

/** Brand names that are also ordinary words. Checked only when capitalized mid-sentence. */
const AMBIGUOUS = new Set(["make", "square", "box", "zoom", "slack", "clover", "wave", "ruby", "drift", "buffer", "toast", "stripe", "notion", "aspire", "teams", "google", "meta", "rosie"]);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Does AI-written text stay inside the facts? Returns the reason it fails, or null.
 * `allowed` is the draft plus everything in the pack, as text.
 */
export function outsideFacts(text: string, allowed: string, catalog: CatalogRecord[]): string | null {
  const allowedLower = allowed.toLowerCase();
  if (/https?:\/\/|www\./i.test(text)) return "link";
  const names = [...new Set([...WATCHED_NAMES, ...catalog.flatMap((r) => [r.name, r.vendor.company, ...r.worksWith.map((w) => w.product)])])];
  for (const name of names) {
    if (name.length < 3) continue;
    const re = new RegExp(`(^|[^a-z0-9])${escape(name.toLowerCase())}([^a-z0-9]|$)`);
    if (!re.test(allowedLower)) {
      // Brands that are also everyday words ("make", "square") count only when written as a name.
      const hit = AMBIGUOUS.has(name.toLowerCase())
        ? new RegExp(`(^|[^A-Za-z0-9])${escape(name)}([^A-Za-z0-9]|$)`).test(text.replace(/(^|[.!?]\s+)([A-Z])/g, (_m, a: string, b: string) => a + b.toLowerCase()))
        : re.test(text.toLowerCase());
      if (hit) return `name:${name}`;
    }
  }
  const money = text.match(/\$\s?\d[\d,]*(?:\.\d+)?/g) ?? [];
  for (const m of money) {
    const n = Number(m.replace(/[$,\s]/g, ""));
    const ok = (allowed.match(/\$\s?\d[\d,]*(?:\.\d+)?/g) ?? []).some((a) => Number(a.replace(/[$,\s]/g, "")) === n);
    if (!ok) return `price:${m}`;
  }
  for (const p of text.match(/\d+(?:\.\d+)?\s?%/g) ?? []) if (!allowed.includes(p.replace(/\s/g, ""))) return `percent:${p}`;
  return null;
}
