/**
 * Problems customers describe in reviews, beyond the fixed review themes: recurring issues
 * (or a single clear one in a low-rated review), each backed by exact quotes.
 *
 * AI groups the reviews (OpenRouter, cached); rules keep only issues whose quotes are copied
 * exactly from the reviews they cite. No quote, no issue.
 */
import { isVerbatim } from "../business/reviews.ts";
import { llmJson, type LlmProvider } from "../llm/client.ts";
import { USE_CASES, type UseCase } from "../recommend/types.ts";
import { log } from "../shared/logger.ts";
import { v } from "../shared/validate.ts";
import type { ReviewText } from "./interpret.ts";

export interface ReviewIssue {
  id: string;
  title: string;
  whatsHappening: string;
  useCase: UseCase | null;
  ai: { level: "yes" | "partly" | "no"; how: string } | null;
  firstStep: string | null;
  /** Exact quotes, one per review. */
  reviews: { reviewId: string; quote: string }[];
}

const MAX_ISSUES = 4;
const s = (max: number) => v.string({ max });
const schema = v.object(
  {
    issues: v.array(
      v.object(
        {
          title: s(300),
          whatsHappening: s(1000),
          useCase: v.optional(v.nullable(s(100))),
          aiCanHelp: v.optional(v.nullable(s(40))),
          aiHow: v.optional(v.nullable(s(600))),
          firstStep: v.optional(v.nullable(s(400))),
          reviews: v.array(v.object({ reviewId: s(300), quote: s(1000) }, { allowUnknown: true }), { max: 20 }),
        },
        { allowUnknown: true },
      ),
      { max: 12 },
    ),
  },
  { allowUnknown: true },
);
const clip = (t: string | null | undefined, max: number) => {
  const x = (t ?? "").trim();
  if (!x) return null;
  return x.length <= max ? x : `${x.slice(0, x.lastIndexOf(" ", max - 1)).trimEnd()}…`;
};

export async function reviewIssues(reviews: ReviewText[], llm: LlmProvider | undefined, context: { industry: string; business: string }): Promise<ReviewIssue[]> {
  const usable = reviews.filter((r) => r.text.trim().length >= 20).slice(0, 25);
  if (!llm || llm.name === "disabled" || usable.length === 0) return [];
  const result = await llmJson(llm, schema, {
    task: "review_issues",
    system:
      "You read customer reviews of one small business and list the operational problems customers describe: things the " +
      "business could fix (slow service, wrong orders, hard to reach, long waits, unclear prices, rushed staff...). Group " +
      "reviews that describe the same problem. Only include a problem that at least two reviews mention, or that a review " +
      "rated 3 stars or lower clearly describes. Ignore praise. Never invent: each problem lists the reviews that describe it, " +
      "each with a quote copied EXACTLY from that review's text. If there are no such problems, return an empty list. " +
      "title: 3-8 plain words from the owner's point of view (e.g. 'Orders take too long at busy times'). whatsHappening: one " +
      "or two sentences of what customers say, without numbers you can't see. " +
      `useCase: closest of [${USE_CASES.join(", ")}] or null. aiCanHelp: yes, partly or no, honestly. aiHow: one sentence. ` +
      'firstStep: one small free step or null. Reply with JSON only: {"issues":[{"title":"","whatsHappening":"","useCase":null,' +
      '"aiCanHelp":"partly","aiHow":"","firstStep":null,"reviews":[{"reviewId":"","quote":""}]}]}',
    user: JSON.stringify({ ...context, reviews: usable.map((r) => ({ reviewId: r.id, rating: r.rating, text: r.text })) }),
  });
  if (!result.ok) {
    log.info("review_issues.unavailable", { reason: result.reason });
    return [];
  }
  const byId = new Map(usable.map((r) => [r.id, r]));
  const out: ReviewIssue[] = [];
  for (const issue of result.value.issues) {
    const quotes = [...new Map(issue.reviews.filter((r) => byId.has(r.reviewId) && isVerbatim(r.quote, byId.get(r.reviewId)!.text)).map((r) => [r.reviewId, { reviewId: r.reviewId, quote: r.quote.trim() }])).values()];
    const low = quotes.some((q) => (byId.get(q.reviewId)?.rating ?? 5) <= 3);
    if (quotes.length < 2 && !low) continue; // recurring, or clearly described in a low review
    const title = clip(issue.title, 80);
    const happening = clip(issue.whatsHappening, 260);
    if (!title || !happening) continue;
    const useCase = (USE_CASES as readonly string[]).includes(issue.useCase ?? "") ? (issue.useCase as UseCase) : null;
    const level = issue.aiCanHelp === "yes" || issue.aiCanHelp === "no" ? issue.aiCanHelp : "partly";
    const how = clip(issue.aiHow, 220);
    out.push({ id: `ri${out.length + 1}`, title, whatsHappening: happening, useCase, ai: how ? { level, how } : null, firstStep: clip(issue.firstStep, 120), reviews: quotes.slice(0, 5) });
    if (out.length >= MAX_ISSUES) break;
  }
  return out;
}
