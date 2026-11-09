/**
 * Challenge suggestions shown under "What's taking up too much of your time?".
 *
 * Built for one business from, in this order:
 *  1. what its reviews say (complaint themes, with how many reviews),
 *  2. what we saw on its website and listings (no online booking, details that don't match),
 *  3. challenges specific to its services (AI, optional, validated),
 *  4. everyday challenges for its kind of business (library.ts).
 * Suggestions are prompts the owner can tap or ignore. They are never shown as findings.
 */
import type { IndustryKey, ReviewThemeKey } from "../business/types.ts";
import { industryInfo } from "../business/industry.ts";
import type { JourneyState } from "../journey/context.ts";
import { llmJson, type LlmProvider } from "../llm/client.ts";
import type { DiscoveryResult, ProblemKey } from "../problems/types.ts";
import { USE_CASES, type UseCase } from "../recommend/types.ts";
import { v } from "../shared/validate.ts";
import { libraryFor } from "./library.ts";
import type { ChallengeSuggestion } from "./match.ts";

export type { ChallengeSuggestion } from "./match.ts";

export const MAX_SUGGESTIONS = 12;

const FROM_REVIEWS: Partial<Record<ReviewThemeKey, { text: string; problem?: ProblemKey; useCase?: UseCase; keywords: string[] }>> = {
  missed_calls: { text: "Customers can't always reach us by phone", problem: "missed_inquiries", useCase: "missed-calls", keywords: ["call", "phone", "reach", "voicemail", "answer"] },
  no_callback: { text: "Calling customers back takes too long", problem: "missed_inquiries", useCase: "missed-calls", keywords: ["call back", "callback", "phone", "voicemail"] },
  slow_response: { text: "Replying to customers takes too long", problem: "slow_responses", useCase: "customer-messaging", keywords: ["reply", "respond", "email", "message", "slow"] },
  poor_communication: { text: "Keeping customers updated on their job or order", problem: "slow_responses", useCase: "customer-messaging", keywords: ["update", "communication", "inform", "status", "message"] },
  hard_to_book: { text: "It's hard for customers to book with us", problem: "scheduling_inefficiency", useCase: "booking", keywords: ["book", "appointment", "schedule", "availability"] },
  scheduling_delays: { text: "Customers wait too long for an appointment", problem: "scheduling_inefficiency", useCase: "booking", keywords: ["wait", "appointment", "schedule", "delay"] },
  late_or_no_show: { text: "Running late or missing appointments", problem: "scheduling_inefficiency", useCase: "booking", keywords: ["late", "on time", "no show", "arrive", "appointment"] },
  quote_delays: { text: "Getting quotes out quickly", problem: "slow_quotes", useCase: "quotes", keywords: ["quote", "estimate", "price", "slow"] },
  pricing_unclear: { text: "Customers are unsure about our prices", keywords: ["price", "cost", "pricing", "surprise", "fees"] },
  price_concerns: { text: "Customers feel our prices are high", keywords: ["price", "expensive", "cost", "value"] },
  billing_problems: { text: "Billing mistakes and payment questions", problem: "repetitive_admin", useCase: "bookkeeping", keywords: ["bill", "invoice", "charge", "payment"] },
  rude_service: { text: "Some customers felt the service wasn't friendly", keywords: ["staff", "rude", "service", "attitude", "training"] },
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function fromReviews(state: JourneyState): ChallengeSuggestion[] {
  const r = state.reviews;
  return r.complaints
    .filter((t) => FROM_REVIEWS[t.key])
    .map((t) => {
      const m = FROM_REVIEWS[t.key]!;
      return {
        id: `review-${t.key}`,
        text: m.text,
        why: `${t.mentions} of ${plural(r.reviewCount, "review")} we read mention ${t.label.toLowerCase()}`,
        source: "reviews" as const,
        keywords: m.keywords,
        ...(m.problem ? { problem: m.problem } : {}),
        ...(m.useCase ? { useCase: m.useCase } : {}),
      };
    });
}

function fromReviewIssues(state: JourneyState): ChallengeSuggestion[] {
  return (state.reviewIssues ?? []).map((i) => ({
    id: `issue-${i.id}`,
    text: i.title,
    why: `${plural(i.reviews.length, "review")} we read ${i.reviews.length === 1 ? "describes" : "describe"} this`,
    source: "reviews" as const,
    keywords: i.title.toLowerCase().match(/[a-z]{4,}/g) ?? [],
    ...(i.useCase ? { useCase: i.useCase } : {}),
  }));
}

function fromPublicInfo(state: JourneyState, base: DiscoveryResult): ChallengeSuggestion[] {
  const out: ChallengeSuggestion[] = [];
  const site = state.website;
  const booking = base.problems.find((p) => p.key === "no_online_booking" && p.status !== "hypothesis");
  if (booking && site?.reachable)
    out.push({
      id: "site-booking",
      text: "Customers can only book by calling",
      why: `We read ${plural(site.pagesScanned, "page")} of your website and found no online booking`,
      source: "website",
      keywords: ["book", "online", "appointment", "call", "schedule"],
      problem: "no_online_booking",
      useCase: "booking",
    });
  const issue = state.listings?.issues[0];
  if (issue)
    out.push({
      id: "listings-mismatch",
      text: "Keeping our hours and details the same on every site",
      why: issue.headline,
      source: "listings",
      keywords: ["hours", "listing", "google", "yelp", "address", "phone", "wrong"],
      problem: "inconsistent_business_info",
    });
  return out;
}

const llmSchema = v.object({
  suggestions: v.array(
    v.object({
      text: v.string({ min: 8, max: 90 }),
      keywords: v.array(v.string({ min: 2, max: 30 }), { max: 8 }),
      useCase: v.nullable(v.oneOf(USE_CASES as unknown as [UseCase, ...UseCase[]])),
      basedOn: v.string({ min: 2, max: 80 }),
    }),
    { max: 6 },
  ),
});

/**
 * Up to 5 challenges specific to what this business actually sells, written by the AI from its
 * services, website and review themes. Returns [] when AI is off or the answer doesn't validate.
 */
export async function serviceSuggestions(state: JourneyState, llm: LlmProvider | undefined): Promise<ChallengeSuggestion[]> {
  if (!llm || llm.name === "disabled") return [];
  const b = state.profile.business;
  const services = (state.website?.services ?? []).map((s) => s.value).slice(0, 15);
  const products = (state.website?.products ?? []).map((s) => s.value).slice(0, 10);
  const industry = industryInfo(b.industry.value ?? "other").label;
  if (!services.length && !products.length && !b.category.value) return [];
  const result = await llmJson(llm, llmSchema, {
    task: "challenge_suggestions",
    system:
      "You help a small-business owner name what takes up their time. Given what a business sells, list up to 5 everyday " +
      "operational challenges that are specific to THESE services (not generic advice), written in the owner's voice, " +
      "each under 70 characters, e.g. 'Booking catering orders that come in by text'. They are suggestions the owner can " +
      "pick, not claims about the business, so never state facts about it. Give 2-6 lowercase keywords an owner might type, " +
      `a tool category from [${USE_CASES.join(", ")}] or null, and basedOn: the service it relates to. ` +
      'Reply with JSON only: {"suggestions":[{"text":"...","keywords":["..."],"useCase":null,"basedOn":"..."}]}',
    user: JSON.stringify({ industry, category: b.category.value, services, products, reviewThemes: state.reviews.complaints.map((t) => t.label) }),
  });
  if (!result.ok) return [];
  const known = new Set([...services, ...products].map((s) => s.toLowerCase()));
  return result.value.suggestions.slice(0, 5).map((s, i) => ({
    id: `svc-${i}`,
    text: s.text.trim().replace(/\.$/, ""),
    // Name the service only when it's one we actually read on the website.
    why: known.has(s.basedOn.toLowerCase()) ? `Based on your “${s.basedOn}” service` : `Based on what your business offers`,
    source: "services" as const,
    keywords: s.keywords.map((k) => k.toLowerCase()),
    ...(s.useCase ? { useCase: s.useCase } : {}),
  }));
}

/** The full, ranked list for one business. Evidence first, then services, then everyday ones. */
export function challengeSuggestions(state: JourneyState, base: DiscoveryResult, fromServices: ChallengeSuggestion[] = []): ChallengeSuggestion[] {
  const industry = (state.profile.business.industry.value ?? "other") as IndustryKey;
  const label = industryInfo(industry).label;
  const evidence = [...fromReviewIssues(state), ...fromReviews(state), ...fromPublicInfo(state, base)];
  const everyday: ChallengeSuggestion[] = libraryFor(industry).map((e) => ({
    id: e.id,
    text: e.text,
    why: `Common for ${/^[A-Z]{2,}$/.test(label) ? label : label.toLowerCase()} businesses`,
    source: "industry",
    keywords: e.keywords,
    ...(e.problem ? { problem: e.problem } : {}),
    ...(e.useCase ? { useCase: e.useCase } : {}),
  }));
  const out: ChallengeSuggestion[] = [];
  const seenText = new Set<string>();
  const evidencedProblems = new Set(evidence.map((s) => s.problem).filter(Boolean));
  for (const s of [...evidence, ...fromServices, ...everyday]) {
    const key = s.text.toLowerCase();
    if (seenText.has(key)) continue;
    // An everyday suggestion is redundant when evidence already raised the same problem.
    if (s.source === "industry" && s.problem && evidencedProblems.has(s.problem) && out.filter((x) => x.problem === s.problem).length >= 2) continue;
    seenText.add(key);
    out.push(s);
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}
