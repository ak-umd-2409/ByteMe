/**
 * Turns what the owner told us ("What's taking up too much of your time?") into structured
 * challenges, and links each one to customer reviews that say the same thing.
 *
 * AI reads the owner's words (OpenRouter, JSON validated against a schema, cached). Rules check
 * everything it returns: the owner's quote must be words they actually typed, review quotes must
 * be copied exactly from that review, problem types and tool categories must be known ones.
 * Anything that fails is dropped. Text the AI didn't cover (or everything, when AI is off) falls
 * back to keyword rules, and otherwise stays a challenge in the owner's own words. We never add
 * detail the owner didn't give.
 */
import { GUIDES } from "../advisor/knowledge.ts";
import { isVerbatim } from "../business/reviews.ts";
import { industryInfo } from "../business/industry.ts";
import type { IndustryKey } from "../business/types.ts";
import { llmJson, type LlmProvider } from "../llm/client.ts";
import { PROBLEMS } from "../problems/catalog.ts";
import { PROBLEM_KEYS, type ProblemKey } from "../problems/types.ts";
import { USE_CASES, type UseCase } from "../recommend/types.ts";
import { log } from "../shared/logger.ts";
import { v } from "../shared/validate.ts";
import type { ChallengeSuggestion } from "./match.ts";

export interface ReviewText {
  id: string;
  rating: number | null;
  text: string;
  /** "Google", "Google (via SerpApi)", "Pasted by you"… */
  where: string;
  author: string | null;
  url: string | null;
}

export interface OwnerChallenge {
  id: string;
  /** The owner's exact words, or the suggestion they picked. */
  words: string;
  from: "typed" | "picked";
  title: string;
  whatsHappening: string;
  whyItMatters: string | null;
  problem: ProblemKey | null;
  useCase: UseCase | null;
  ai: { level: "yes" | "partly" | "no"; how: string } | null;
  firstStep: string | null;
  /** Reviews that say the same thing, each quote copied exactly from the review. */
  reviews: { reviewId: string; quote: string }[];
  by: "ai" | "rules" | "suggestion";
}

export const MAX_CHALLENGE_CHARS = 1500;
const MAX_CHALLENGES = 8;

/** Keyword rules for when AI is off: the taxonomy first, then tool categories outside it. */
const RULES: { pattern: RegExp; problem?: ProblemKey; useCase?: UseCase }[] = [
  { pattern: /\b(miss(ed|ing)? calls?|phones?|voicemail|calls? (go|going) unanswered|can'?t answer|answer(ing)? (the )?calls?)\b/i, problem: "missed_inquiries", useCase: "missed-calls" },
  { pattern: /\b(quotes?|estimates?|bids?|proposals?)\b/i, problem: "slow_quotes", useCase: "quotes" },
  { pattern: /\b(no[- ]?shows?|cancell?ations?|reschedul\w*|schedul\w* (appointments?|jobs?)|appointments?|bookings?|dispatch\w*|reservations?)\b/i, problem: "scheduling_inefficiency", useCase: "booking" },
  { pattern: /\b(staff|employee|shift|crew)s?\b.*\b(schedul\w*|cover\w*|shifts?)\b|\bshifts?\b/i, useCase: "staff-scheduling" },
  { pattern: /\b(invoic\w*|bookkeep\w*|receipts?|accounting|quickbooks|payroll|billing|payments?|taxes)\b/i, problem: "repetitive_admin", useCase: "bookkeeping" },
  { pattern: /\b(paperwork|forms?|data entry|admin|documents?)\b/i, problem: "repetitive_admin", useCase: "admin-paperwork" },
  { pattern: /\breviews?\b/i, problem: "poor_review_management", useCase: "reviews" },
  { pattern: /\b(social media|instagram|facebook|tiktok|posts?|posting|content)\b/i, useCase: "marketing" },
  { pattern: /\b(newsletters?|email (list|marketing|campaigns?))\b/i, useCase: "email-marketing" },
  { pattern: /\b(follow[- ]?ups?|following up|repeat customers?|remind\w*|past customers?|come back)\b/i, problem: "no_customer_follow_up", useCase: "marketing" },
  { pattern: /\b(inventory|stock|supplies|reorder\w*)\b/i, useCase: "inventory" },
  { pattern: /\b(website|seo|google search|found online|show up on google)\b/i, useCase: "website-seo" },
  { pattern: /\b(emails?|messages?|texts?|dms?|inquir\w*|enquir\w*|repl(y|ies|ying)|respond\w*|inbox)\b/i, problem: "slow_responses", useCase: "customer-messaging" },
];

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const sentence = (s: string) => {
  const t = s.trim().replace(/^[-*•\d.)\s]+/, "").replace(/\s+/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** One challenge per line, bullet or semicolon; a paragraph is split into sentences. */
export function splitChallenges(text: string): string[] {
  const parts = text
    .split(/\n+|;|•/)
    .flatMap((p) => (p.length > 120 ? p.split(/(?<=[.!?])\s+/) : [p]))
    .map((p) => p.trim().replace(/^[-*\d.)\s]+/, "").replace(/[.!?]+$/, "").trim())
    .filter((p) => p.length >= 4);
  return [...new Set(parts)].slice(0, MAX_CHALLENGES);
}

function guideAi(useCase: UseCase | null, problem: ProblemKey | null): OwnerChallenge["ai"] {
  if (problem === "inconsistent_business_info") return { level: "no", how: "Fixing your listings by hand is free and takes about an hour." };
  if (!useCase) return null;
  return { level: "yes", how: GUIDES[useCase].whatAiDoes };
}

/** A short card title from the owner's sentence: the part before "because", "so", a comma or a dash. */
export function shortTitle(item: string): string {
  const s = sentence(item).replace(/^(we|i)('re| are| am)? (are )?(struggling|having trouble) (with|to) /i, "");
  const head = s.split(/\s+(?:because|since|so that|so|which|but)\s+|[,;:–—]\s*|\s-\s/i)[0] ?? s;
  const t = head.length >= 12 ? head : s;
  if (t.length <= 60) return t.charAt(0).toUpperCase() + t.slice(1);
  const cut = t.slice(0, 60);
  return `${cut.slice(0, cut.lastIndexOf(" ")).trimEnd()}…`;
}

function byRules(item: string, id: string, from: OwnerChallenge["from"] = "typed"): OwnerChallenge {
  const hit = RULES.find((r) => r.pattern.test(item));
  const problem = hit?.problem ?? null;
  const useCase = hit?.useCase ?? null;
  return {
    id,
    words: item,
    from,
    title: shortTitle(item),
    whatsHappening: `In your words: “${clip(item, 200)}”`,
    whyItMatters: problem ? PROBLEMS[problem].whyItMatters : null,
    problem,
    useCase,
    ai: guideAi(useCase, problem),
    firstStep: problem ? PROBLEMS[problem].nextStep : useCase ? GUIDES[useCase].freeFirst.title : null,
    reviews: [],
    by: "rules",
  };
}

function fromSuggestion(s: ChallengeSuggestion, id: string): OwnerChallenge {
  const problem = s.problem ?? null;
  const useCase = s.useCase ?? null;
  return {
    id,
    words: s.text,
    from: "picked",
    title: s.text,
    // Only say what's happening when we know; never restate the suggestion.
    whatsHappening: problem ? PROBLEMS[problem].explanation : "",
    whyItMatters: problem ? PROBLEMS[problem].whyItMatters : null,
    problem,
    useCase,
    ai: guideAi(useCase, problem),
    firstStep: problem ? PROBLEMS[problem].nextStep : useCase ? GUIDES[useCase].freeFirst.title : null,
    reviews: [],
    by: "suggestion",
  };
}

const problemKeys = PROBLEM_KEYS as unknown as [ProblemKey, ...ProblemKey[]];
const useCases = USE_CASES as unknown as [UseCase, ...UseCase[]];
// Lenient on purpose: one long sentence or an unknown label must not throw away the whole answer.
// Every value is checked and clipped below; anything unknown becomes null.
const text = (max: number) => v.string({ max });
const llmSchema = v.object(
  {
    challenges: v.array(
      v.object(
        {
          quote: text(2000),
          title: text(500),
          whatsHappening: text(2000),
          whyItMatters: v.optional(v.nullable(text(1000))),
          problemKey: v.optional(v.nullable(text(100))),
          useCase: v.optional(v.nullable(text(100))),
          aiCanHelp: v.optional(v.nullable(text(40))),
          aiHow: v.optional(v.nullable(text(1000))),
          firstStep: v.optional(v.nullable(text(500))),
          reviews: v.optional(v.array(v.object({ reviewId: text(300), quote: text(1000) }, { allowUnknown: true }), { max: 20 })),
        },
        { allowUnknown: true },
      ),
      { max: 12 },
    ),
  },
  { allowUnknown: true },
);
const asProblem = (x: string | null | undefined): ProblemKey | null => ((problemKeys as string[]).includes(x ?? "") ? (x as ProblemKey) : null);
const asUseCase = (x: string | null | undefined): UseCase | null => ((useCases as string[]).includes(x ?? "") ? (x as UseCase) : null);
const asLevel = (x: string | null | undefined): "yes" | "partly" | "no" => (x === "yes" || x === "no" || x === "partly" ? x : "partly");
const words = (s: string | null | undefined, max: number) => {
  const t = (s ?? "").trim();
  if (!t) return null;
  if (t.length <= max) return t;
  // Cut at a sentence or word boundary.
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > max * 0.5 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(" ")).trimEnd()}…`;
};

async function byAi(items: string[], text: string, ctx: { industry: string; business: string; reviews: ReviewText[] }, llm: LlmProvider): Promise<OwnerChallenge[] | null> {
  const result = await llmJson(llm, llmSchema, {
    task: "owner_challenges",
    system:
      "You are a small-business advisor. The owner described what takes up their time. Turn it into separate challenges " +
      "(one per distinct issue, at most 6). For each: quote = the owner's own words for it, copied EXACTLY from their text; " +
      "title = a plain 3-8 word name; whatsHappening = one or two plain sentences about what is going on, using only what the " +
      "owner said (never invent numbers, names or facts); whyItMatters = one short sentence, or null; problemKey = the closest " +
      `of [${PROBLEM_KEYS.map((k) => `${k} (${PROBLEMS[k].title})`).join("; ")}] or null if none truly fits; ` +
      `useCase = the closest tool category of [${USE_CASES.join(", ")}] or null; aiCanHelp = yes, partly or no, honestly ` +
      "(some problems need a person or a free manual fix, not AI); aiHow = one plain sentence on how AI could help, or why it " +
      "can't; firstStep = one small free thing to do this week, or null. reviews = customer reviews from the list that clearly " +
      "describe the SAME issue, each with a quote copied EXACTLY from that review's text; leave empty when none clearly do. " +
      "Write for an owner who is not technical. Reply with JSON only: {\"challenges\":[...]}",
    user: JSON.stringify({
      business: ctx.business,
      industry: ctx.industry,
      ownerText: text,
      reviews: ctx.reviews.slice(0, 20).map((r) => ({ reviewId: r.id, rating: r.rating, text: r.text.slice(0, 500) })),
    }),
  });
  if (!result.ok) {
    log.warn("challenges.ai_unavailable", { reason: result.reason });
    return null;
  }
  const byId = new Map(ctx.reviews.map((r) => [r.id, r]));
  const out: OwnerChallenge[] = [];
  for (const c of result.value.challenges.slice(0, MAX_CHALLENGES)) {
    let quote = c.quote.trim();
    // The owner must have said it. If the AI rephrased, use the owner's own sentence that it's clearly about.
    let said = quote.length >= 8 ? isVerbatim(quote, text) : items.some((i) => i.toLowerCase().includes(quote.toLowerCase()));
    if (!said) {
      const qw = new Set(norm(quote).split(" ").filter((w) => w.length > 3));
      const best = items
        .map((i) => ({ i, n: norm(i).split(" ").filter((w) => qw.has(w)).length }))
        .sort((a, b) => b.n - a.n)[0];
      if (best && qw.size && best.n / qw.size >= 0.5) {
        quote = best.i;
        said = true;
      }
    }
    const title = words(c.title, 60);
    const happening = words(c.whatsHappening, 260);
    if (!said || !title || !happening) {
      log.info("challenges.ai_item_dropped", { reason: !said ? "quote_not_owner_words" : "missing_text" });
      continue;
    }
    const problem = asProblem(c.problemKey);
    const reviews = (c.reviews ?? []).filter((r) => {
      const review = byId.get(r.reviewId);
      return review && isVerbatim(r.quote, review.text); // never accept invented evidence
    });
    out.push({
      id: `c${out.length + 1}`,
      words: quote,
      from: "typed",
      title,
      whatsHappening: happening,
      whyItMatters: words(c.whyItMatters, 160) ?? (problem ? PROBLEMS[problem].whyItMatters : null),
      problem,
      useCase: asUseCase(c.useCase),
      ai: problem === "inconsistent_business_info" ? guideAi(null, problem) : words(c.aiHow, 220) ? { level: asLevel(c.aiCanHelp), how: words(c.aiHow, 220)! } : guideAi(asUseCase(c.useCase), problem),
      firstStep: words(c.firstStep, 120) ?? (problem ? PROBLEMS[problem].nextStep : null),
      reviews: [...new Map(reviews.map((r) => [r.reviewId, { reviewId: r.reviewId, quote: r.quote.trim() }])).values()],
      by: "ai",
    });
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The owner's challenges: picked suggestions plus whatever they typed. Duplicates (two
 * challenges that are the same problem type, or the same words) are merged, owner's words kept.
 */
export async function interpretChallenges(input: {
  text: string | null;
  picks: string[];
  suggestions: ChallengeSuggestion[];
  industry: IndustryKey | string | null;
  business: string;
  reviews: ReviewText[];
  llm?: LlmProvider;
}): Promise<OwnerChallenge[]> {
  const typedText = (input.text ?? "").slice(0, MAX_CHALLENGE_CHARS).trim();
  const pickedS = input.picks.map((id) => input.suggestions.find((s) => s.id === id)).filter((s): s is ChallengeSuggestion => Boolean(s));
  // Picked suggestions are read together with what the owner typed, so they get real explanations too.
  const text = [typedText, ...pickedS.map((s) => s.text)].filter(Boolean).join("\n");
  const items = text ? splitChallenges(text) : [];
  const pickFor = (words: string) => pickedS.find((s) => norm(s.text) === norm(words) || norm(words).includes(norm(s.text)) || norm(s.text).includes(norm(words)));
  let typed: OwnerChallenge[] = [];
  if (items.length) {
    const ai =
      input.llm && input.llm.name !== "disabled"
        ? await byAi(items, text, { industry: industryInfo((input.industry ?? "other") as IndustryKey).label, business: input.business, reviews: input.reviews }, input.llm)
        : null;
    typed = (ai ?? []).map((ch) => {
      const s = pickFor(ch.words);
      if (!s) return ch;
      return { ...ch, from: "picked" as const, problem: ch.problem ?? s.problem ?? null, useCase: ch.useCase ?? s.useCase ?? null };
    });
    // Anything the AI didn't cover still counts: a picked suggestion as itself, typed text by the rules.
    for (const item of items) {
      const covered = typed.some((c) => norm(item).includes(norm(c.words)) || norm(c.words).includes(norm(item)));
      if (covered) continue;
      const s = pickFor(item);
      typed.push(s ? fromSuggestion(s, `c${typed.length + 1}`) : byRules(item, `c${typed.length + 1}`));
    }
  }
  const picked: OwnerChallenge[] = [];

  // Merge: the owner's typed words win over a picked suggestion of the same problem type.
  const out: OwnerChallenge[] = [];
  for (const c of [...typed, ...picked]) {
    const same = out.find((o) => (c.problem && o.problem === c.problem) || norm(o.words) === norm(c.words));
    if (!same) {
      out.push(c);
      continue;
    }
    if (!norm(same.words).includes(norm(c.words))) same.words = `${same.words} · ${c.words}`;
    for (const r of c.reviews) if (!same.reviews.some((x) => x.reviewId === r.reviewId)) same.reviews.push(r);
  }
  return out.slice(0, MAX_CHALLENGES);
}
