/** MainStreet Business Advisor: request and reply shapes. See docs/ADVISOR.md. */
import type { IndustryKey } from "../business/types.ts";
import type { UseCase } from "../recommend/types.ts";

export interface AdvisorTurn {
  role: "owner" | "advisor";
  text: string;
}

export interface AdvisorRequest {
  message: string;
  /** The journey context from onboarding (signed when JOURNEY_SECRET is set). Optional: without it the advisor answers in general. */
  context?: string;
  /** For owners who haven't done onboarding: the kind of business they picked. */
  industry?: IndustryKey;
  /** The last few turns, for follow-ups like "how much is that?". */
  history?: AdvisorTurn[];
}

/** What the advisor understood from the question. All rules, no AI. */
export interface Understood {
  kind: "explain" | "budget" | "existing" | "when-not" | "topic" | "general" | "off-topic" | "greeting";
  topics: UseCase[];
  budget: number | null;
  industry: IndustryKey | null;
  /** Software the owner says they use, matched against names we know. */
  toolsNamed: string[];
}

/** The owner's own results, rebuilt from the journey context. */
export interface AdvisorContext {
  business: string;
  industry: IndustryKey | null;
  county: string | null;
  /** Problems that need a tool, in priority order, with the evidence headline. */
  problems: { useCase: UseCase; headline: string }[];
  /** Problems with a free fix (listings, website details): no AI needed, so they come first and get no tool. */
  freeFixes: { headline: string; nextStep: string }[];
  budget: { value: number; assumed: boolean } | null;
  currentTools: string[];
  needsHelp: boolean;
  healthData: boolean;
  help: { name: string; url: string; phone: string | null } | null;
}

export interface ToolCard {
  id: string;
  name: string;
  company: string;
  category: string;
  useCases: UseCase[];
  /** Null when the price isn't public. Never estimated. */
  monthlyUsd: number | null;
  priceNote: string;
  pricingUrl: string;
  officialUrl: string;
  /** Products the owner uses that this tool connects to, and how. */
  worksWithYours: { product: string; how: "built in" | "through Zapier" }[];
  /** Turn on a feature in a tool the owner already pays for. */
  alreadyHave: boolean;
  /** One sentence, from the catalog description. */
  what: string;
  /** Honest caveats: price not public, setup help, who it's built for, Maryland rules. */
  limits: string[];
  trainsOnYourData: string;
  checkedOn: string;
  /** The tool's page in our catalog. */
  detailPath: string;
}

export interface AdvisorReply {
  answer: string;
  freeFirst: { topic: string; title: string; detail: string }[];
  tools: ToolCard[];
  /** Topics we have no checked tool for yet. We say so instead of guessing. */
  noToolYet: string[];
  budgetPlan: { budget: number; picks: { name: string; monthlyUsd: number }[]; total: number; unpriced: string[] } | null;
  notNeeded: string | null;
  nextSteps: string[];
  followUps: string[];
  usedContext: boolean;
  business: string | null;
  mode: "ai" | "rules";
  notice: string | null;
}
