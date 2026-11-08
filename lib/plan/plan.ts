/**
 * "Your plan": step 8 of the owner journey (spec §5.1, 5.2, 5.5).
 *
 * Built only from facts we already hold: the owner's opportunities, the chosen
 * tools' catalog cards and the owner's own answers. Deterministic, no AI, no
 * invented steps. A step that rests on a missing fact says so instead of guessing.
 */
import type { CatalogRecord } from "../catalog/types.ts";
import type { JourneyAnswerResponse, Opportunity } from "../journey/types.ts";
import type { ProblemKey } from "../problems/types.ts";

export interface PlanStep {
  id: string;
  title: string;
  detail: string;
  /** About how long this takes the owner. Null when we don't know. */
  minutes: number | null;
  link: { label: string; url: string } | null;
  /** A rule the step comes from, e.g. Maryland call recording. */
  why: string | null;
}

export interface PlanSection {
  id: string;
  heading: string;
  /** "Free · this week", "$59 a month · about 30 min to set up" */
  summary: string;
  problem: string | null;
  tool: { id: string; name: string; sample: boolean } | null;
  steps: PlanStep[];
}

export interface Plan {
  business: string;
  sections: PlanSection[];
  totals: { monthly: number; setupMinutes: number; unknownPrices: number };
  help: { name: string; detail: string; url: string; phone: string | null }[];
  notes: string[];
}

export interface PlanInput {
  answer: Pick<JourneyAnswerResponse, "opportunities" | "localHelp" | "youToldUs"> & { business: { name: string } };
  /** Chosen tool per problem key (catalog ids). Missing = decide later. */
  choices: Partial<Record<ProblemKey, string>>;
  catalog: CatalogRecord[];
  currentTools: string[];
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
  return {
    id: `free-${o.problemKey}`,
    heading: o.headline,
    summary: `Free · ${o.fix.label.replace(/^Free\s*·?\s*/i, "") || "this week"}`,
    problem: o.headline,
    tool: null,
    steps: [
      { id: `${o.problemKey}-do`, title: "Do this", detail: o.fix.nextStep, minutes: null, link: null, why: null },
      ...unique.map((l, i) => ({ id: `${o.problemKey}-l${i}`, title: `Update ${l.label.replace(/^Your website$/, "your website")}`, detail: "Sign in to this listing and change the details to match.", minutes: 10, link: { label: `Open ${l.label}`, url: l.url }, why: null })),
    ],
  };
}

function toolSection(o: Opportunity, r: CatalogRecord, currentTools: string[]): PlanSection {
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
        : `${r.pricing.freeTier === true ? "There's a free plan to try first. " : ""}Start small: ${usd(price)} a month${r.pricing.small.note ? ` (${r.pricing.small.note.replace(/\.$/, "").toLowerCase()})` : ""}${r.pricing.contract === "annual" ? ", yearly contract" : r.pricing.contract === "monthly" ? ", cancel any month" : ""}.`,
    minutes: 10,
    link: r.sample ? null : r.pricing.pricingUrl ? { label: "Prices", url: r.pricing.pricingUrl } : site,
    why: null,
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
      link: null,
      why: null,
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
    });
  if (r.rulesFlags.outboundAiCalls === true)
    steps.push({
      id: `${r.id}-outbound`,
      title: "Only let it call people who agreed",
      detail: "AI voices on outbound calls need the person's prior consent under federal rules.",
      minutes: null,
      link: null,
      why: "FCC ruling, Feb 2024.",
    });

  // 4 · Set it up.
  steps.push({
    id: `${r.id}-setup`,
    title: r.setupMode === "needs_help" ? "Book help to set it up" : "Set it up",
    detail:
      r.setupMinutes === "unknown"
        ? "The vendor doesn't say how long setup takes."
        : `About ${r.setupMinutes} minutes${r.setupMode === "needs_help" ? ", best done with someone who has set it up before" : " on your own"}.`,
    minutes: r.setupMinutes === "unknown" ? null : r.setupMinutes,
    link: null,
    why: null,
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
        summary: "Decide later",
        problem: o.headline,
        tool: null,
        steps: [{ id: `${o.problemKey}-first`, title: "Start without a tool", detail: o.fix.nextStep, minutes: null, link: null, why: null }],
      });
      continue;
    }
    if (r.badge !== "verified") {
      notes.push(`${r.name} isn't Verified, so it isn't in your plan.`);
      continue;
    }
    if (r.sample) notes.push(`${r.name} is a sample tool for the demo: you can't sign up for it.`);
    sections.push(toolSection(o, r, currentTools));
  }

  const tools = sections.map((s) => s.tool && byId.get(s.tool.id)).filter((r): r is CatalogRecord => Boolean(r));
  const prices = tools.map((r) => r.pricing.small.monthlyUsd);
  const help = [
    answer.localHelp
      ? { name: answer.localHelp.name, detail: `Free advising for ${answer.localHelp.county} County businesses, including help choosing and setting up tools.`, url: answer.localHelp.url, phone: answer.localHelp.phone }
      : { name: "Maryland SBDC", detail: "Free advising for Maryland small businesses.", url: SBDC, phone: null },
    { name: "SCORE mentor", detail: "Free one-on-one help from an experienced business owner.", url: SCORE, phone: null },
  ];
  return {
    business: answer.business.name,
    sections,
    totals: {
      monthly: prices.reduce<number>((n, p) => n + (p === "unknown" ? 0 : p), 0),
      setupMinutes: tools.reduce((n, r) => n + (r.setupMinutes === "unknown" ? 0 : r.setupMinutes), 0),
      unknownPrices: prices.filter((p) => p === "unknown").length,
    },
    help,
    notes,
  };
}
