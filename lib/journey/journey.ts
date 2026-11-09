import type { ListingField } from "../business/listings.ts";
import { industryInfo } from "../business/industry.ts";
import { locationContext } from "../business/location.ts";
import type { OnboardingAnalysis } from "../business/onboarding.ts";
import { applyCorrections } from "../business/profile.ts";
import type { Constraint, FactSource, Goal, OnboardingProfile, OwnerInputs } from "../business/types.ts";
import { loadCatalog } from "../catalog/index.ts";
import { PROBLEMS } from "../problems/catalog.ts";
import { discoverProblems } from "../problems/discover.ts";
import { calculateImpact, MODELS, QUESTION } from "../problems/impact.ts";
import { toRecommendationInput } from "../problems/toRecommendation.ts";
import type { DiscoveryResult, ImpactInput, ProblemCard, ProblemKey, Signal } from "../problems/types.ts";
import type { UseCase } from "../recommend/types.ts";
import { RULES } from "../rules/maryland.ts";
import type { JourneyState } from "./context.ts";
import { GUIDES } from "../advisor/knowledge.ts";
import { MAX_CHALLENGE_CHARS, type OwnerChallenge } from "../challenges/interpret.ts";
import { challengeSuggestions } from "../challenges/suggest.ts";
import type {
  Answer,
  Answers,
  Brief,
  BusinessCard,
  BusinessFact,
  CustomersSay,
  EvidenceItem,
  Finding,
  Findings,
  ImpactView,
  JourneyAnswerResponse,
  JourneyQuestion,
  LearnedItem,
  Opportunity,
  SourceLink,
} from "./types.ts";

/**
 * The journey engine. Pure and deterministic: same state + answers → same output.
 *
 * Principles (see docs/JOURNEY_API.md):
 * - Ask only what public information can't answer, and say why.
 * - Every question can be skipped; we say what we assume instead.
 * - Show the top 2–3 problems, deduplicated, each with linked evidence.
 * - No dollar figure until the owner gives the numbers it rests on.
 */

const MAX_OPPORTUNITIES = 3;
const MAX_PROBLEM_OPTIONS = 4;
const MAX_FOLLOW_UPS = 4;
const DEFAULT_BUDGET = 100;

// ---------- Owner-facing wording ----------

/** How an owner would say each problem about their own business. */
const OWNER_PHRASE: Record<ProblemKey, string> = {
  missed_inquiries: "Calls or messages go unanswered when we're busy",
  slow_responses: "Replies to messages can take a day or more",
  no_online_booking: "Customers can only book by calling",
  scheduling_inefficiency: "Juggling the schedule takes hours each week",
  slow_quotes: "Writing quotes eats into evenings",
  poor_review_management: "We rarely ask for reviews or reply to them",
  no_customer_follow_up: "We don't remind past customers to come back",
  repetitive_admin: "Paperwork and invoicing take hours each week",
  inconsistent_business_info: "Our hours or contact details are wrong somewhere online",
};

const HOURS_TOPIC: Partial<Record<ProblemKey, string>> = {
  slow_quotes: "writing quotes",
  scheduling_inefficiency: "scheduling",
  repetitive_admin: "paperwork and invoicing",
};

const PRAISE_PHRASE: Record<string, string> = {
  praise_quality: "the quality of the work",
  praise_responsive: "quick responses",
  praise_value: "fair prices",
  praise_friendly: "friendly service",
};

const BUDGETS: Record<string, { label: string; value: number }> = {
  up_to_50: { label: "Up to $50 a month", value: 50 },
  up_to_100: { label: "Up to $100 a month", value: 100 },
  up_to_200: { label: "Up to $200 a month", value: 200 },
  over_200: { label: "More than $200 a month", value: 500 },
};

const DEAL_BREAKERS: Record<string, { label: string; constraint: Constraint }> = {
  no_contract: { label: "No long contracts", constraint: "no_contract" },
  spanish_required: { label: "Must work in Spanish", constraint: "spanish_required" },
  offline_required: { label: "Must work without internet", constraint: "offline_required" },
};

const FACT_SOURCE: Record<FactSource, string | null> = {
  google_places: "From Google",
  mock_places: "Sample listing",
  public_listings: "Public listings",
  website: "Your website",
  tech_signature: "Your website",
  review_analysis: "From reviews",
  owner: "You told us",
  default: null,
  derived: "Our best guess",
};

const GOAL_LABEL: Record<Goal, string> = {
  more_customers: "More customers",
  save_time: "Save time",
  better_reviews: "Better reviews",
  get_paid_faster: "Get paid faster",
};

const EDITABLE = ["name", "address", "phone", "website", "hours"] as const;
const EDIT_LABEL: Record<(typeof EDITABLE)[number], string> = { name: "Name", address: "Address", phone: "Phone", website: "Website", hours: "Hours" };

const SOURCE_LABEL: Record<Signal["source"], string> = {
  google_review: "Google review",
  pasted_review: "Review you shared",
  sample_review: "Sample review",
  public_review: "Public review",
  listing: "Public listings",
  website: "Your website",
  google_profile: "Your Google listing",
  tech_stack: "Your website's tools",
  owner_reported: "You told us",
  industry_pattern: "Common in your industry",
};

const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const lower = (s: string) => (/^[A-Z]{2,}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const hostOf = (url: string | null) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
};

// ---------- State helpers ----------

export function stateFromAnalysis(analysis: OnboardingAnalysis, now: Date): JourneyState {
  const sources: SourceLink[] = analysis.snapshot
    ? analysis.snapshot.sources.map((s) => ({ label: s.label, url: s.url }))
    : [
        analysis.profile.business.googleMapsUrl ? { label: "Google Maps", url: analysis.profile.business.googleMapsUrl } : null,
        analysis.profile.business.website.value ? { label: "Your website", url: analysis.profile.business.website.value } : null,
        ...analysis.listings.listings.filter((l) => l.url && l.directory !== "website" && l.directory !== "google").map((l) => ({ label: l.label, url: l.url })),
      ].filter((s): s is SourceLink => Boolean(s));
  return {
    v: 1,
    createdAt: now.toISOString(),
    profile: analysis.profile,
    reviews: analysis.reviews,
    website: analysis.website,
    listings: analysis.listings,
    sources: sources.slice(0, 40),
    mode: { places: analysis.mode.places, sampleData: analysis.mode.places === "mock", capturedAt: analysis.snapshot?.capturedAt ?? null },
    answers: {},
    reviewTexts: analysis.reviewTexts ?? [],
  };
}

const discover = (state: JourneyState, profile: OnboardingProfile, assumptions?: Partial<Record<ProblemKey, Record<string, number>>>, now?: Date) =>
  discoverProblems({ profile, reviews: state.reviews, website: state.website, listings: state.listings, assumptions }, now);

/** A conflicting listings field the owner can settle (hours first, then phone, then address). */
function conflictField(state: JourneyState): ListingField | null {
  const fields = state.listings?.fields ?? [];
  for (const name of ["hours", "phone", "address"] as const) {
    const f = fields.find((x) => x.field === name && x.status === "differs" && x.values.length >= 2);
    if (f) return f;
  }
  return null;
}

/** Listing name for use mid-sentence ("Change BBB and your website to…"). */
const listingLabel = (state: JourneyState, id: string) => (state.listings?.listings.find((l) => l.id === id)?.label ?? id).replace(/^Your website$/, "your website");

// ---------- Step 2: what we learned ----------

export function businessCard(state: JourneyState, profile: OnboardingProfile = state.profile): BusinessCard {
  const b = profile.business;
  const addr = b.address.value;
  const where = [addr?.city, addr?.stateCode].filter(Boolean).join(", ");
  const hoursConflict = state.listings?.fields.some((f) => f.field === "hours" && f.status === "differs");
  const hoursFromOwner = b.hours.source === "owner";
  const ratingFromPlatform = b.rating.value !== null && (b.rating.source === "google_places" || b.rating.source === "public_listings" || b.rating.source === "mock_places");
  const label = (src: FactSource | null) => (src ? FACT_SOURCE[src] : null);
  const fact = (id: BusinessFact["id"], text: string, value: string | null | undefined, src: FactSource | null, editable = true): BusinessFact => ({
    id,
    label: text,
    value: value || null,
    source: value ? label(src) : null,
    editable,
  });
  const conflict = conflictField(state);
  const hoursUnsettled = conflict?.field === "hours" && !hoursFromOwner;
  const facts: BusinessFact[] = [
    fact("name", "Name", b.name.value, b.name.source),
    fact("type", "Type", b.industry.value && b.industry.value !== "other" ? b.industryLabel : null, b.industry.source, false),
    fact("address", "Address", addr?.formatted, b.address.source),
    fact("phone", "Phone", b.phone.value, b.phone.source),
    fact("website", "Website", b.website.value, b.website.source),
    // Disputed hours are settled by the "Which is right?" question instead.
    ...(hoursUnsettled ? [] : [fact("hours", "Hours", b.hours.value?.join(" · "), b.hours.source)]),
  ];
  return {
    facts,
    name: b.name.value ?? "Your business",
    subtitle: [b.industryLabel, where].filter(Boolean).join(" · "),
    address: addr?.formatted || null,
    phone: b.phone.value,
    website: b.website.value,
    hours: b.hours.value?.length && (!hoursConflict || hoursFromOwner) ? b.hours.value.join(" · ") : null,
    rating: ratingFromPlatform ? { value: b.rating.value!, count: b.reviewCount.value, from: b.rating.evidence ?? "Public listings" } : null,
  };
}

export function learned(state: JourneyState): LearnedItem[] {
  const items: LearnedItem[] = [];
  const r = state.reviews;
  if (r.reviewCount > 0) {
    const testimonials = r.platforms.some((p) => /testimonial/i.test(p.name));
    const noun = testimonials ? plural(r.reviewCount, "review or testimonial", "reviews and testimonials") : plural(r.reviewCount, "review");
    const where = r.platforms.filter((p) => !/testimonial/i.test(p.name)).slice(0, 3).map((p) => p.name);
    const praise = r.praise.slice(0, 2).map((t) => PRAISE_PHRASE[t.key] ?? lower(t.label));
    const complaints = r.complaints.filter((t) => t.mentions > 0).slice(0, 1);
    let text = `We read ${noun}${where.length ? ` (${list(where)})` : ""}.`;
    if (praise.length) text += ` Customers mostly praise ${list(praise)}.`;
    if (complaints.length) text += ` ${complaints[0].mentions === 1 ? "1 review mentions" : `${complaints[0].mentions} reviews mention`} ${lower(complaints[0].label)}.`;
    if (r.newestReview) text += ` The newest one we found is from ${r.newestReview}.`;
    const seen = new Set<string>();
    const sources: SourceLink[] = [];
    const evidence = [...r.praise, ...r.complaints].flatMap((t) => t.evidence);
    evidence.sort((a, b) => Number(/testimonial/i.test(a.platform ?? "")) - Number(/testimonial/i.test(b.platform ?? "")));
    for (const e of evidence)
      if (e.url && !seen.has(e.url) && sources.length < 3) {
        seen.add(e.url);
        sources.push({ label: e.platform ?? "Review", url: e.url });
      }
    items.push({ id: "reviews", text, kind: "reviews", sources });
  }
  const w = state.website;
  if (w) {
    const host = hostOf(w.requestedUrl) ?? "your website";
    if (w.reachable) {
      const ways = w.contactForm.present ? "phone or the contact form" : "phone";
      const text = w.booking.onlineBooking
        ? `Your website (${host}) lets customers book online${w.booking.provider ? ` with ${w.booking.provider}` : ""}.`
        : `Your website (${host}) has no online booking; customers reach you by ${ways}.`;
      items.push({ id: "website", text, kind: "website", sources: [{ label: "Your website", url: w.booking.evidence?.url ?? w.requestedUrl }] });
    } else {
      const fromSearch = w.limitations.some((l) => /search engine/i.test(l)) || /search engine/i.test(w.problem ?? "");
      const text = fromSearch
        ? `Your website (${host}) asks automated tools not to read it, so we only used what search engines show for it.`
        : `We couldn't read your website (${host}), so we didn't use it.`;
      items.push({ id: "website", text, kind: "website", sources: [{ label: "Your website", url: w.requestedUrl }] });
    }
  }
  const l = state.listings;
  if (l && l.listings.length >= 2) {
    const mismatches = l.issues.filter((i) => i.kind !== "rating_gap");
    const text = mismatches.length
      ? `We compared your details on ${plural(l.listings.length, "site")}: ${plural(mismatches.length, "thing")} ${mismatches.length === 1 ? "doesn't" : "don't"} match.`
      : `We compared your details on ${plural(l.listings.length, "site")}, and they match.`;
    items.push({ id: "listings", text, kind: "listings", sources: l.listings.filter((x) => x.url).slice(0, 5).map((x) => ({ label: x.label, url: x.url })) });
  }
  const tech = state.profile.technology.detected;
  if (tech.length) {
    items.push({
      id: "tools",
      text: `We spotted ${list(tech.map((t) => t.name))} in use.`,
      kind: "tools",
      sources: tech.flatMap((t) => t.evidence.slice(0, 1).map((e) => ({ label: t.name, url: e.url }))).slice(0, 3),
    });
  }
  return items;
}

export function customersSay(state: JourneyState): CustomersSay {
  const r = state.reviews;
  const total = r.reviewCount;
  const pick = (t: (typeof r.complaints)[number]) => {
    const e = t.evidence.find((x) => x.quote) ?? t.evidence.find((x) => x.summary) ?? null;
    if (!e) return null;
    return { text: (e.quote ?? e.summary)!, isQuote: Boolean(e.quote), who: e.author, where: e.platform ?? null, url: e.url ?? null };
  };
  const themes = [
    ...[...r.complaints].sort((a, b) => b.mentions - a.mentions).map((t) => ({ t, polarity: "complaint" as const, example: pick(t) })),
    ...[...r.praise].sort((a, b) => b.mentions - a.mentions).map((t) => ({ t, polarity: "praise" as const, example: null })),
  ]
    .filter((x) => x.t.mentions > 0)
    .slice(0, 4)
    .map(({ t, polarity, example }) => ({ key: t.key, label: t.label, polarity, countLabel: `from ${t.mentions} of ${plural(total, "review")}`, example }));
  const googleOnly = r.bySource.google > 0 && r.bySource.google === total;
  const testimonials = r.platforms.some((p) => /testimonial/i.test(p.name));
  const note = googleOnly
    ? `Google only shares ${total} reviews, so this is a small sample.`
    : testimonials
      ? "Includes testimonials from your own website, which tend to be positive."
      : total > 0 && total < 10
        ? "This is a small sample."
        : null;
  return { reviewCount: total, themes, note };
}

export function toolsFound(state: JourneyState): { name: string; url: string | null }[] {
  return state.profile.technology.detected.map((t) => ({ name: t.name, url: t.evidence[0]?.url ?? null }));
}

/** What we couldn't look at, said plainly so a thin result isn't mistaken for a clean bill of health. */
export function couldNotCheck(analysis: OnboardingAnalysis): string[] {
  const out: string[] = [];
  const w = analysis.website;
  if (!analysis.profile.business.website.value) out.push("You don't have a website we could find, so we couldn't check online booking, prices or policies.");
  else if (w && !w.reachable && !w.limitations.some((l) => /search engine/i.test(l)))
    out.push(`We couldn't read your website (${w.problem ? w.problem.replace(/\.$/, "").toLowerCase() : "it didn't respond"}), so we couldn't check online booking, prices or policies.`);
  if (analysis.reviews.reviewCount === 0) {
    const ratings = analysis.profile.business.reviewCount?.value ?? null;
    out.push(
      typeof ratings === "number" && ratings > 0
        ? `Google didn't share the text of any of your ${ratings.toLocaleString("en-US")} reviews, so we couldn't learn what customers say. You can paste a few on the first screen.`
        : "We found no reviews to read, so we couldn't learn what customers say. You can paste a few on the first screen.",
    );
  }
  if (analysis.mode.places === "none")
    out.push("We didn't look up a Google listing, so hours, phone and rating come only from what you typed and your website.");
  return out;
}

// ---------- Step 3: questions ----------

const IMPACT_KEYS: Record<string, string[] | null> = {
  missed_inquiries: ["missed_per_week", "average_job_value"],
  slow_responses: ["weekly_inquiries", "average_job_value"],
  no_online_booking: ["weekly_inquiries", "average_job_value"],
  follow_up: ["monthly_customers", "average_job_value"],
  time_cost_quotes: ["hours_per_week"],
  time_cost_scheduling: ["hours_per_week"],
  time_cost_admin: ["hours_per_week"],
  wrong_info: null,
};

const impactQuestionId = (problem: ProblemKey, key: string) => (key === "hours_per_week" ? `impact.${problem}.hours_per_week` : `impact.${key}`);

function impactNeedsFor(problem: ProblemKey): string[] {
  const model = PROBLEMS[problem].impactModel;
  const keys = model ? IMPACT_KEYS[model] : null;
  return keys ? keys.map((k) => impactQuestionId(problem, k)) : [];
}

function inputRange(model: string, key: string): { min: number; max: number } {
  const m = MODELS[model];
  if (m.derived?.key === key) return { min: m.derived.min, max: m.derived.max };
  const spec = m.inputs.find((i) => i.key === key);
  return { min: spec?.min ?? 0, max: spec?.max ?? 100_000 };
}

function impactQuestion(problem: ProblemKey, key: string): JourneyQuestion {
  const model = PROBLEMS[problem].impactModel!;
  const { min, max } = inputRange(model, key);
  const topic = HOURS_TOPIC[problem];
  const text = key === "hours_per_week" && topic ? `About how many hours a week go to ${topic}?` : key === "average_job_value" ? "What's a typical job or order worth to you?" : QUESTION[key] ?? key;
  const unit = key === "average_job_value" ? "usd" : key === "hours_per_week" ? "hours_per_week" : key === "monthly_customers" ? "per_month" : "per_week";
  return {
    id: impactQuestionId(problem, key),
    kind: "number",
    text,
    why: key === "average_job_value" ? "With this we can show what these problems may be worth, using your numbers instead of guesses." : "We can't see this from outside, and we won't guess it for you.",
    default: null,
    ifSkipped: "We won't show a dollar figure that depends on it.",
    optional: true,
    unit,
    min,
    max,
    placeholder: key === "average_job_value" ? "e.g. 350" : key === "hours_per_week" ? "e.g. 3" : "e.g. 10",
    affects: ["estimate"],
  };
}

/** Every impact question that could be asked for this business (answers persist even if the top list changes). */
function allImpactQuestions(): Map<string, JourneyQuestion> {
  const out = new Map<string, JourneyQuestion>();
  for (const key of Object.keys(PROBLEMS) as ProblemKey[]) {
    const model = PROBLEMS[key].impactModel;
    for (const k of (model && IMPACT_KEYS[model]) || []) {
      const q = impactQuestion(key, k);
      if (!out.has(q.id)) out.set(q.id, q);
    }
  }
  return out;
}
const IMPACT_QUESTIONS = allImpactQuestions();
const IMPACT_LABEL: Record<string, string> = {
  "impact.average_job_value": "Typical job value",
  "impact.missed_per_week": "Calls or messages missed",
  "impact.weekly_inquiries": "Calls, messages and requests",
  "impact.monthly_customers": "Past customers you could remind",
  "impact.slow_quotes.hours_per_week": "Time on quotes",
  "impact.scheduling_inefficiency.hours_per_week": "Time on scheduling",
  "impact.repetitive_admin.hours_per_week": "Time on paperwork",
};

/** Products that tools for these use cases connect to, most common first (the same catalog /api/recommend uses). */
function toolOptions(useCases: Set<UseCase>): string[] {
  const counts = new Map<string, number>();
  const add = (name: string) => counts.set(name, (counts.get(name) ?? 0) + 1);
  for (const r of loadCatalog())
    if (r.badge !== "blocked" && r.useCases.some((u) => useCases.has(u))) r.worksWith.filter((w) => w.type !== "none").forEach((w) => add(w.product));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name).slice(0, 6);
}

/** Hypotheses worth asking about: one per kind of problem, and not one public evidence already covers. */
function askableHypotheses(discovery: DiscoveryResult): ProblemCard[] {
  const covered = new Set(discovery.problems.filter((p) => p.status !== "hypothesis").map((p) => p.category.key));
  const out: ProblemCard[] = [];
  for (const p of discovery.problems) {
    if (p.status !== "hypothesis" || covered.has(p.category.key) || p.key === "inconsistent_business_info") continue;
    covered.add(p.category.key);
    out.push(p);
    if (out.length >= MAX_PROBLEM_OPTIONS) break;
  }
  return out;
}

export function buildQuestions(state: JourneyState, base: DiscoveryResult = discover(state, state.profile)): JourneyQuestion[] {
  const questions: JourneyQuestion[] = [];
  const evidenced = base.problems.filter((p) => p.status !== "hypothesis");
  const askable = askableHypotheses(base);

  // Listen first: the owner says what's hard, in their own words, helped by suggestions made for this business.
  questions.push({
    id: "challenges",
    kind: "text",
    text: "What's taking up too much of your time or making running your business harder?",
    why: "In your own words. Write as much or as little as you like, or tap a suggestion below.",
    default: null,
    ifSkipped: "We'll go by what we found in public information.",
    optional: false,
    placeholder: "e.g. I spend too much time answering calls, and customers don't reply after I send a quote",
    affects: ["problems", "recommendations"],
    suggestions: state.suggestions ?? challengeSuggestions(state, base),
  });

  if (askable.length) {
    questions.push({
      id: "problems",
      kind: "multi",
      text: "Do any of these happen at your business?",
      why: "These are common for businesses like yours, but we can't see them from public information.",
      options: [
        ...askable.map((p) => ({ value: p.key, label: OWNER_PHRASE[p.key], ...(p.counterEvidence ? { hint: p.counterEvidence.label } : {}) })),
        { value: "none", label: "None of these" },
      ],
      default: null,
      ifSkipped: "We'll only use what we found in public information and list these as “not checked”.",
      // Superseded by "challenges" in the app; still accepted from API clients.
      optional: true,
      affects: ["problems", "recommendations"],
    });
  }

  const conflict = conflictField(state);
  if (conflict) {
    const noun = conflict.field === "hours" ? "hours" : conflict.field === "phone" ? "phone number" : "address";
    questions.push({
      id: `listing.${conflict.field}`,
      kind: "single",
      text: `Which ${noun} ${conflict.field === "hours" ? "are" : "is"} right?`,
      why: `Different websites show different ${noun === "hours" ? "hours" : `${noun}s`}. Tell us which is right and we'll tell you exactly which listings to fix.`,
      options: [
        ...conflict.values.slice(0, 4).map((val, i) => ({ value: `v${i}`, label: val.display, hint: `Shown on ${list(val.listingIds.map((id) => listingLabel(state, id)))}` })),
        { value: "other", label: "Neither of these" },
      ],
      default: null,
      ifSkipped: `We'll suggest making your ${noun} the same everywhere, without saying which is right.`,
      optional: false,
      affects: ["next_step"],
    });
  }

  const phoneEvidenced = evidenced.some((p) => p.useCase === "missed-calls");
  const phoneAskable = askable.some((p) => p.useCase === "missed-calls");
  if ((phoneEvidenced || phoneAskable) && state.profile.business.address.value?.stateCode === "MD") {
    const rule = RULES.find((r) => r.id === "md-call-recording");
    questions.push({
      id: "call_recording",
      kind: "single",
      text: "Is it OK if a tool that answers your phone records calls?",
      why: "Some answering tools record calls. In Maryland everyone on the call must agree, so those tools announce it at the start.",
      options: [
        { value: "ok", label: "Yes, if callers are told" },
        { value: "no", label: "No recording" },
      ],
      default: null,
      ifSkipped: "Phone tools that record will always announce it, as Maryland law requires.",
      optional: false,
      ...(phoneEvidenced ? {} : { showIf: { questionId: "problems", includesAny: ["missed_inquiries"] } }),
      affects: ["recommendations"],
      ...(rule ? { source: { label: rule.source.label, url: rule.source.url } } : {}),
    });
  }

  const useCases = new Set([...evidenced, ...askable].map((p) => p.useCase).filter((u): u is UseCase => Boolean(u)));
  const detected = state.profile.technology.detected.map((t) => t.name);
  const options = toolOptions(useCases);
  const unknown = options.filter((o) => !detected.some((d) => d.toLowerCase() === o.toLowerCase()));
  if (unknown.length) {
    const preset = options.filter((o) => detected.some((d) => d.toLowerCase() === o.toLowerCase()));
    questions.push({
      id: "tools",
      kind: "multi",
      text: "Do you already use any of these?",
      why: "Tools that work with what you already use are quicker to set up.",
      options: [...options.map((o) => ({ value: o, label: o, ...(preset.includes(o) ? { hint: "We saw this on your website" } : {}) })), { value: "none", label: "None of these" }],
      default: preset.length ? preset : null,
      ifSkipped: detected.length ? `We'll assume you use only what we saw: ${list(detected)}.` : "We'll assume you don't use any of these.",
      optional: false,
      affects: ["recommendations"],
    });
  }

  questions.push({
    id: "budget",
    kind: "single",
    text: "What could you spend on a tool each month?",
    why: "So we only suggest tools you can afford.",
    options: Object.entries(BUDGETS).map(([value, b]) => ({ value, label: b.label })),
    default: null,
    ifSkipped: `We'll assume up to ${usd(DEFAULT_BUDGET)} a month. You can change it any time.`,
    optional: false,
    affects: ["recommendations"],
  });

  questions.push({
    id: "setup",
    kind: "single",
    text: "Would you set up a new tool yourself?",
    why: "Some tools take an afternoon to set up; others come with someone who does it for you.",
    options: [
      { value: "self", label: "I'll set it up myself" },
      { value: "help", label: "I'd like help" },
    ],
    default: null,
    ifSkipped: "We'll assume you'll set it up yourself.",
    optional: false,
    affects: ["recommendations"],
  });

  questions.push({
    id: "goals",
    kind: "multi",
    text: "What matters most?",
    why: "When two problems look equally important, we put these first.",
    maxSelect: 2,
    options: (Object.keys(GOAL_LABEL) as Goal[]).map((g) => ({ value: g, label: GOAL_LABEL[g] })),
    default: null,
    ifSkipped: "We'll rank problems by the evidence alone.",
    // The owner's own challenges now say what matters; kept for API clients.
    optional: true,
    affects: ["problems"],
  });

  if (industryInfo(state.profile.business.industry.value ?? "other").handlesHealthData) {
    questions.push({
      id: "health_data",
      kind: "single",
      text: "Do you keep patient health information?",
      why: "Tools that touch health records must follow HIPAA, so we leave out the ones that don't.",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
      default: null,
      ifSkipped: "We'll assume you do, and only suggest tools that can handle health information.",
      optional: false,
      affects: ["recommendations"],
    });
  }

  questions.push({
    id: "deal_breakers",
    kind: "multi",
    text: "Anything a tool must have?",
    why: "We'll leave out tools that don't meet these.",
    options: Object.entries(DEAL_BREAKERS).map(([value, d]) => ({ value, label: d.label })),
    default: null,
    ifSkipped: "No extra filters.",
    optional: true,
    affects: ["recommendations"],
  });

  questions.push({
    id: "anything_else",
    kind: "text",
    text: "Anything else slowing you down?",
    why: "In your own words. We'll match it to the problems we know how to help with.",
    default: null,
    ifSkipped: "Nothing changes.",
    optional: true,
    placeholder: "e.g. chasing unpaid invoices, writing quotes at night",
    affects: ["problems"],
  });

  return questions;
}

// ---------- Applying answers ----------

/** Whether a question applies given the answers so far. For "problems", a per-problem "yes" counts too. */
export function isVisible(q: JourneyQuestion, answers: Answers): boolean {
  if (!q.showIf) return true;
  const a = answers[q.showIf.questionId];
  if (Array.isArray(a) && a.some((x) => q.showIf!.includesAny.includes(x))) return true;
  return q.showIf.questionId === "problems" && q.showIf.includesAny.some((k) => answers[`problem.${k}`] === "yes");
}

export interface Applied {
  profile: OnboardingProfile;
  confirmed: Set<ProblemKey>;
  denied: Set<ProblemKey>;
  unchecked: Set<ProblemKey>;
  overrides: Partial<Record<ProblemKey, Record<string, number>>>;
  listingChoice: { field: ListingField; chosen: number | "other" } | null;
  youToldUs: JourneyAnswerResponse["youToldUs"];
  assumptions: JourneyAnswerResponse["assumptions"];
  ignored: JourneyAnswerResponse["ignored"];
}

/** Keeps only valid answers; returns the cleaned set plus reasons for anything dropped. */
export function cleanAnswers(questions: JourneyQuestion[], answers: Answers): { answers: Answers; ignored: { questionId: string; reason: string }[] } {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const out: Answers = {};
  const ignored: { questionId: string; reason: string }[] = [];
  const offeredProblems = new Set((byId.get("problems")?.options ?? []).map((o) => o.value).filter((v) => v !== "none"));
  const suggestionIds = new Set((byId.get("challenges")?.suggestions ?? []).map((s) => s.id));
  for (const [id, value] of Object.entries(answers)) {
    if (id === "challenges") {
      if (value === null || value === undefined || (typeof value === "string" && !value.trim())) continue;
      if (typeof value === "string" && value.length <= MAX_CHALLENGE_CHARS) out[id] = value.trim();
      else ignored.push({ questionId: id, reason: `Keep it under ${MAX_CHALLENGE_CHARS.toLocaleString("en-US")} characters.` });
      continue;
    }
    if (id === "challenge_picks") {
      if (value === null || value === undefined) continue;
      if (Array.isArray(value) && value.length <= 12 && value.every((x) => typeof x === "string" && suggestionIds.has(x))) {
        if (value.length) out[id] = [...new Set(value as string[])];
      } else ignored.push({ questionId: id, reason: "Pick from the suggestions." });
      continue;
    }
    if (id.startsWith("problem.")) {
      // Per-problem form of the "problems" question: "yes" / "no" for one option.
      if (!offeredProblems.has(id.slice(8))) ignored.push({ questionId: id, reason: "We don't ask about this problem for this business." });
      else if (value === null || value === undefined) continue;
      else if (value === "yes" || value === "no") out[id] = value;
      else ignored.push({ questionId: id, reason: "Answer “yes” or “no”." });
      continue;
    }
    if (id.startsWith("edit.")) {
      if (!(EDITABLE as readonly string[]).includes(id.slice(5))) ignored.push({ questionId: id, reason: "This detail can't be edited here." });
      else if (value === null || value === undefined) continue;
      else if (typeof value === "string" && value.trim().length > 0 && value.length <= 200) out[id] = value.trim();
      else ignored.push({ questionId: id, reason: "Enter up to 200 characters." });
      continue;
    }
    const q = byId.get(id) ?? IMPACT_QUESTIONS.get(id);
    if (!q) {
      ignored.push({ questionId: id, reason: "We don't ask this question for this business." });
      continue;
    }
    if (value === null || value === undefined) continue;
    const allowed = new Set((q.options ?? []).map((o) => o.value));
    if (q.kind === "single") {
      if (typeof value === "string" && allowed.has(value)) out[id] = value;
      else ignored.push({ questionId: id, reason: "Pick one of the options." });
    } else if (q.kind === "multi") {
      if (Array.isArray(value) && value.length <= (q.maxSelect ?? allowed.size) && value.every((x) => typeof x === "string" && allowed.has(x))) {
        const picked = [...new Set(value)];
        out[id] = picked.includes("none") ? ["none"] : picked;
      } else ignored.push({ questionId: id, reason: "Pick from the options." });
    } else if (q.kind === "number") {
      if (typeof value === "number" && Number.isFinite(value) && value >= (q.min ?? 0) && value <= (q.max ?? Infinity)) out[id] = value;
      else ignored.push({ questionId: id, reason: `Enter a number from ${q.min ?? 0} to ${(q.max ?? 0).toLocaleString("en-US")}.` });
    } else if (typeof value === "string" && value.trim().length > 0 && value.length <= 300) out[id] = value.trim();
    else if (typeof value === "string" && value.trim().length === 0) continue;
    else ignored.push({ questionId: id, reason: "Keep it under 300 characters." });
  }
  return { answers: out, ignored };
}

export function applyAnswers(state: JourneyState, questions: JourneyQuestion[], answers: Answers, challenges: OwnerChallenge[] = []): Applied {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const owner: OwnerInputs = {};
  const youToldUs: Applied["youToldUs"] = [];
  const assumptions: Applied["assumptions"] = [];
  const confirmed = new Set<ProblemKey>();
  const denied = new Set<ProblemKey>();
  const unchecked = new Set<ProblemKey>();
  const label = (id: string, value: string) => byId.get(id)?.options?.find((o) => o.value === value)?.label ?? value;
  const shown = (q: JourneyQuestion) => isVisible(q, answers);

  // Problems
  const problemsQ = byId.get("problems");
  if (problemsQ) {
    const offered = problemsQ.options!.map((o) => o.value).filter((v) => v !== "none") as ProblemKey[];
    const a = answers.problems;
    if (Array.isArray(a)) {
      for (const key of offered) (a.includes(key) ? confirmed : denied).add(key);
      youToldUs.push({ questionId: "problems", label: "Happens at your business", value: a.includes("none") ? "None of these" : a.map((k) => label("problems", k)).join("; ") });
    }
    // Per-problem answers ("Might apply. Tell us." → Yes / No) refine or replace the list answer.
    for (const key of offered) {
      const one = answers[`problem.${key}`];
      if (one === "yes") {
        confirmed.add(key);
        denied.delete(key);
      } else if (one === "no") {
        denied.add(key);
        confirmed.delete(key);
      }
    }
    if (!Array.isArray(a)) for (const key of offered) if (!confirmed.has(key) && !denied.has(key)) unchecked.add(key);
    const said = offered.filter((k) => answers[`problem.${k}`] !== undefined);
    if (!Array.isArray(a) && said.length)
      youToldUs.push({ questionId: "problems", label: "Happens at your business", value: said.map((k) => `${label("problems", k)}: ${answers[`problem.${k}`] === "yes" ? "yes" : "no"}`).join("; ") });
  }
  // The owner's own challenges: those that are a known kind of problem count as confirmed by them.
  for (const ch of challenges) {
    if (!ch.problem) continue;
    confirmed.add(ch.problem);
    denied.delete(ch.problem);
    unchecked.delete(ch.problem);
  }
  if (challenges.length) youToldUs.unshift({ questionId: "challenges", label: "What's taking your time", value: challenges.map((ch) => ch.words).join("; ") });
  if (confirmed.size) owner.reportedProblems = [...confirmed];

  // Listing conflict
  let listingChoice: Applied["listingChoice"] = null;
  const conflict = conflictField(state);
  const corrections: { name?: string; website?: string; hours?: string[]; phone?: string; address?: { formatted: string } } = {};
  if (conflict) {
    const a = answers[`listing.${conflict.field}`];
    if (typeof a === "string") {
      const chosen = a === "other" ? "other" : Number(a.slice(1));
      listingChoice = { field: conflict, chosen };
      youToldUs.push({ questionId: `listing.${conflict.field}`, label: conflict.field === "hours" ? "Your hours" : conflict.field === "phone" ? "Your phone number" : "Your address", value: label(`listing.${conflict.field}`, a) });
      if (chosen !== "other") {
        const display = conflict.values[chosen].display;
        if (conflict.field === "hours") corrections.hours = [display];
        else if (conflict.field === "phone") corrections.phone = display;
        else corrections.address = { formatted: display };
      }
    }
  }

  // Call recording
  const rec = byId.get("call_recording");
  if (rec && shown(rec) && typeof answers.call_recording === "string") {
    youToldUs.push({ questionId: "call_recording", label: "Call recording", value: label("call_recording", answers.call_recording) });
  }
  const constraints: Constraint[] = [];
  if (rec && shown(rec) && answers.call_recording === "no") constraints.push("no_recording");

  // Tools
  const detected = state.profile.technology.detected.map((t) => t.name);
  let currentTools: string[] | undefined;
  if (byId.has("tools")) {
    const a = answers.tools;
    if (Array.isArray(a)) {
      const picked = a.filter((x) => x !== "none");
      const offered = new Set(byId.get("tools")!.options!.map((o) => o.value));
      currentTools = [...new Set([...detected.filter((d) => !offered.has(d)), ...picked])];
      youToldUs.push({ questionId: "tools", label: "Tools you use", value: picked.length ? picked.join(", ") : "None of these" });
    } else if (detected.length) assumptions.push({ questionId: "tools", text: `You use only what we saw: ${list(detected)}.` });
  }

  // Budget
  const budget = typeof answers.budget === "string" ? BUDGETS[answers.budget] : undefined;
  owner.monthlyBudget = budget?.value ?? DEFAULT_BUDGET;
  if (budget) youToldUs.push({ questionId: "budget", label: "Monthly budget", value: budget.label });
  else assumptions.push({ questionId: "budget", text: `A budget of up to ${usd(DEFAULT_BUDGET)} a month.` });

  // Setup
  if (answers.setup === "help" || answers.setup === "self") {
    owner.techComfort = answers.setup === "help" ? "needs_help" : "self_serve";
    youToldUs.push({ questionId: "setup", label: "Setup", value: label("setup", answers.setup) });
  } else {
    owner.techComfort = "self_serve";
    assumptions.push({ questionId: "setup", text: "You'll set tools up yourself." });
  }

  // Health data
  if (byId.has("health_data")) {
    if (answers.health_data === "yes" || answers.health_data === "no") {
      owner.handlesHealthData = answers.health_data === "yes";
      youToldUs.push({ questionId: "health_data", label: "Patient health information", value: answers.health_data === "yes" ? "Yes" : "No" });
    } else assumptions.push({ questionId: "health_data", text: "You keep patient health information." });
  }

  // Deal-breakers
  if (Array.isArray(answers.deal_breakers) && answers.deal_breakers.length) {
    for (const d of answers.deal_breakers) if (DEAL_BREAKERS[d]) constraints.push(DEAL_BREAKERS[d].constraint);
    youToldUs.push({ questionId: "deal_breakers", label: "Must have", value: answers.deal_breakers.map((d) => DEAL_BREAKERS[d]?.label ?? d).join(", ") });
  }
  if (constraints.length) owner.constraints = constraints;

  // Anything else
  if (typeof answers.anything_else === "string") {
    owner.biggestTimeSink = answers.anything_else;
    youToldUs.push({ questionId: "anything_else", label: "Also slowing you down", value: answers.anything_else });
  }

  // Goals
  if (Array.isArray(answers.goals) && answers.goals.length) {
    owner.goals = answers.goals as Goal[];
    youToldUs.push({ questionId: "goals", label: "What matters most", value: answers.goals.map((g) => GOAL_LABEL[g as Goal] ?? g).join(", ") });
  }

  // Corrections to the business details ("Is this right?" → Edit)
  for (const field of EDITABLE) {
    const value = answers[`edit.${field}`];
    if (typeof value !== "string") continue;
    if (field === "hours") corrections.hours = [value];
    else if (field === "address") corrections.address = { formatted: value };
    else (corrections as Record<string, unknown>)[field] = value;
    youToldUs.push({ questionId: `edit.${field}`, label: EDIT_LABEL[field], value });
  }

  // Impact numbers
  const overrides: Partial<Record<ProblemKey, Record<string, number>>> = {};
  for (const key of Object.keys(PROBLEMS) as ProblemKey[]) {
    const model = PROBLEMS[key].impactModel;
    const keys = model ? IMPACT_KEYS[model] : null;
    if (!keys) continue;
    for (const k of keys) {
      const value = answers[impactQuestionId(key, k)];
      if (typeof value === "number") (overrides[key] ??= {})[k] = value;
    }
  }
  for (const [id, value] of Object.entries(answers)) {
    const q = IMPACT_QUESTIONS.get(id);
    if (q && typeof value === "number") youToldUs.push({ questionId: id, label: IMPACT_LABEL[id] ?? q.text.replace(/\?$/, ""), value: q.unit === "usd" ? usd(value) : q.unit === "hours_per_week" ? `${value} hours a week` : q.unit === "per_month" ? `${value} a month` : `${value} a week` });
  }

  const profile = applyCorrections(state.profile, { business: corrections, owner, ...(currentTools ? { currentTools } : {}) }, { confirm: false });
  // Values we filled in because a question was skipped are assumptions, not "you told us".
  const assumed = (evidence: string) => ({ source: "default" as const, confidence: "low" as const, evidence, editable: true, needsOwnerInput: false });
  if (!budget) profile.owner.monthlyBudget = { value: DEFAULT_BUDGET, ...assumed("Assumed: you skipped this question") };
  if (answers.setup !== "help" && answers.setup !== "self") profile.owner.techComfort = { value: "self_serve", ...assumed("Assumed: you skipped this question") };
  if (byId.has("health_data") && owner.handlesHealthData === undefined) profile.owner.handlesHealthData = { value: true, ...assumed("Assumed for health businesses") };
  return { profile, confirmed, denied, unchecked, overrides, listingChoice, youToldUs, assumptions, ignored: [] };
}

// ---------- Step 4: opportunities ----------

function evidenceItems(card: ProblemCard, state: JourneyState): { items: EvidenceItem[]; total: number } {
  const usable = card.evidence.filter((s) => s.source !== "industry_pattern");
  // One item per finding (a listings mismatch produces one signal per side; show it once), observed first.
  const seen = new Set<string>();
  const unique: Signal[] = [];
  for (const s of usable) {
    const key = s.source === "listing" && s.attribution ? `listing:${s.attribution}` : s.id;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(s);
  }
  const items = unique.slice(0, 3).map((s): EvidenceItem => {
    const links = (s.links ?? []).filter((l) => l.url).map((l) => ({ label: l.label, url: l.url }));
    if (s.source === "listing") {
      // The issue's detail names both sides ("A and B say X, but C says Y").
      const issue = state.listings?.issues.find((i) => i.headline === s.attribution);
      const issueLinks = issue
        ? issue.listingIds.map((id) => state.listings!.listings.find((l) => l.id === id)).filter((l) => l?.url).map((l) => ({ label: l!.label, url: l!.url }))
        : [];
      const all = issueLinks.length ? issueLinks : links;
      return {
        title: issue?.headline ?? s.attribution ?? null,
        text: issue?.detail ?? s.observation,
        isQuote: false,
        sourceLabel: SOURCE_LABEL.listing,
        url: all[0]?.url ?? s.reference?.url ?? null,
        links: all.slice(0, 8),
        observed: s.verified,
      };
    }
    if (s.source === "owner_reported" && s.reference?.field === "owner.reportedProblems") {
      return { title: null, text: `You said this happens: “${OWNER_PHRASE[card.key]}”`, isQuote: false, sourceLabel: SOURCE_LABEL.owner_reported, url: null, links: [], observed: true };
    }
    const isReview = s.source.endsWith("_review");
    const url = s.reference?.url ?? links[0]?.url ?? null;
    return {
      title: null,
      text: s.quote ?? s.summary ?? s.observation,
      isQuote: Boolean(s.quote),
      sourceLabel: isReview ? (s.attribution ?? SOURCE_LABEL[s.source]) : SOURCE_LABEL[s.source],
      url,
      links: links.length ? links.slice(0, 8) : url ? [{ label: isReview ? (s.attribution ?? "Review") : SOURCE_LABEL[s.source], url }] : [],
      observed: s.verified,
    };
  });
  return { items, total: unique.length };
}

function publicBasis(card: ProblemCard): string | null {
  const observed = card.evidence.filter((s) => s.verified && s.source !== "owner_reported");
  if (!observed.length) return null;
  const listings = new Set(observed.filter((s) => s.source === "listing").flatMap((s) => (s.links ?? []).map((l) => l.label)));
  const reviews = observed.filter((s) => s.source.endsWith("_review")).length;
  const inParts = [
    listings.size ? plural(listings.size, "public listing") : observed.some((s) => s.source === "listing") ? "public listings" : null,
    reviews ? plural(reviews, "review") : null,
  ].filter(Boolean) as string[];
  const onParts = [
    observed.some((s) => s.source === "website") ? "your website" : null,
    observed.some((s) => s.source === "google_profile") ? "your Google listing" : null,
  ].filter(Boolean) as string[];
  const parts = [inParts.length ? `in ${list(inParts)}` : null, onParts.length ? `on ${list(onParts)}` : null].filter(Boolean) as string[];
  return parts.length ? `Seen ${parts.join(" and ")}` : "Seen in public information";
}

function impactView(card: ProblemCard, profile: OnboardingProfile, overrides: Record<string, number> | undefined): Pick<Opportunity, "impact" | "impactNote" | "impactNeeds"> {
  const def = PROBLEMS[card.key];
  const needs = impactNeedsFor(card.key);
  if (!def.impactModel || !needs.length) {
    return {
      impact: null,
      impactNote: def.noImpactReason ?? (card.key === "inconsistent_business_info" ? "We don't put a dollar figure on this: we can't know how many people see the wrong details. It's a free fix." : null),
      impactNeeds: [],
    };
  }
  const keys = IMPACT_KEYS[def.impactModel]!;
  const missing = keys.filter((k) => overrides?.[k] === undefined).map((k) => impactQuestionId(card.key, k));
  if (missing.length) return { impact: null, impactNote: "Answer a quick question below to see what this may be worth, using your numbers.", impactNeeds: missing };
  const result = calculateImpact(def.impactModel, industryInfo(profile.business.industry.value ?? "other"), overrides);
  if (!result.ok) return { impact: null, impactNote: "Your numbers couldn't be used. Check them and try again.", impactNeeds: needs };
  const e = result.estimate;
  const show = (i: ImpactInput) => ({ label: i.label, value: i.value, unit: i.unit });
  const view: ImpactView = {
    monthly: e.monthly,
    kind: e.kind,
    label: e.kind === "time_cost" ? "Value of your time each month (estimate)" : "Money you may be missing each month (estimate)",
    math: e.calculation,
    yourNumbers: e.inputs.filter((i) => i.source === "owner").map(show),
    assumed: e.inputs.filter((i) => i.source !== "owner").map(show),
  };
  return { impact: view, impactNote: null, impactNeeds: [] };
}

const FIELD_NOUN: Record<string, string> = { hours: "hours", phone: "phone number", address: "address", services: "services" };

function nextStepFor(card: ProblemCard, applied: Applied, state: JourneyState): string {
  const choice = applied.listingChoice;
  if (card.key !== "inconsistent_business_info" || !choice) return card.display.nextStep;
  const noun = FIELD_NOUN[choice.field.field];
  let first: string;
  if (choice.chosen === "other") {
    const all = [...new Set(choice.field.values.flatMap((x) => x.listingIds))].map((id) => listingLabel(state, id));
    first = `Put your correct ${noun} on ${list(all)}.`;
  } else {
    const right = choice.field.values[choice.chosen];
    const wrong = [...new Set(choice.field.values.filter((_, i) => i !== choice.chosen).flatMap((x) => x.listingIds))].map((id) => listingLabel(state, id));
    first = `Change ${list(wrong)} to show “${right.display}”.`;
  }
  // Whatever else the listings check found still needs fixing.
  const kinds = new Set(card.evidence.map((e) => e.reference?.field?.match(/^listings\.(\w+)/)?.[1]).filter((k): k is string => Boolean(k)));
  kinds.delete(choice.field.field);
  const rest = ["hours", "address", "phone", "services"].filter((k) => kinds.has(k)).map((k) => FIELD_NOUN[k]);
  const then = [rest.length ? `show the same ${list(rest)} on every listing` : null, kinds.has("duplicate") ? "merge duplicate listings" : null].filter(Boolean) as string[];
  return then.length ? `${first} Then ${then.join(", and ")}.` : first;
}

export function buildAnswer(
  state: JourneyState,
  questions: JourneyQuestion[],
  answers: Answers,
  now?: Date,
  challenges: OwnerChallenge[] = [],
): Omit<JourneyAnswerResponse, "context" | "ignored"> {
  const applied = applyAnswers(state, questions, answers, challenges);
  const discovery = discover(state, applied.profile, applied.overrides, now);

  // Evidence-backed (or owner-confirmed) problems, minus anything the owner said doesn't happen.
  // (If the owner later describes it in their own words, their words win.)
  const saidSo = (p: ProblemCard) => p.evidence.some((s) => s.reference?.field === "owner.biggestTimeSink");
  const candidates = discovery.problems.filter((p) => p.status !== "hypothesis" && (!applied.denied.has(p.key) || saidSo(p)));
  const primary: ProblemCard[] = [];
  const folded = new Map<string, ProblemCard[]>();
  for (const card of candidates) {
    const lead = primary.find((p) => p.category.key === card.category.key);
    if (lead) folded.set(lead.key, [...(folded.get(lead.key) ?? []), card]);
    else primary.push(card);
  }

  const toOpportunity = (card: ProblemCard, rank: number): Opportunity => {
    const owner = card.evidence.some((s) => s.source === "owner_reported");
    const pub = publicBasis(card);
    const basis: Opportunity["basis"] = owner && pub ? "you_and_public" : owner ? "you" : "public";
    const status: Opportunity["status"] = owner || card.status === "confirmed" ? "confirmed" : "likely";
    const statusLabel = owner ? (pub ? `You confirmed this · ${lower(pub)}` : "You confirmed this") : card.status === "confirmed" ? pub ?? "Seen in public information" : `Likely · ${lower(pub ?? "seen in public information")}`;
    const { items, total } = evidenceItems(card, state);
    return {
      id: card.id,
      problemKey: card.key,
      rank,
      headline: card.display.headline,
      whyItMatters: card.display.whyItMatters,
      status,
      statusLabel,
      basis,
      evidence: items,
      moreEvidence: Math.max(0, total - items.length),
      counterEvidence: card.counterEvidence?.label ?? null,
      fix: { kind: card.display.effort.kind, label: card.display.effort.label, nextStep: nextStepFor(card, applied, state) },
      useCase: card.useCase,
      ...impactView(card, applied.profile, applied.overrides[card.key]),
      alsoCovers: (folded.get(card.key) ?? []).map((f) => ({ problemKey: f.key, headline: f.display.headline })),
    };
  };

  const opportunities = primary.slice(0, MAX_OPPORTUNITIES).map((c, i) => toOpportunity(c, i + 1));
  const brief = (card: ProblemCard, label: string): Brief => ({ problemKey: card.key, headline: card.display.headline, statusLabel: label });
  const alsoNoticed = primary.slice(MAX_OPPORTUNITIES).map((c) => brief(c, toOpportunity(c, 0).statusLabel));
  const toCheck = discovery.problems.filter((p) => applied.unchecked.has(p.key) && p.status === "hypothesis").map((c) => brief(c, "Not checked yet"));

  const followUpIds: string[] = [];
  for (const o of opportunities) for (const id of o.impactNeeds) if (!followUpIds.includes(id)) followUpIds.push(id);
  const followUps = followUpIds.slice(0, MAX_FOLLOW_UPS).map((id) => IMPACT_QUESTIONS.get(id)!);

  // Part 4: only the problems we're focusing on, one per kind of tool.
  const focus = opportunities.map((o) => o.problemKey);
  const focused: DiscoveryResult = { ...discovery, problems: discovery.problems.filter((p) => focus.includes(p.key)) };
  const rec = toRecommendationInput(applied.profile, focused);
  // Challenges outside the problem list that still have a kind of tool go to Part 4 too, in the owner's words.
  if (rec.ok) {
    const used = new Set(rec.request.problems.map((p) => p.useCase));
    for (const ch of challenges) {
      if (ch.problem || !ch.useCase || used.has(ch.useCase) || rec.request.problems.length >= 8) continue;
      used.add(ch.useCase);
      rec.request.problems.push({ id: `owner-${ch.id}`, useCase: ch.useCase, title: ch.title.slice(0, 140), evidence: `The owner told us: “${ch.words.slice(0, 200)}”` });
    }
  }
  const recommendation: JourneyAnswerResponse["recommendation"] = rec.ok
    ? { ready: true, request: rec.request, focus: rec.request.problems.map((p) => p.id.replace(/^problem-/, "") as ProblemKey) }
    : { ready: false, reason: opportunities.some((o) => o.useCase) ? rec.message : "None of the problems we found needs a tool yet. Start with the free fixes above." };

  const name = applied.profile.business.name.value ?? "your business";
  const headline = opportunities.length
    ? `${plural(opportunities.length, "thing")} to focus on at ${name}, most important first.`
    : "We didn't find anything with clear evidence. Tell us what slows you down and we'll take it from there.";

  const sbdc = locationContext(applied.profile.business.address.value).sbdc;
  const county = locationContext(applied.profile.business.address.value).county;
  const localHelp = sbdc && county ? { name: `Maryland SBDC · ${sbdc.name}`, county, url: sbdc.url, phone: sbdc.phone } : null;
  const budget = { value: applied.profile.owner.monthlyBudget.value ?? DEFAULT_BUDGET, assumed: applied.profile.owner.monthlyBudget.source !== "owner" };

  const findings = buildFindings(state, discovery, applied, challenges);
  const found = findings.yours.length + findings.noticed.length;
  const headlineNow = challenges.length
    ? `${plural(findings.yours.length, "thing")} you told us${findings.noticed.length ? `, and ${plural(findings.noticed.length, "more thing")} we noticed` : ""}.`
    : found
      ? headline
      : "We didn't find anything with clear evidence. Tell us what slows you down and we'll take it from there.";

  return { business: businessCard(state, applied.profile), localHelp, budget, headline: headlineNow, opportunities, alsoNoticed, toCheck, followUps, youToldUs: applied.youToldUs, assumptions: applied.assumptions, recommendation, findings };
}

// ---------- Findings: yours, noticed, worth considering ----------

const MAX_NOTICED = 4;
const MAX_CONSIDER = 3;

function aiFor(useCase: UseCase | null, key: ProblemKey | null): Finding["ai"] {
  if (key === "inconsistent_business_info") return { level: "no", how: "Fixing your listings by hand is free and takes about an hour." };
  return useCase ? { level: "yes", how: GUIDES[useCase].whatAiDoes } : null;
}

function buildFindings(state: JourneyState, discovery: DiscoveryResult, applied: Applied, challenges: OwnerChallenge[]): Findings {
  const name = applied.profile.business.name.value ?? "your business";
  const explain = (key: ProblemKey) => PROBLEMS[key].explanation.replaceAll("{name}", name);
  const reviewById = new Map((state.reviewTexts ?? []).map((r) => [r.id, r]));
  const notOwner = (e: EvidenceItem) => e.sourceLabel !== SOURCE_LABEL.owner_reported;

  // 1) What the owner told us, each connected to any public evidence that says the same.
  const yours: Finding[] = challenges.map((ch) => {
    const card = ch.problem ? discovery.problems.find((p) => p.key === ch.problem) ?? null : null;
    const pub = card ? evidenceItems(card, state) : { items: [], total: 0 };
    const fromCard = pub.items.filter(notOwner);
    const fromAi: EvidenceItem[] = ch.reviews.map((r) => {
      const review = reviewById.get(r.reviewId);
      return {
        title: null,
        text: r.quote,
        isQuote: true,
        sourceLabel: [review?.where ?? "Review", review?.author].filter(Boolean).join(" · "),
        url: review?.url ?? null,
        links: review?.url ? [{ label: review.where, url: review.url }] : [],
        observed: true,
      };
    });
    const seen = new Set<string>();
    const evidence = [...fromAi, ...fromCard].filter((e) => {
      const k = e.text.toLowerCase().slice(0, 80);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const reviewCount = new Set([
      ...ch.reviews.map((r) => r.reviewId),
      ...(card?.evidence ?? []).filter((s) => s.verified && s.source.endsWith("_review")).map((s) => s.reference?.reviewId ?? s.id),
    ]).size;
    const otherPublic = card ? publicBasis(card) : null;
    const connection = reviewCount
      ? `This may be bigger than you thought: ${reviewCount === 1 ? "a customer review mentions it too" : `${reviewCount} customer reviews mention it too`}.`
      : otherPublic && card?.evidence.some((s) => s.verified && (s.source === "website" || s.source === "listing" || s.source === "google_profile"))
        ? `Public information backs this up: ${lower(otherPublic)}.`
        : null;
    const impact = card ? impactView(card, applied.profile, applied.overrides[card.key]) : { impact: null, impactNote: null, impactNeeds: [] };
    const useCase = ch.useCase ?? card?.useCase ?? null;
    return {
      id: `yours-${ch.id}`,
      group: "yours",
      // The owner's own framing comes first; the taxonomy only links it to a fix.
      title: ch.from === "picked" && card ? card.display.headline : ch.title,
      ownerWords: ch.words.split(" · "),
      whatsHappening: ch.by === "ai" || !ch.problem ? ch.whatsHappening : explain(ch.problem),
      whyItMatters: ch.whyItMatters ?? card?.display.whyItMatters ?? null,
      connection,
      evidence: evidence.slice(0, 3),
      moreEvidence: Math.max(0, evidence.length - 3) + Math.max(0, pub.total - pub.items.length),
      confidence: connection ? { level: "high", label: "Backed by public information" } : { level: "medium", label: "Not visible in public information" },
      whatToDo: card ? nextStepFor(card, applied, state) : ch.firstStep,
      ai: ch.ai ?? aiFor(useCase, ch.problem),
      problemKey: ch.problem,
      useCase,
      ...impact,
      by: ch.by,
    };
  });

  // 2) What public evidence shows that the owner didn't mention.
  const mentioned = new Set(challenges.map((ch) => ch.problem).filter(Boolean));
  const fromCard = (card: ProblemCard, group: Finding["group"]): Finding => {
    const { items, total } = evidenceItems(card, state);
    const pub = publicBasis(card);
    const confidence: Finding["confidence"] =
      group === "consider"
        ? { level: "low", label: "Common for businesses like yours · we haven't seen evidence for you" }
        : card.status === "confirmed"
          ? { level: "high", label: pub ?? "Seen in public information" }
          : { level: "medium", label: `Likely · ${lower(pub ?? "seen in public information")}` };
    return {
      id: `${group}-${card.key}`,
      group,
      title: card.display.headline,
      ownerWords: [],
      whatsHappening: group === "consider" ? (card.evidence.find((s) => s.source === "industry_pattern")?.observation ?? explain(card.key)) : explain(card.key),
      whyItMatters: card.display.whyItMatters,
      connection: null,
      evidence: group === "consider" ? [] : items.filter(notOwner),
      moreEvidence: group === "consider" ? 0 : Math.max(0, total - items.length),
      confidence,
      whatToDo: nextStepFor(card, applied, state),
      ai: aiFor(card.useCase, card.key),
      problemKey: card.key,
      useCase: card.useCase,
      ...(group === "consider" ? { impact: null, impactNote: null, impactNeeds: [] } : impactView(card, applied.profile, applied.overrides[card.key])),
      by: group === "consider" ? "industry" : "evidence",
    };
  };
  const noticed = discovery.problems
    .filter((p) => p.status !== "hypothesis" && !mentioned.has(p.key) && !applied.denied.has(p.key) && p.evidence.some((s) => s.verified && s.source !== "owner_reported"))
    .slice(0, MAX_NOTICED)
    .map((p) => fromCard(p, "noticed"));
  const shown = new Set([...mentioned, ...noticed.map((f) => f.problemKey)]);
  const consider = discovery.problems
    .filter((p) => !shown.has(p.key) && !applied.denied.has(p.key) && p.status === "hypothesis")
    .slice(0, MAX_CONSIDER)
    .map((p) => fromCard(p, "consider"));

  // 3) What customers already like.
  const strengths = customersSay(state)
    .themes.filter((t) => t.polarity === "praise")
    .map((t) => ({ label: t.label, countLabel: t.countLabel, example: t.example ? { text: t.example.text, who: t.example.who, where: t.example.where, url: t.example.url } : null }));

  return { yours, noticed, consider, strengths, reviewsRead: { count: state.reviews.reviewCount, sources: state.reviews.platforms } };
}

export function startHeadline(base: DiscoveryResult, questions: JourneyQuestion[]): string {
  const n = base.problems.filter((p) => p.status !== "hypothesis").length;
  const core = questions.filter((q) => !q.optional && !q.showIf).length;
  const found = n ? `We found ${plural(n, "thing")} worth a look in public information.` : "Public information didn't show a clear problem yet.";
  return `${found} ${core ? `${plural(core, "quick question")} will sharpen this. You can skip any of them.` : ""}`.trim();
}

export { discover as discoverForJourney };
export type { Answer };
