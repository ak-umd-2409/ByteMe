/**
 * "Your plan": step 8 of the owner journey (spec §5.1 30-day plan, 5.3 help, 5.5 print/email, 5.7 free money).
 *
 * Built only from facts we already hold: the owner's opportunities, the chosen
 * tools' catalog cards and the owner's own answers. Deterministic, no AI, no
 * invented steps. A step that rests on a missing fact says so instead of guessing.
 */
import type { CatalogRecord } from "../catalog/types.ts";
import type { JourneyAnswerResponse, Opportunity } from "../journey/types.ts";
import type { ProblemKey } from "../problems/types.ts";
import resources from "../../data/resources/maryland.json" with { type: "json" };

export interface PlanStep {
  id: string;
  title: string;
  detail: string;
  /** About how long this takes the owner. Null when we don't know. */
  minutes: number | null;
  link: { label: string; url: string } | null;
  /** A rule the step comes from, e.g. Maryland call recording. */
  why: string | null;
  /** Which phase of the 30 days: 1 = Day 1, 2 = Days 2–7, 3 = Week 2, 4 = Weeks 3–4, 5 = after day 30 (see PHASE_LABEL). */
  week: number;
  /** Who does it. */
  who?: Who;
  /** What should be true once it's done, so the owner knows it worked. */
  outcome?: string | null;
}

export type Who = "You" | "You or a staff member" | "You with a helper" | "The vendor" | "Your advisor";

/** Short phase names, by `PlanStep.week`. */
export const PHASE_LABEL = ["", "Day 1", "Days 2–7", "Week 2", "Weeks 3–4", "After day 30"] as const;

export interface PlanSection {
  id: string;
  heading: string;
  /** "Free · this week", "$59 a month · about 30 min to set up" */
  summary: string;
  problem: string | null;
  tool: { id: string; name: string; sample: boolean } | null;
  steps: PlanStep[];
}

export interface PlanWeek {
  week: number;
  /** "Week 1 · days 1–7", "After day 30" */
  label: string;
  /** Known minutes only; steps without a time aren't counted. */
  minutes: number;
  steps: { sectionId: string; stepId: string; title: string; minutes: number | null; tool: string | null }[];
}

export interface Resource {
  id: string;
  name: string;
  kind: "money" | "training" | "local";
  detail: string;
  url: string;
  /** Where we found the link, so anyone can check it. */
  foundVia: string;
}

export interface Plan {
  business: string;
  sections: PlanSection[];
  /** The same steps by week, for the 30-day view (spec §5.1). */
  weeks: PlanWeek[];
  totals: { monthly: number; setupMinutes: number; unknownPrices: number };
  help: { name: string; detail: string; url: string; phone: string | null }[];
  /** Free money and training (spec §5.7). Real links only, checked on `resourcesChecked`. */
  resources: Resource[];
  resourcesChecked: string;
  notes: string[];
  /** When there's more than one tool: the order to set them up in, and why. Null otherwise. */
  order: string | null;
}

/** A challenge outside the problem list (the owner's own, or one customers raise in reviews). */
export interface PlanExtra {
  /** The id Part 4 used for it (e.g. "owner-c1"), so a chosen tool can be found; or a local id. */
  key: string;
  heading: string;
  /** The free first step. */
  firstStep: string | null;
  /** How AI could help, when it can. */
  aiHow: string | null;
}

export interface PlanInput {
  answer: Pick<JourneyAnswerResponse, "opportunities" | "localHelp" | "youToldUs"> & { business: { name: string } };
  /** Chosen tool per problem key or extra key (catalog ids). Missing = decide later. */
  choices: Partial<Record<ProblemKey, string>> & Record<string, string | undefined>;
  /** The owner's other challenges and problems from reviews, so the plan covers everything they care about. */
  extras?: PlanExtra[];
  catalog: CatalogRecord[];
  currentTools: string[];
  /** The owner asked for help setting tools up. False = they'll do it themselves. */
  needsHelp?: boolean;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const SBDC = "https://www.marylandsbdc.org/";
const SCORE = "https://www.score.org/find-mentor";
const RECORDING_LAW = "https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=gcj&section=10-402";

/** What the owner told us that a "did it work?" check can compare against. */
function baseline(o: Opportunity): string | null {
  const own = o.impact?.yourNumbers ?? [];
  const n = own.find((x) => x.unit === "per_week" || x.unit === "per_month" || x.unit === "hours_per_week");
  if (!n) return null;
  const unit = n.unit === "per_week" ? "a week" : n.unit === "per_month" ? "a month" : "hours a week";
  return `${n.label.toLowerCase()}: ${n.value} ${unit}`;
}

function freeSection(o: Opportunity): PlanSection {
  const links = o.evidence.flatMap((e) => e.links).filter((l): l is { label: string; url: string } => Boolean(l.url));
  const unique = [...new Map(links.map((l) => [l.url, l])).values()].slice(0, 6);
  // The time shown is the sum of the steps below, so the two never disagree.
  const known = unique.length * 10;
  return {
    id: `free-${o.problemKey}`,
    heading: o.headline,
    summary: known ? `Free · about ${known} min` : "Free · this week",
    problem: o.headline,
    tool: null,
    steps: [
      { id: `${o.problemKey}-do`, title: o.fix.nextStep.replace(/\.$/, ""), detail: "Free. No tool needed.", minutes: null, link: null, why: null, week: 1, who: "You" as Who, outcome: null },
      ...unique.map((l, i) => ({ id: `${o.problemKey}-l${i}`, title: `Update ${l.label.replace(/^Your website$/, "your website")}`, detail: "Sign in to this listing and change the details to match.", minutes: 10, link: { label: `Open ${l.label}`, url: l.url }, why: null, week: 1, who: "You or a staff member" as Who, outcome: `${l.label} shows the same details as everywhere else.` })),
    ],
  };
}

/** What to have to hand before signing up, from the tool's own card. */
function haveReady(r: CatalogRecord, currentTools: string[]): string {
  const mine = r.worksWith.filter((w) => w.type !== "none" && currentTools.some((x) => same(x, w.product))).map((w) => w.product);
  const byUse: Partial<Record<string, string>> = {
    "missed-calls": "your business hours and the 5 questions callers ask most",
    booking: "your services, how long each takes, and your hours",
    "customer-messaging": "answers to your most common questions",
    reviews: "recent happy customers' emails or phone numbers",
    "email-marketing": "your customer email list (only people who agreed to hear from you)",
    quotes: "your price list or a past quote to copy",
    "admin-paperwork": "one task you repeat every week, to try it on",
    marketing: "a few past posts, or your menu or service list",
    "website-seo": "your website login",
  };
  const items = ["a card for billing", byUse[r.useCases[0] ?? ""] ?? null, mine.length ? `your ${mine.join(" and ")} login` : null];
  return items.filter(Boolean).join(", ");
}

/** How to test that setup worked, by what the tool is for. */
function testLine(r: CatalogRecord): string {
  const byUse: Partial<Record<string, string>> = {
    "missed-calls": "Test: call your business number from another phone after hours. It should answer and take a message.",
    booking: "Test: book a pretend appointment yourself. It should land on your calendar with a confirmation.",
    "customer-messaging": "Test: ask it one of your common questions from your phone. The answer should be right.",
    reviews: "Test: send a review request to yourself. It should arrive and link to your listing.",
    "email-marketing": "Test: send a test email to yourself. It should look right on your phone.",
    quotes: "Test: make a quote for a past job. The numbers should match what you charged.",
    "admin-paperwork": "Test: do one real weekly task with it and time it.",
    marketing: "Test: write one real post with it and check it sounds like you.",
    "website-seo": "Test: run its first report on your website.",
  };
  return byUse[r.useCases[0] ?? ""] ?? "Test: try it once on a real task.";
}

function toolSection(o: Opportunity, r: CatalogRecord, currentTools: string[], needsHelp = true): PlanSection {
  const steps: PlanStep[] = [];
  const price = r.pricing.small.monthlyUsd;
  const site = r.sample ? null : { label: `${r.name} official site`, url: r.vendor.website };

  // 1 · Sign up on the right plan.
  steps.push({
    id: `${r.id}-signup`,
    title: r.existingProduct && currentTools.some((x) => same(x, r.existingProduct!)) ? `Turn it on in your ${r.existingProduct}` : `Sign up with ${r.vendor.company}`,
    detail:
      price === "unknown"
        ? "Their price isn't public. Ask for it in writing before you start."
        : `${r.pricing.freeTier === true ? "There's a free plan to try first. " : ""}Pick the ${r.pricing.small.note ? r.pricing.small.note.replace(/\.$/, "").toLowerCase() : "smallest plan"}: ${usd(price)} a month${r.pricing.contract === "annual" ? ", yearly contract" : r.pricing.contract === "monthly" ? ", cancel any month" : ""}. Have ready: ${haveReady(r, currentTools)}.`,
    minutes: 10,
    link: r.sample ? null : r.pricing.pricingUrl ? { label: "Prices and sign-up", url: r.pricing.pricingUrl } : site,
    why: null,
    week: 1,
    who: "You",
    outcome: `you have an account with ${r.name} on the smallest plan that does the job.`,
  });

  // 2 · Connect it to what the owner already uses (the vendor's connection, not ours).
  const mine = r.worksWith.filter((w) => w.type !== "none" && currentTools.some((x) => same(x, w.product)));
  if (mine.length)
    steps.push({
      id: `${r.id}-connect`,
      title: `Connect your ${mine.map((w) => w.product).join(" and ")}`,
      detail: mine.some((w) => w.type === "zapier")
        ? "This uses Zapier, a separate service that may have its own cost. The vendor's help pages show the steps."
        : `${r.name} has a built-in connection. Look for "Integrations" in its settings.`,
      minutes: 15,
      link: site ? { label: `${r.name} website`, url: site.url } : null,
      why: null,
      week: 1,
      who: "You",
      outcome: `what happens in ${r.name} shows up in your ${mine.map((w) => w.product).join(" and ")} without retyping.`,
    });

  // 3 · Rules that apply to this tool.
  if (r.rulesFlags.recordsCalls === true)
    steps.push({
      id: `${r.id}-recording`,
      title: "Keep the recording announcement on",
      detail:
        r.rulesFlags.announcesRecording === true
          ? "It tells callers they're recorded. Leave that setting on."
          : "We couldn't confirm it tells callers they're recorded. Turn on an announcement or turn recording off.",
      minutes: 5,
      link: { label: "Maryland law", url: RECORDING_LAW },
      why: "Maryland requires everyone on a call to agree to recording. Not legal advice: ask your SBDC advisor.",
      week: 1,
      who: "You",
      outcome: "a test call to your own number plays the recording notice first.",
    });
  if (r.rulesFlags.outboundAiCalls === true)
    steps.push({
      id: `${r.id}-outbound`,
      title: "Only let it call people who agreed",
      detail: "AI voices on outbound calls need the person's prior consent under federal rules.",
      minutes: null,
      link: null,
      why: "FCC ruling, Feb 2024.",
      week: 1,
      who: "You",
      outcome: "outbound AI calls are off, or only go to people who said yes.",
    });

  // 4 · Set it up.
  steps.push({
    id: `${r.id}-setup`,
    title: r.setupMode === "needs_help" && needsHelp ? "Book help to set it up" : "Set it up",
    detail:
      r.setupMinutes === "unknown"
        ? `The vendor doesn't say how long setup takes.${r.setupMode === "needs_help" && !needsHelp ? " It's easier with help, so if you get stuck, your free SBDC advisor can sit with you." : ""}`
        : `About ${r.setupMinutes} minutes${r.setupMode === "needs_help" ? ", best done with someone who has set it up before" : " on your own"}.`,
    minutes: r.setupMinutes === "unknown" ? null : r.setupMinutes,
    link: null,
    why: null,
    week: 1,
    who: r.setupMode === "needs_help" && needsHelp ? "You with a helper" : "You",
    outcome: testLine(r),
  });

  // 5 · Check it worked, against the owner's own number when we have one.
  const base = baseline(o);
  steps.push({
    id: `${r.id}-check`,
    title: "Check it worked after 2 weeks",
    detail: base ? `Compare with what you told us (${base}). If nothing changed, cancel before the next bill.` : "Look at whether the problem got smaller. If not, cancel before the next bill.",
    minutes: 10,
    link: null,
    why: null,
    week: 1,
    who: "You",
    outcome: "you know whether to keep paying for it.",
  });

  return {
    id: `tool-${o.problemKey}`,
    heading: o.headline,
    summary: [price === "unknown" ? "Price not public" : `${usd(price)} a month`, r.setupMinutes === "unknown" ? null : `about ${r.setupMinutes} min to set up`].filter(Boolean).join(" · "),
    problem: o.headline,
    tool: { id: r.id, name: r.name, sample: Boolean(r.sample) },
    steps,
  };
}

/**
 * Spread the work over 30 days in four phases: Day 1 (free fixes that take under an hour),
 * Days 2–7 (the first tool), Week 2 (the second), Weeks 3–4 (a third, and checking the first two).
 * One tool at a time, so the owner can tell which one helped; each is checked about two weeks
 * after it's set up. Anything that doesn't fit lands in "After day 30" rather than crowding a phase.
 */
function schedule(sections: PlanSection[]): PlanWeek[] {
  let toolIndex = 0;
  for (const sec of sections) {
    if (!sec.tool) {
      const known = sec.steps.reduce((n, st) => n + (st.minutes ?? 0), 0);
      const quickFree = sec.id.startsWith("free-") && known <= 60;
      for (const st of sec.steps) st.week = quickFree ? 1 : 2;
      continue;
    }
    const start = Math.min(5, 2 + toolIndex++);
    for (const st of sec.steps) st.week = st.id.endsWith("-check") ? Math.min(5, Math.max(4, start + 2)) : start;
  }
  const weeks: PlanWeek[] = [];
  for (let w = 1; w <= 5; w++) {
    const steps = sections.flatMap((sec) =>
      sec.steps.filter((st) => st.week === w).map((st) => ({ sectionId: sec.id, stepId: st.id, title: st.title, minutes: st.minutes, tool: sec.tool?.name ?? null })),
    );
    if (steps.length || w <= 4) weeks.push({ week: w, label: PHASE_LABEL[w]!, minutes: steps.reduce((n, st) => n + (st.minutes ?? 0), 0), steps });
  }
  // Drop empty phases at the end (nothing to do yet is not a phase to show).
  while (weeks.length && !weeks[weeks.length - 1]!.steps.length) weeks.pop();
  return weeks;
}

/** The order to set tools up in, and why, when there's more than one. */
function orderNote(sections: PlanSection[]): string | null {
  const tools = sections.filter((s) => s.tool);
  if (tools.length < 2) return null;
  const when = ["in days 2–7", "in week 2", "in weeks 3–4", "after day 30"];
  const parts = tools.map((s, i) => `${s.tool!.name} ${when[Math.min(i, 3)]}`);
  return `Set up one tool at a time: ${parts.join(", then ")}. ${tools[0]!.tool!.name} goes first because it's for your most important problem. Spacing them out lets you see which one is helping before you pay for the next.`;
}

/** Free money and training for this county (spec §5.7). Statewide ones first. */
export function resourcesFor(county: string | null): Resource[] {
  return resources.resources
    .filter((r) => r.counties === "all" || (county !== null && (r.counties as string[]).some((c) => same(c, county))))
    .map(({ id, name, kind, detail, url, foundVia }) => ({ id, name, kind: kind as Resource["kind"], detail, url, foundVia }));
}

export function buildPlan(input: PlanInput): Plan {
  const { answer, choices, catalog, currentTools } = input;
  const byId = new Map(catalog.map((r) => [r.id, r]));
  const sections: PlanSection[] = [];
  const notes: string[] = [];

  // Free fixes first: they cost nothing and help right away.
  for (const o of answer.opportunities.filter((x) => x.fix.kind === "free")) sections.push(freeSection(o));

  for (const o of answer.opportunities.filter((x) => x.fix.kind !== "free")) {
    const id = choices[o.problemKey];
    const r = id ? byId.get(id) : undefined;
    if (!r) {
      sections.push({
        id: `later-${o.problemKey}`,
        heading: o.headline,
        summary: "Free to start · no tool yet",
        problem: o.headline,
        tool: null,
        steps: [{ id: `${o.problemKey}-first`, title: o.fix.nextStep.replace(/\.$/, ""), detail: "You can do this yourself. Pick a tool later if you still need one.", minutes: null, link: null, why: null, week: 1, who: "You" }],
      });
      continue;
    }
    if (r.badge !== "verified") {
      notes.push(`${r.name} isn't Verified, so it isn't in your plan.`);
      continue;
    }
    if (r.sample) notes.push(`${r.name} is a sample tool for the demo: you can't sign up for it.`);
    sections.push(toolSection(o, r, currentTools, input.needsHelp ?? true));
  }

  // Everything else the owner told us (and problems from reviews): a free first step, or the tool they picked.
  for (const x of input.extras ?? []) {
    const r = choices[x.key] ? byId.get(choices[x.key]!) : undefined;
    if (r && r.badge === "verified") {
      const pseudo = { problemKey: x.key, headline: x.heading, impact: null } as unknown as Opportunity;
      sections.push(toolSection(pseudo, r, currentTools, input.needsHelp ?? true));
      continue;
    }
    if (!x.firstStep) continue;
    sections.push({
      id: `own-${x.key}`,
      heading: x.heading,
      summary: "Free to start",
      problem: x.heading,
      tool: null,
      steps: [
        { id: `${x.key}-first`, title: x.firstStep.replace(/\.$/, ""), detail: x.aiHow ? `Later, AI could help: ${x.aiHow}` : "You can do this yourself.", minutes: null, link: null, why: null, week: 2, who: "You" },
      ],
    });
  }

  const tools = sections.map((s) => s.tool && byId.get(s.tool.id)).filter((r): r is CatalogRecord => Boolean(r));
  const prices = tools.map((r) => r.pricing.small.monthlyUsd);
  const help = [
    answer.localHelp
      ? { name: answer.localHelp.name, detail: `Free advising for ${answer.localHelp.county} County businesses, including help choosing and setting up tools.`, url: answer.localHelp.url, phone: answer.localHelp.phone }
      : { name: "Maryland SBDC", detail: "Free advising for Maryland small businesses.", url: SBDC, phone: null },
    { name: "SCORE mentor", detail: "Free one-on-one help from an experienced business owner.", url: SCORE, phone: null },
  ];
  const weeks = schedule(sections);
  return {
    business: answer.business.name,
    sections,
    weeks,
    totals: {
      monthly: prices.reduce<number>((n, p) => n + (p === "unknown" ? 0 : p), 0),
      setupMinutes: tools.reduce((n, r) => n + (r.setupMinutes === "unknown" ? 0 : r.setupMinutes), 0),
      unknownPrices: prices.filter((p) => p === "unknown").length,
    },
    help,
    resources: resourcesFor(answer.localHelp?.county ?? null),
    resourcesChecked: resources.checked,
    notes,
    order: orderNote(sections),
  };
}

/**
 * The plan as short plain text, for an email body (spec §5.5). Mail apps cut long
 * mailto links, so this lists the weeks and steps only, plus a link to the full plan.
 */
export function planText(plan: Plan, link: string | null): string {
  const lines = [`My MainStreet AI plan for ${plan.business}`, ""];
  for (const w of plan.weeks) {
    lines.push(`${w.label}${w.minutes ? ` (about ${w.minutes} min)` : ""}`);
    for (const st of w.steps) lines.push(`- ${st.tool ? `${st.tool}: ` : ""}${st.title}`);
    lines.push("");
  }
  if (plan.totals.monthly > 0) lines.push(`Tools: ${usd(plan.totals.monthly)} a month${plan.totals.unknownPrices ? " plus prices that aren't public" : ""}.`);
  lines.push(`Free help: ${plan.help.map((h) => `${h.name}${h.phone ? ` (${h.phone})` : ""}`).join(", ")}.`);
  if (link) lines.push("", `Full plan: ${link}`);
  return lines.join("\n");
}
