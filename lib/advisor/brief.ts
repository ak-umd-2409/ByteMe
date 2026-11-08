/**
 * The business brief: everything we know about one business, in a compact shape for the AI.
 * Built only from the owner's journey (what we read in public sources, the problems with their
 * evidence, and what the owner told us). Nothing here is guessed.
 */
import type { JourneyAnswerResponse } from "../journey/types.ts";
import { customersSay, learned, toolsFound } from "../journey/journey.ts";
import type { JourneyState } from "../journey/context.ts";

export interface BusinessBrief {
  name: string;
  /** "HVAC · Jefferson, MD" */
  kind: string;
  website: string | null;
  hours: string | null;
  rating: string | null;
  whatWeRead: string[];
  customersSay: { reviewCount: number; themes: { theme: string; tone: "complaint" | "praise"; howMany: string; example: string | null }[]; note: string | null };
  softwareSeen: string[];
  problems: { headline: string; status: string; whyItMatters: string; evidence: string[]; fix: "free" | "tool"; firstStep: string }[];
  alsoNoticed: string[];
  notConfirmed: string[];
  ownerSaid: { question: string; answer: string }[];
  weAssumed: string[];
  budgetPerMonth: number | null;
  budgetAssumed: boolean;
  usesSoftware: string[];
  wantsSetupHelp: boolean;
  freeLocalHelp: { name: string; phone: string | null } | null;
}

const clip = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function buildBrief(answer: JourneyAnswerResponse, state: JourneyState | null): BusinessBrief {
  const b = answer.business;
  const req = answer.recommendation.ready ? answer.recommendation.request.business : null;
  const say = state ? customersSay(state) : null;
  return {
    name: b.name,
    kind: b.subtitle,
    website: b.website,
    hours: b.hours,
    rating: b.rating ? `${b.rating.value}${b.rating.count ? ` from ${b.rating.count} reviews` : ""} (${b.rating.from})` : null,
    whatWeRead: state ? learned(state).map((l) => clip(l.text, 300)) : [],
    customersSay: say
      ? {
          reviewCount: say.reviewCount,
          themes: say.themes.map((t) => ({ theme: t.label, tone: t.polarity, howMany: t.countLabel, example: t.example ? clip(t.example.text, 200) : null })),
          note: say.note,
        }
      : { reviewCount: 0, themes: [], note: null },
    softwareSeen: state ? toolsFound(state).map((t) => t.name) : [],
    problems: answer.opportunities.map((o) => ({
      headline: o.headline,
      status: o.statusLabel,
      whyItMatters: o.whyItMatters,
      evidence: o.evidence.slice(0, 3).map((e) => clip(`${e.title ?? e.text} (${e.sourceLabel})`)),
      fix: o.fix.kind,
      firstStep: o.fix.nextStep,
    })),
    alsoNoticed: answer.alsoNoticed.map((x) => x.headline),
    notConfirmed: answer.toCheck.map((x) => x.headline),
    ownerSaid: answer.youToldUs.map((y) => ({ question: y.label, answer: y.value })),
    weAssumed: answer.assumptions.map((a) => a.text),
    budgetPerMonth: answer.budget?.value ?? null,
    budgetAssumed: answer.budget?.assumed ?? false,
    usesSoftware: req?.currentTools ?? [],
    wantsSetupHelp: req?.needsHelp ?? false,
    freeLocalHelp: answer.localHelp ? { name: answer.localHelp.name, phone: answer.localHelp.phone } : null,
  };
}
