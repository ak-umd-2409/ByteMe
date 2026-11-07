/**
 * Spec 2.8 — "Rules that apply to you". The rules are DATA: to add a state, add rows.
 * Each row says, in plain English, what the rule means for choosing AI tools, who it applies to,
 * and links the source. The recommendation engine (lib/recommend/engine.ts) enforces the matching
 * checks when it filters tools; this table explains them to the owner.
 *
 * Checked 2026-11-07. Not legal advice.
 */
import type { IndustryKey } from "../business/types.ts";

export type RuleStatus = "applies" | "may_apply" | "not_applicable";

export interface RuleContext {
  stateCode: string | null;
  industry: IndustryKey | null;
  handlesHealthData: boolean | null;
  handlesLargeCustomerList: boolean | null;
  hasOutboundCallConsent: boolean | null;
  /** Problems found that point toward phone tools (e.g. missed calls). */
  phoneToolsLikely: boolean;
}

export interface RuleRow {
  id: string;
  /** Which states it covers; "US" = federal. */
  jurisdiction: "MD" | "US";
  title: string;
  /** What it means for picking AI tools, in one or two plain sentences. */
  plain: string;
  /** What we do about it when recommending. */
  effect: string;
  source: { label: string; url: string };
  effective: string;
  status: (ctx: RuleContext) => { status: RuleStatus; why: string };
}

/** Same food businesses the recommendation engine treats as food (engine.ts isFood). */
const FOOD: IndustryKey[] = ["restaurant", "cafe"];
const HEALTH: IndustryKey[] = ["health_clinic"];

export const RULES: RuleRow[] = [
  {
    id: "md-call-recording",
    jurisdiction: "MD",
    title: "Everyone on a call must agree to recording",
    plain: "Maryland is an all-party consent state. If an AI receptionist records calls, it has to tell callers and get their consent at the start.",
    effect: "We only suggest phone tools that announce recording, and none that record if you've said no recording.",
    source: { label: "Md. Code, Cts. & Jud. Proc. § 10-402(c)(3)", url: "https://mgaleg.maryland.gov/2026RS/Statute_Web/gcj/10-402.pdf" },
    effective: "In force",
    status: (c) =>
      c.stateCode !== "MD"
        ? { status: "not_applicable", why: "Your business isn't in Maryland." }
        : c.phoneToolsLikely
          ? { status: "applies", why: "Your top problems point to phone tools, and many of them record calls." }
          : { status: "may_apply", why: "Applies if you use an AI tool that answers or records calls." },
  },
  {
    id: "us-ai-voice-calls",
    jurisdiction: "US",
    title: "AI can't call customers without their permission",
    plain: "Under the FCC's 2024 ruling, calls that use an AI-generated voice count as artificial-voice calls. You need the person's prior consent before an AI calls them.",
    effect: "We hide tools that make outbound AI calls unless you've told us you have a consent process.",
    source: { label: "FCC Declaratory Ruling, Feb 8, 2024 (TCPA)", url: "https://www.natlawreview.com/article/fcc-issues-declaratory-ruling-tcpa-applies-ai-generated-voice-calls" },
    effective: "Feb 8, 2024",
    status: (c) =>
      c.hasOutboundCallConsent
        ? { status: "applies", why: "You told us you have customers' permission to call; keep records of it." }
        : { status: "may_apply", why: "Applies if you want an AI tool to call customers (reminders, follow-ups)." },
  },
  {
    id: "md-modpa",
    jurisdiction: "MD",
    title: "Extra privacy rules for large customer lists",
    plain: "The Maryland Online Data Privacy Act covers businesses that handle personal data of 35,000+ Maryland consumers a year (data used only to process payments doesn't count). Customers get rights to see, correct and delete their data.",
    effect: "If it applies, we only suggest tools that can delete customer data and collect only what's needed.",
    source: { label: "Maryland Online Data Privacy Act (enforced from Apr 1, 2026)", url: "https://privacylawmap.com/states/maryland" },
    effective: "Oct 1, 2025; enforced from Apr 1, 2026",
    status: (c) =>
      c.stateCode !== "MD"
        ? { status: "not_applicable", why: "Your business isn't in Maryland." }
        : c.handlesLargeCustomerList === true
          ? { status: "applies", why: "You told us you keep a large customer list." }
          : c.handlesLargeCustomerList === false
            ? { status: "not_applicable", why: "You told us your customer list is smaller than that." }
            : { status: "may_apply", why: "Only if you keep data on 35,000+ Maryland customers a year. Most small local businesses don't." },
  },
  {
    id: "md-grocery-pricing",
    jurisdiction: "MD",
    title: "No personalized pricing on groceries",
    plain: "Maryland's Protection From Predatory Pricing Act bars large food retailers (stores of 15,000+ sq ft) and grocery delivery services from using personal data to charge some customers more.",
    effect: "For Maryland food businesses we hide tools that set different prices for different customers.",
    source: { label: "Protection From Predatory Pricing Act (HB 895, 2026)", url: "https://ailawwiki.com/Maryland_AI_Dynamic_Pricing_Act" },
    effective: "Oct 1, 2026",
    status: (c) =>
      c.stateCode !== "MD" || !c.industry || !FOOD.includes(c.industry)
        ? { status: "not_applicable", why: "It only covers food retailers and grocery delivery in Maryland." }
        : { status: "may_apply", why: "Applies to food stores of 15,000+ sq ft and grocery delivery services." },
  },
  {
    id: "us-hipaa",
    jurisdiction: "US",
    title: "Patient information needs a HIPAA-ready tool",
    plain: "If you handle patient health information, any tool that touches it must meet HIPAA and sign a business associate agreement (BAA) with you.",
    effect: "We only suggest tools marked HIPAA-ready that offer a BAA.",
    source: { label: "HHS: HIPAA business associates", url: "https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/business-associates/index.html" },
    effective: "In force",
    status: (c) =>
      c.handlesHealthData === true || (c.industry !== null && HEALTH.includes(c.industry))
        ? { status: "applies", why: "Your business handles health or patient information." }
        : { status: "not_applicable", why: "You don't handle patient health information." },
  },
];

export interface EvaluatedRule {
  id: string;
  jurisdiction: RuleRow["jurisdiction"];
  title: string;
  plain: string;
  effect: string;
  source: RuleRow["source"];
  effective: string;
  status: RuleStatus;
  why: string;
}

export interface RulesReport {
  rules: EvaluatedRule[];
  counts: Record<RuleStatus, number>;
  headline: string;
  checkedAt: string;
  disclaimer: string;
}

const ORDER: Record<RuleStatus, number> = { applies: 0, may_apply: 1, not_applicable: 2 };

export function evaluateRules(ctx: RuleContext): RulesReport {
  const rules = RULES.map(({ status, ...row }) => ({ ...row, ...status(ctx) })).sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const counts = { applies: 0, may_apply: 0, not_applicable: 0 } as Record<RuleStatus, number>;
  for (const r of rules) counts[r.status] += 1;
  const relevant = counts.applies + counts.may_apply;
  return {
    rules,
    counts,
    headline:
      relevant === 0
        ? "No special rules found for the tools we'd suggest"
        : `${relevant} rule${relevant === 1 ? "" : "s"} affect${relevant === 1 ? "s" : ""} which AI tools you can use`,
    checkedAt: "2026-11-07",
    disclaimer: "Not legal advice. Rules change; ask your SBDC advisor or a lawyer before you rely on this.",
  };
}
