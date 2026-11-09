/**
 * "Send my plan to my SBDC advisor" (spec §5.4): what the advisor sees before meeting
 * the owner. A summary of the business, the problems with their evidence, what the
 * owner told us, the 30-day plan and a short list of things worth talking through.
 *
 * Nothing new is computed here: it's the owner's own journey result and plan, rebuilt
 * on the server from the signed journey context, so a shared link can't be edited
 * to show a different plan.
 */
import type { CatalogRecord } from "../catalog/types.ts";
import type { BusinessCard, JourneyAnswerResponse } from "../journey/types.ts";
import type { ProblemKey } from "../problems/types.ts";
import { readyContent, type ReadyText } from "./content.ts";
import { buildPlan, type Plan } from "./plan.ts";
import { costSummary } from "./roi.ts";

/** What a share link stores. Small on purpose: the plan is rebuilt from it. */
export interface SavedShare {
  v: 1;
  context: string;
  choices: Partial<Record<ProblemKey, string>>;
  currentTools: string[];
  createdAt: string;
}

export interface AdvisorView {
  business: Pick<BusinessCard, "name" | "subtitle" | "address" | "phone" | "website" | "hours">;
  createdAt: string;
  /** When a saved link stops working. Null for a link that carries the plan itself. */
  expiresAt: string | null;
  problems: {
    headline: string;
    statusLabel: string;
    whyItMatters: string;
    evidence: { text: string; isQuote: boolean; sourceLabel: string; url: string | null }[];
    impact: { label: string; math: string } | null;
  }[];
  youToldUs: { label: string; value: string }[];
  assumptions: string[];
  plan: Plan;
  content: ReadyText[];
  /** Short, factual prompts for the meeting: open decisions, rules, unknowns. */
  talkAbout: string[];
  /** The chosen tools' labelled prices and totals. No payback: that rests on the owner's own numbers. */
  costs: ReturnType<typeof costSummary>;
}

export const SHARE_DAYS = 30;

export function advisorView(answer: JourneyAnswerResponse, saved: SavedShare, catalog: CatalogRecord[], stored: boolean): AdvisorView {
  const plan = buildPlan({ answer, choices: saved.choices, catalog, currentTools: saved.currentTools });
  const byId = new Map(catalog.map((r) => [r.id, r]));
  const talkAbout: string[] = [];
  for (const sec of plan.sections) {
    const r = sec.tool ? byId.get(sec.tool.id) : undefined;
    if (!sec.tool) {
      if (sec.summary === "Decide later") talkAbout.push(`Whether a tool is worth it for: ${sec.heading.toLowerCase()}.`);
      continue;
    }
    if (!r) continue;
    if (r.sample) talkAbout.push(`${r.name} is a sample tool from the demo, not a real product. Help the owner find a real one.`);
    if (r.pricing.small.monthlyUsd === "unknown") talkAbout.push(`${r.name}'s price isn't public. Ask for it in writing.`);
    if (r.setupMode === "needs_help") talkAbout.push(`${r.name} is best set up with help.`);
    if (r.rulesFlags.recordsCalls === true) talkAbout.push(`${r.name} records calls: Maryland needs every caller's consent.`);
    if (r.rulesFlags.outboundAiCalls === true) talkAbout.push(`${r.name} can make AI calls: only to people who agreed first.`);
  }
  for (const o of answer.opportunities) if (o.status === "unverified") talkAbout.push(`We couldn't confirm "${o.headline.toLowerCase()}". Worth checking with the owner.`);

  const b = answer.business;
  return {
    business: { name: b.name, subtitle: b.subtitle, address: b.address, phone: b.phone, website: b.website, hours: b.hours },
    createdAt: saved.createdAt,
    expiresAt: stored ? new Date(Date.parse(saved.createdAt) + SHARE_DAYS * 86_400_000).toISOString() : null,
    problems: answer.opportunities.map((o) => ({
      headline: o.headline,
      statusLabel: o.statusLabel,
      whyItMatters: o.whyItMatters,
      evidence: o.evidence.map((e) => ({ text: e.title ?? e.text, isQuote: e.title ? false : e.isQuote, sourceLabel: e.sourceLabel, url: e.url })),
      impact: o.impact ? { label: o.impact.label, math: o.impact.math } : null,
    })),
    youToldUs: answer.youToldUs.map(({ label, value }) => ({ label, value })),
    assumptions: answer.assumptions.map((a) => a.text),
    plan,
    content: readyContent(b, plan, catalog),
    talkAbout: [...new Set(talkAbout)],
    costs: costSummary(plan, catalog),
  };
}

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");

/** A link that carries the share itself (used when the site has no saved storage). */
export function encodeShareLink(saved: SavedShare): string {
  return `p1.${b64url(JSON.stringify(saved))}`;
}

export function decodeShareLink(link: string): SavedShare | null {
  const raw = link.replace(/^#/, "").replace(/^p=/, "");
  if (!raw.startsWith("p1.")) return null;
  try {
    return parseSaved(JSON.parse(Buffer.from(raw.slice(3), "base64url").toString("utf8")));
  } catch {
    return null;
  }
}

/** Accept only the shape we write. Anything else is treated as a broken link. */
export function parseSaved(value: unknown): SavedShare | null {
  if (!value || typeof value !== "object") return null;
  const x = value as Record<string, unknown>;
  if (x.v !== 1 || typeof x.context !== "string" || typeof x.createdAt !== "string" || Number.isNaN(Date.parse(x.createdAt))) return null;
  const choices = x.choices && typeof x.choices === "object" ? (x.choices as Record<string, unknown>) : {};
  const tools = Array.isArray(x.currentTools) ? x.currentTools : [];
  return {
    v: 1,
    context: x.context,
    choices: Object.fromEntries(Object.entries(choices).filter(([k, val]) => /^[a-z_]{1,40}$/.test(k) && typeof val === "string" && /^[a-z0-9-]{1,80}$/.test(val))) as SavedShare["choices"],
    currentTools: tools.filter((t): t is string => typeof t === "string" && t.length <= 80).slice(0, 30),
    createdAt: x.createdAt,
  };
}
