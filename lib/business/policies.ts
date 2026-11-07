/**
 * Spec 2.6 — read a business's own privacy, refund and terms pages and pull out a few plain facts.
 * Deterministic patterns only: every fact carries the exact sentence it came from, so nothing is
 * paraphrased into a claim the page doesn't make. Absence is reported as "not mentioned", never as "no".
 */
export type PolicyKind = "privacy" | "refund" | "terms";

export interface PolicyFact {
  key: string;
  /** Plain-English statement of what the page says. */
  label: string;
  /** The exact sentence from the page (trimmed to ~240 chars). */
  snippet: string;
  url: string;
}

interface Pattern {
  key: string;
  re: RegExp;
  label: (match: RegExpMatchArray) => string;
}

const PATTERNS: Record<PolicyKind, Pattern[]> = {
  privacy: [
    { key: "no_sale", re: /\b(we|company)\s+(do(es)?\s+not|never|will\s+not|won['’]t)\s+(sell|rent|trade)\b[^.]{0,80}\b(personal|your)\s+(information|data)/i, label: () => "Says it does not sell personal information" },
    { key: "sells", re: /\b(we|company)\s+(may\s+)?(sell|rent)\s+(your\s+)?(personal\s+)?(information|data)\b/i, label: () => "Says it may sell or rent personal information" },
    { key: "shares", re: /\b(share|disclose)s?\b[^.]{0,60}\b(third[- ]part(y|ies)|partners|service providers|vendors)\b/i, label: () => "Shares some information with third parties or service providers" },
    { key: "cookies", re: /\b(cookies?|google analytics|tracking (pixels?|technologies))\b/i, label: () => "Uses cookies or analytics" },
    { key: "deletion", re: /\b(delete|deletion|erase|remove)\b[^.]{0,60}\b(your|personal)\s+(information|data)\b|\b(request|ask)\b[^.]{0,40}\b(delet|eras)/i, label: () => "Explains how to ask for your data to be deleted" },
    { key: "children", re: /\b(children|kids|minors|under (the age of )?1[3-8])\b/i, label: () => "Mentions children's information" },
    { key: "retention", re: /\b(retain|retention|keep)\b[^.]{0,60}\b(information|data|records)\b[^.]{0,40}\b(as long as|for \d+|until)\b/i, label: () => "Says how long information is kept" },
    { key: "updated", re: /\b(last\s+(updated|revised|modified)|effective\s+(date|as of))\b[:\s]*([A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/i, label: (m) => `Last updated ${m[4]}` },
    { key: "contact", re: /\b(contact|email|write to)\b[^.]{0,40}\b(privacy|questions about (this|our) (policy|privacy))\b/i, label: () => "Gives a way to contact them about privacy" },
  ],
  refund: [
    { key: "window", re: /\bwithin\s+(\d{1,3})\s+(days?|hours?)\b/i, label: (m) => `Refund or return window: ${m[1]} ${m[2].toLowerCase()}` },
    { key: "no_refunds", re: /\b(no refunds?|all sales (are )?final|non-?refundable)\b/i, label: () => "Some or all sales are non-refundable" },
    { key: "cancellation_fee", re: /\b(cancell?ation|no[- ]show|late)\s+(fee|charge)\b/i, label: () => "Charges a cancellation, late or no-show fee" },
    { key: "notice", re: /\b(\d{1,3})\s+(hours?|days?)['’]?\s+(notice|in advance|prior)\b/i, label: (m) => `Asks for ${m[1]} ${m[2].toLowerCase()} notice to cancel or change` },
    { key: "warranty", re: /\b(\d{1,3})[- ](day|month|year)s?\b[^.]{0,30}\b(warranty|guarantee|guaranteed)\b|\b(warranty|guarantee)\b[^.]{0,30}\b(\d{1,3})[- ](day|month|year)s?\b/i, label: () => "Mentions a warranty or guarantee period" },
  ],
  terms: [
    { key: "arbitration", re: /\b(binding\s+)?arbitration\b/i, label: () => "Disputes go to arbitration" },
    { key: "liability", re: /\blimitation of liability|\bnot (be )?liable\b|\bliability\b[^.]{0,40}\blimited\b/i, label: () => "Limits the business's liability" },
    { key: "governing_law", re: /\bgoverned by the laws of (the State of )?([A-Z][a-z]+)/i, label: (m) => `Governed by ${m[2]} law` },
  ],
};

/** Split text into sentences, keeping them short enough to quote. */
function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);
}

const trimSnippet = (s: string) => (s.length <= 240 ? s : `${s.slice(0, 237).trimEnd()}…`);

/** Extract facts from one policy page. At most one fact per key; "sells" is dropped if "no_sale" matched. */
export function extractPolicyFacts(kind: PolicyKind, text: string, url: string): PolicyFact[] {
  const facts: PolicyFact[] = [];
  const seen = new Set<string>();
  for (const sentence of sentences(text)) {
    for (const p of PATTERNS[kind]) {
      if (seen.has(p.key)) continue;
      const m = sentence.match(p.re);
      if (!m) continue;
      seen.add(p.key);
      facts.push({ key: p.key, label: p.label(m), snippet: trimSnippet(sentence), url });
    }
  }
  if (seen.has("no_sale")) return facts.filter((f) => f.key !== "sells");
  return facts;
}
