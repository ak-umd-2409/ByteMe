/**
 * Understand an owner's question with plain rules: what it's about, any budget, the kind of
 * business, and any software they say they use. No AI, so it works with no key and can't be
 * talked into anything.
 */
import type { IndustryKey } from "../business/types.ts";
import type { UseCase } from "../recommend/types.ts";
import type { AdvisorTurn, Understood } from "./types.ts";

const TOPIC_WORDS: [UseCase, RegExp][] = [
  ["missed-calls", /\b(missed calls?|calls?|phones?|receptionist|voicemail|answering service|pick(?:ing)? up)\b/],
  ["booking", /\b(appointments?|schedul(?:e|ing) (?:appointments?|jobs?|visits?)|book(?:ing|ings)?|reservations?|calendar|no[- ]shows?)\b/],
  ["reviews", /\b(reviews?|ratings?|yelp|reputation|stars)\b/],
  ["marketing", /\b(marketing|social media|social posts?|instagram|facebook|tiktok|posts?|ads?|advertis\w*|promot\w*|flyers?)\b/],
  ["customer-messaging", /\b(enquir\w*|inquir\w*|chat(?!gpt)\w*|messages?|texts?|respond(?:ing)? to customers|customer questions?|faqs?|dms?)\b/],
  ["quotes", /\b(quot(?:e|es|ation|ations|ing)|estimates?|proposals?|bids?)\b/],
  ["bookkeeping", /\b(bookkeep\w*|accounting|invoices?|invoicing|expenses?|receipts?|payroll)\b/],
  ["inventory", /\b(inventory|stock|reorder\w*)\b/],
  ["staff-scheduling", /\b(shifts?|staff schedul\w*|rota|employee schedul\w*|rostering)\b/],
  ["website-seo", /\b(seo|website|google search|found online|show up (?:on|in) google|search results)\b/],
  ["email-marketing", /\b(emails? (?:list|marketing|campaigns?)|newsletters?|mailing list)\b/],
  ["admin-paperwork", /\b(paperwork|admin\w*|documents?|forms?|notes|writing emails?|job (?:posts?|descriptions?))\b/],
];

const INDUSTRY_WORDS: [IndustryKey, RegExp][] = [
  ["hvac", /\b(hvac|heating|air[- ]condition\w*|furnace|heat pumps?)\b/],
  ["plumbing", /\bplumb\w*/],
  ["electrical", /\belectric(?:al|ian)s?\b/],
  ["landscaping", /\b(landscap\w*|lawn\w*|gardening)\b/],
  ["cleaning", /\b(cleaning|cleaners?|janitorial|maid)\b/],
  ["auto_repair", /\b(auto repair|mechanic\w*|car repair|body shop|garage)\b/],
  ["restaurant", /\b(restaurants?|pizza\w*|diner|food truck|bar and grill|takeout|catering)\b/],
  ["cafe", /\b(caf[eé]s?|coffee shop|bakery|bakeries)\b/],
  ["salon", /\b(salons?|barber\w*|hair|nails?|spas?|beauty)\b/],
  ["retail", /\b(retail|boutiques?|gift shop|stores?|shops?)\b/],
  ["fitness", /\b(gyms?|fitness|yoga|pilates|personal train\w*)\b/],
  ["health_clinic", /\b(dental|dentist|clinic|chiropract\w*|therap\w*|physio\w*|medical)\b/],
  ["professional_services", /\b(accountants?|accounting firm|law firm|lawyers?|consult\w*|agency|bookkeeper)\b/],
  ["farm", /\b(farms?|orchard|nursery)\b/],
];

/** Software owners often name. Matching only; we don't claim anything about them. */
const KNOWN_SOFTWARE = [
  "Square", "QuickBooks", "QuickBooks Online", "Xero", "Shopify", "Wix", "Squarespace", "WordPress", "Google Calendar",
  "Google Workspace", "Gmail", "Outlook", "Microsoft 365", "Calendly", "Mailchimp", "HubSpot", "Salesforce", "Jobber",
  "Housecall Pro", "ServiceTitan", "Workiz", "Toast", "Clover", "OpenTable", "Resy", "Vagaro", "Fresha", "Mindbody",
  "Acuity Scheduling", "Zapier", "Slack", "Zoom", "Facebook", "Instagram", "Yelp", "Stripe", "PayPal", "Zendesk",
];

const lower = (s: string) => s.toLowerCase();

function topicsIn(text: string): UseCase[] {
  const found: [number, UseCase][] = [];
  for (const [topic, re] of TOPIC_WORDS) {
    const m = re.exec(text);
    if (m) found.push([m.index, topic]);
  }
  // "email" alone means email marketing only when nothing more specific matched.
  if (!found.length && /\bemails?\b/.test(text)) found.push([text.search(/\bemails?\b/), "email-marketing"]);
  return found.sort((a, b) => a[0] - b[0]).map(([, t]) => t);
}

export function industryIn(text: string): IndustryKey | null {
  const t = lower(text);
  for (const [key, re] of INDUSTRY_WORDS) if (re.test(t)) return key;
  return null;
}

/** "$100", "100 dollars", "100 a month", "$1,200/mo". The first amount wins. */
export function budgetIn(text: string): number | null {
  const m = /\$\s?(\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?|(\d{1,3}(?:,\d{3})*|\d+)\s?(?:dollars|bucks|usd|\/\s?mo\b|a month|per month|monthly)/i.exec(text);
  if (!m) return null;
  const n = Number((m[1] ?? m[2])!.replace(/,/g, ""));
  return Number.isFinite(n) && n <= 100_000 ? n : null;
}

function softwareIn(text: string, extra: string[]): string[] {
  const t = lower(text);
  const names = [...new Set([...KNOWN_SOFTWARE, ...extra])].sort((a, b) => b.length - a.length);
  const out: string[] = [];
  for (const name of names) {
    const re = new RegExp(`\\b${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    if (re.test(t) && !out.some((o) => lower(o).includes(lower(name)))) out.push(name);
  }
  return out;
}

const BUSINESS_WORDS = /\b(ai|a\.i\.|business|customers?|clients?|shop|store|sales|tools?|software|apps?|automat\w*|budget|cost|price|money|time|staff|owner|start|help|marketing)\b/;

/**
 * @param knownProducts product names from the catalog's "works with" lists, so "Do you work
 *   with ServiceNow?" is recognised even though it isn't in KNOWN_SOFTWARE.
 */
export function understand(message: string, history: AdvisorTurn[] = [], knownProducts: string[] = []): Understood {
  const text = lower(message).replace(/[’']/g, "'");
  let topics = topicsIn(text);
  const budget = budgetIn(message);
  const industry = industryIn(message);
  const toolsNamed = softwareIn(message, knownProducts);

  let kind: Understood["kind"];
  if (/^(hi|hello|hey|good (morning|afternoon|evening))\b[\s!.,]*$/.test(text.trim())) kind = "greeting";
  else if (/(don't|do not|dont) (really )?(understand|get|know (much|anything) about) (ai|a\.i\.)|what (is|exactly is) ai\b|explain|new to ai|where (do|should) i (even )?start|what should i start with|how do i (even )?(start|begin)/.test(text))
    kind = "explain";
  else if (/(do i|should i|does my business) (even |really )?need ai|is ai (even )?worth|(ai|it) (isn't|is not|not) (needed|necessary|worth)|when (is|should i not|not to use) ai/.test(text))
    kind = "when-not";
  else if (/(software|tools?|apps?|systems?) (that )?i (already )?(have|use|pay for)|already (have|use|pay for)|works? with (my|the)|my (current|existing)|(with|in) (my|the) (pos|point of sale|software|crm)/.test(text) || (toolsNamed.length > 0 && /\b(use|have|with)\b/.test(text)))
    kind = "existing";
  else if (budget !== null) kind = "budget";
  else if (topics.length) kind = "topic";
  else if (BUSINESS_WORDS.test(text) || industry) kind = "general";
  else kind = "off-topic";

  // Follow-ups like "how much would that cost?" keep the topic of the last question.
  if (!topics.length && (kind === "budget" || kind === "general" || kind === "existing")) {
    const lastOwner = [...history].reverse().find((t) => t.role === "owner");
    if (lastOwner) topics = topicsIn(lower(lastOwner.text));
  }
  return { kind, topics: [...new Set(topics)].slice(0, 3), budget, industry, toolsNamed };
}
