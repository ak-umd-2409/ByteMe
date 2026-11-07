import { llmJson, type LlmProvider } from "../llm/client.ts";
import { v } from "../shared/validate.ts";
import type { ReviewAnalysis, ReviewTheme, ReviewThemeKey, SourceReview, ThemeEvidence } from "./types.ts";

/**
 * Review analysis: deterministic keyword rules first, optional LLM second.
 *
 * Evidence guarantee: every theme cites an exact quote from a real review.
 * LLM-proposed quotes that are not literally present in the review are dropped.
 */

interface ThemeRule {
  key: ReviewThemeKey;
  label: string;
  polarity: "complaint" | "praise";
  pattern: RegExp;
}

export const THEME_RULES: ThemeRule[] = [
  {
    key: "missed_calls",
    label: "Calls not answered",
    polarity: "complaint",
    pattern:
      /\b(straight to voicemail|(went|goes|go|got|get) (to )?voicemail|no ?one (picked|picks|ever picks) up|no ?one answer(s|ed)?|nobody (picked|picks|ever picks) up|nobody answer(s|ed)?|didn'?t (pick up|answer)|doesn'?t (pick up|answer)|never answer(s|ed)?|never picks? up|couldn'?t get through|can'?t get through|phone (is |was )?always busy|called (\w+ )?(three|3|four|4|several|multiple|many) times)/i,
  },
  {
    key: "no_callback",
    label: "No call back",
    polarity: "complaint",
    pattern:
      /\b(never (called|got a call|heard) back|never heard back|didn'?t (call|get) back|didn'?t hear back|no call ?back|nobody called( me)? back|no one called( me)? back|never returned (my|our) call)/i,
  },
  {
    key: "slow_response",
    label: "Slow replies to messages",
    polarity: "complaint",
    pattern:
      /\b((nobody|no one) (responded|replied)|didn'?t (respond|reply)|never (responded|replied)|slow to (respond|reply)|(took|waited) (\w+ )?(days|weeks) (to|for) (a )?(reply|response|answer))/i,
  },
  {
    key: "hard_to_book",
    label: "Hard to book",
    polarity: "complaint",
    pattern:
      /\b(hard to (book|schedule|get an appointment)|difficult to (book|schedule)|wish (they|you) had online booking|no online booking|can'?t book online|couldn'?t (book|schedule)|no way to book)/i,
  },
  {
    key: "scheduling_delays",
    label: "Long waits for an appointment",
    polarity: "complaint",
    pattern:
      /\b(earliest (appointment|availability)|booked (out|solid) for|waited \d+ minutes|past (my|our) appointment|kept (us|me) waiting|took (over )?(a|one|two|\d+) weeks? to (get an appointment|schedule|be seen))/i,
  },
  {
    key: "late_or_no_show",
    label: "Late or no-show",
    polarity: "complaint",
    pattern: /\b(no[- ]show|never showed( up)?|didn'?t show up|showed up (\w+ )?(late|hours late)|arrived (\w+ )?late)/i,
  },
  {
    key: "quote_delays",
    label: "Slow quotes or estimates",
    polarity: "complaint",
    pattern:
      /\b(took (over |almost |nearly )?(a|one|two|three|\d+) (days?|weeks?) to (get|receive|send) (the |a |my )?(written )?(estimate|quote)|waiting (on|for) (a|the|my) (quote|estimate)|never (got|received) (a|the|my) (quote|estimate)|(quote|estimate) took (forever|days|weeks))/i,
  },
  {
    key: "pricing_unclear",
    label: "Unclear pricing",
    polarity: "complaint",
    pattern: /\b(hidden fees?|surprise (charge|fee|bill)|price (kept|was) chang|didn'?t (give|tell) (us |me )?(a |the )?price)/i,
  },
  {
    key: "price_concerns",
    label: "Price concerns",
    polarity: "complaint",
    pattern: /\b(overcharg\w*|too expensive|price gouging|charged (us|me) \$\d+|rates? (were|was) (extremely |way too |too )?high|\$\d+ to replace a \$\d+)/i,
  },
  {
    key: "billing_problems",
    label: "Billing mistakes",
    polarity: "complaint",
    pattern: /\b(billing (error|mistake|issue|problem)|double[- ]charged|charged (me )?twice|wrong (invoice|bill)|invoice was wrong)/i,
  },
  {
    key: "poor_communication",
    label: "Poor follow-up",
    polarity: "complaint",
    pattern: /\b(poor communication|no updates?|kept (us|me) in the dark|had to (call|follow up|email) (again|back)|didn'?t (explain|keep (us|me) (posted|informed)))/i,
  },
  {
    key: "rude_service",
    label: "Rude service",
    polarity: "complaint",
    pattern: /\b(rude|unprofessional|disrespectful|bad attitude)\b/i,
  },
  {
    key: "praise_quality",
    label: "Quality work",
    polarity: "praise",
    pattern:
      /\b((excellent|great|amazing|outstanding|fantastic) (work|job|repair|service|produce|cut|color|coffee|food)|did (an? )?(excellent|great|amazing) (work|job)|best [a-z]+ in|knowledgeable)/i,
  },
  {
    key: "praise_friendly",
    label: "Friendly staff",
    polarity: "praise",
    pattern: /\b(friendly|friendliest|welcoming|courteous|polite|kind)\b/i,
  },
  {
    key: "praise_responsive",
    label: "Quick to respond",
    polarity: "praise",
    pattern: /\b(responded (right away|quickly|within)|called (me |us )?back (right away|quickly|within)|same[- ]day|on time|prompt|quick to respond)\b/i,
  },
  {
    key: "praise_value",
    label: "Fair prices",
    polarity: "praise",
    pattern: /\b(fair price|reasonabl[ey] priced|price was reasonable|great value|good value|affordable|honest)\b/i,
  },
];

const RULE_BY_KEY = new Map(THEME_RULES.map((rule) => [rule.key, rule]));

/** Split owner-pasted text into individual reviews. */
export function splitPastedReviews(text: string, limit = 30): SourceReview[] {
  const blocks = text
    .replace(/\r/g, "")
    .split(/\n\s*\n|\n(?=\s*(?:[-•*]|\d+[.)])\s)/)
    .map((block) => block.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, "").replace(/\s+/g, " ").trim())
    .filter((block) => block.length >= 15);
  return blocks.slice(0, limit).map((block, index) => {
    const stars = block.match(/^(★{1,5})/);
    const outOf = block.match(/\b([1-5])\s*(?:\/\s*5|stars?|out of 5)\b/i);
    const rating = stars ? stars[1].length : outOf ? Number(outOf[1]) : null;
    return {
      id: `pasted-${index + 1}`,
      source: "owner_pasted" as const,
      rating,
      text: block.slice(0, 2_000),
      author: null,
      authorUrl: null,
      publishedAt: null,
      relativeTime: null,
    };
  });
}

/** The sentence around a match, copied verbatim (at most ~240 characters). */
export function quoteAround(text: string, index: number, length: number): string {
  const starts = [...text.slice(0, index).matchAll(/[.!?]\s+/g)];
  const start = starts.length ? starts[starts.length - 1].index! + starts[starts.length - 1][0].length : 0;
  const endMatch = /[.!?](\s|$)/.exec(text.slice(index + length));
  const end = endMatch ? index + length + endMatch.index + 1 : text.length;
  let quote = text.slice(start, end).trim();
  if (quote.length > 240) {
    const from = Math.max(0, index - 100);
    quote = text.slice(from, Math.min(text.length, index + length + 100)).trim();
  }
  return quote;
}

const normalizeForMatch = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

/** True only if `quote` appears verbatim (ignoring case and whitespace) in `text`. */
export function isVerbatim(quote: string, text: string): boolean {
  const q = normalizeForMatch(quote);
  return q.length >= 8 && normalizeForMatch(text).includes(q);
}

type Hit = { review: SourceReview; key: ReviewThemeKey; quote: string | null; by: "rules" | "llm" | "extracted" };

function ruleHits(reviews: SourceReview[]): Hit[] {
  const hits: Hit[] = [];
  for (const review of reviews) {
    for (const rule of THEME_RULES) {
      if (rule.polarity === "praise" && review.rating !== null && review.rating < 4) continue;
      const match = rule.pattern.exec(review.text);
      if (match) hits.push({ review, key: rule.key, quote: quoteAround(review.text, match.index, match[0].length), by: "rules" });
    }
  }
  return hits;
}

const themeKeys = THEME_RULES.map((rule) => rule.key) as [ReviewThemeKey, ...ReviewThemeKey[]];
const llmSchema = v.object({
  findings: v.array(
    v.object({
      reviewId: v.string({ max: 200 }),
      theme: v.oneOf(themeKeys),
      quote: v.string({ min: 8, max: 300 }),
    }),
    { max: 120 },
  ),
});

async function llmHits(reviews: SourceReview[], provider: LlmProvider): Promise<Hit[] | null> {
  if (reviews.length === 0) return [];
  const sample = reviews.slice(0, 25);
  const result = await llmJson(provider, llmSchema, {
    task: "review_themes",
    system:
      "You classify small-business customer reviews into fixed themes. Reply with JSON only: " +
      '{"findings":[{"reviewId":"...","theme":"...","quote":"..."}]}. ' +
      `Allowed themes: ${themeKeys.join(", ")}. ` +
      "The quote MUST be copied exactly from that review's text. Do not paraphrase, summarize, or invent. " +
      "Only include a finding when the review clearly supports it.",
    user: JSON.stringify(sample.map((r) => ({ reviewId: r.id, rating: r.rating, text: r.text.slice(0, 600) }))),
  });
  if (!result.ok) return null;
  const byId = new Map(sample.map((r) => [r.id, r]));
  const hits: Hit[] = [];
  for (const finding of result.value.findings) {
    const review = byId.get(finding.reviewId);
    if (!review || !isVerbatim(finding.quote, review.text)) continue; // never accept invented evidence
    const rule = RULE_BY_KEY.get(finding.theme);
    if (rule?.polarity === "praise" && review.rating !== null && review.rating < 4) continue;
    hits.push({ review, key: finding.theme, quote: finding.quote.trim(), by: "llm" });
  }
  return hits;
}

const PLATFORM_LABEL: Record<SourceReview["source"], string> = {
  google: "Google",
  owner_pasted: "Pasted by you",
  mock: "Sample",
  public_listing: "Public review page",
};

/**
 * Themes recorded when a review was read from a public page. The exact excerpt is used as the
 * quote only when it literally supports the theme (same rule as everything else); otherwise the
 * evidence is the labelled summary plus the link to the review.
 */
function extractedHits(reviews: SourceReview[]): Hit[] {
  const hits: Hit[] = [];
  for (const review of reviews) {
    for (const key of review.themes ?? []) {
      const rule = RULE_BY_KEY.get(key);
      if (!rule) continue;
      if (rule.polarity === "praise" && review.rating !== null && review.rating < 4) continue;
      const match = review.text ? rule.pattern.exec(review.text) : null;
      hits.push({ review, key, quote: match ? quoteAround(review.text, match.index, match[0].length) : null, by: "extracted" });
    }
  }
  return hits;
}

/** "4 years ago" style ages sort by number of units; ISO dates sort by date. */
function newestReview(reviews: SourceReview[]): string | null {
  const UNIT: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };
  let best: { days: number; label: string } | null = null;
  for (const r of reviews) {
    const label = r.relativeTime ?? null;
    const m = label?.match(/(\d+|a|an)\s+(day|week|month|year)s?\s+ago/i);
    const days = m ? (/^\d+$/.test(m[1]) ? Number(m[1]) : 1) * UNIT[m[2].toLowerCase()] : r.publishedAt ? (Date.now() - Date.parse(r.publishedAt)) / 86_400_000 : null;
    if (days === null || Number.isNaN(days)) continue;
    if (!best || days < best.days) best = { days, label: label ?? new Date(r.publishedAt!).toLocaleDateString("en-US", { month: "short", year: "numeric" }) };
  }
  return best?.label ?? null;
}

function buildThemes(hits: Hit[]): ReviewTheme[] {
  const themes = new Map<ReviewThemeKey, ReviewTheme>();
  for (const hit of hits) {
    const rule = RULE_BY_KEY.get(hit.key)!;
    const theme =
      themes.get(hit.key) ??
      ({ key: hit.key, label: rule.label, polarity: rule.polarity, mentions: 0, evidence: [], detectedBy: [] } as ReviewTheme);
    if (!theme.detectedBy.includes(hit.by)) theme.detectedBy.push(hit.by);
    if (!theme.evidence.some((e) => e.reviewId === hit.review.id)) {
      const evidence: ThemeEvidence = {
        reviewId: hit.review.id,
        quote: hit.quote,
        summary: hit.quote ? null : (hit.review.summary ?? null),
        url: hit.review.url ?? null,
        platform: hit.review.platform ?? null,
        relativeTime: hit.review.relativeTime,
        source: hit.review.source,
        rating: hit.review.rating,
        author: hit.review.author,
      };
      theme.evidence.push(evidence);
      theme.mentions += 1;
    }
    themes.set(hit.key, theme);
  }
  return [...themes.values()].sort((a, b) => b.mentions - a.mentions || a.key.localeCompare(b.key));
}

export async function analyzeReviews(
  reviews: SourceReview[],
  opts: { llm?: LlmProvider } = {},
): Promise<ReviewAnalysis> {
  const usable = reviews.filter((r) => r.text.trim().length > 0 || (r.summary ?? "").trim().length > 0);
  const withText = usable.filter((r) => r.text.trim().length > 0);
  const hits = ruleHits(withText);
  const fromLlm = opts.llm ? await llmHits(withText, opts.llm) : null;
  if (fromLlm) hits.push(...fromLlm);
  hits.push(...extractedHits(usable));
  const themes = buildThemes(hits);
  const rated = usable.filter((r) => r.rating !== null);
  const bySource = { google: 0, owner_pasted: 0, mock: 0, public_listing: 0 };
  for (const review of usable) bySource[review.source] += 1;
  const platformCounts = new Map<string, number>();
  for (const review of usable) {
    const name = review.platform ?? PLATFORM_LABEL[review.source];
    platformCounts.set(name, (platformCounts.get(name) ?? 0) + 1);
  }
  const platforms = [...platformCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const newest = newestReview(usable);

  const limitations: string[] = [];
  if (usable.length === 0) limitations.push("No reviews were available to analyze.");
  if (bySource.google > 0)
    limitations.push(
      "Google shares at most 5 reviews per business and doesn't include owner replies, so we can't tell which reviews were answered.",
    );
  if (bySource.mock > 0) limitations.push("These are sample reviews for a fictional business (mock mode).");
  if (bySource.public_listing > 0)
    limitations.push("Reviews from public pages are linked to their source. We keep short excerpts or summaries, not full copies.");
  if (!fromLlm && bySource.public_listing === 0) limitations.push("Themes were found with keyword rules only, so some may be missed.");
  if (usable.length > 0 && usable.length < 5) limitations.push("Only a few reviews were available; patterns are tentative.");

  return {
    reviewCount: usable.length,
    averageRating: rated.length ? Math.round((rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length) * 10) / 10 : null,
    bySource,
    platforms,
    newestReview: newest,
    complaints: themes.filter((t) => t.polarity === "complaint").map((t) => ({ ...t, evidence: t.evidence.slice(0, 5) })),
    praise: themes.filter((t) => t.polarity === "praise").map((t) => ({ ...t, evidence: t.evidence.slice(0, 5) })),
    method: fromLlm ? "rules+llm" : "rules",
    limitations,
  };
}
