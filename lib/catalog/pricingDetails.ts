/**
 * Pricing details beyond the headline price: free trial, free plan, the price when billed
 * monthly vs yearly, setup fee, per-user pricing. Each fact is a quote from the vendor's own
 * pricing page, and code checks it: the quote must be on the page word for word, and the
 * answer must be in the quote. Anything we couldn't find stays "not confirmed".
 *
 * Drafts live in data/catalog/pricing/<id>.json. `npm run catalog:pricing -- check` fetches
 * each page again, keeps only the facts that pass, and writes data/catalog/pricing.json,
 * which the app reads. The app never fetches vendor pages itself.
 */
export type PricingField =
  | "freeTrialDays"
  | "freePlan"
  | "monthlyBilled"
  | "annualBilled"
  | "annualDiscountPct"
  | "setupFee"
  | "perUser"
  /** What the plan includes, in the page's words ("100 Billable conversations"). */
  | "limit"
  /** What going over costs, in the page's words ("$1.50 per extra call"). */
  | "overage"
  /** What an extra user costs, in the page's words. */
  | "extraUsers"
  /** Anything else you pay for separately, in the page's words ("SMS credit sold separately"). */
  | "extraCosts";

/** Fields whose answer is the page's own words, so the answer must be inside the quote. */
export const TEXT_FIELDS: PricingField[] = ["limit", "overage", "extraUsers", "extraCosts"];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export interface PricingFact {
  field: PricingField;
  /** Numbers for days, prices and percents; "yes" for freePlan / perUser; the page's own words for text fields. */
  answer: string;
  /** Exact words from the page. */
  quote: string;
  url: string;
}

export interface PricingDraft {
  id: string;
  /** Plan the numbers are for, as the page names it ("Starter"). */
  plan: string;
  facts: PricingFact[];
  foundBy: string;
  foundAt: string;
}

/** What the app reads: only facts that passed the check, with the date they were checked. */
export interface PricingDetails {
  plan: string;
  checkedAt: string;
  facts: PricingFact[];
}

const num = (s: string) => {
  const n = Number(s.trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Every dollar amount in a quote, as numbers. */
function dollars(quote: string): number[] {
  return [...quote.matchAll(/\$\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]!.replace(/,/g, "")));
}

/**
 * Does the quote actually say the answer? Kept strict on purpose: a fact that can't be read
 * straight off the quote is rejected, not guessed.
 */
export function answerInQuote(f: PricingFact): string | null {
  const q = f.quote;
  switch (f.field) {
    case "freeTrialDays": {
      const n = num(f.answer);
      if (n === null) return "answer isn't a number";
      return new RegExp(`\\b${n}\\s*-?\\s*days?\\b`, "i").test(q) && /trial|free/i.test(q) ? null : `quote doesn't say a ${n}-day free trial`;
    }
    case "freePlan":
      if (f.answer === "yes") return (/\bfree\b/i.test(q) && /(plan|forever|always free)/i.test(q)) || /\$\s*0(\.00)?\b/.test(q) ? null : "quote doesn't name a free plan";
      return "only 'yes' can be confirmed from a page";
    case "annualDiscountPct": {
      const n = num(f.answer);
      if (n === null) return "answer isn't a number";
      return new RegExp(`\\b${n}\\s*%`).test(q) && /(year|annual)/i.test(q) ? null : `quote doesn't say ${n}% off yearly`;
    }
    case "limit":
    case "overage":
    case "extraUsers":
    case "extraCosts":
      return f.answer.trim().length >= 4 && norm(q).includes(norm(f.answer)) ? null : "answer isn't the page's own words";
    case "monthlyBilled":
    case "annualBilled": {
      const n = num(f.answer);
      if (n === null) return "answer isn't a number";
      if (!dollars(q).includes(n)) return `$${n} isn't in the quote`;
      const word = f.field === "annualBilled" ? /(annual|yearly|year|billed annually)/i : /(month|monthly)/i;
      return word.test(q) ? null : `quote doesn't say it's ${f.field === "annualBilled" ? "billed yearly" : "billed monthly"}`;
    }
    case "setupFee": {
      const n = num(f.answer);
      if (n === null) return "answer isn't a number";
      if (n === 0) return /no (setup|set-up|onboarding) fees?|(setup|set-up) fee:?\s*\$?0\b|free (setup|set-up|onboarding)/i.test(q) ? null : "quote doesn't say there's no setup fee";
      return dollars(q).includes(n) && /(setup|set-up|onboarding|implementation)/i.test(q) ? null : "quote doesn't give that setup fee";
    }
    case "perUser":
      if (f.answer === "yes") return /(per (user|seat|member|agent|editor)|\/\s*(user|seat|member|agent|editor)|\b(user|seat)\s*\/\s*(mo|month))/i.test(q) ? null : "quote doesn't say per user";
      return "only 'yes' can be confirmed from a page";
  }
}
