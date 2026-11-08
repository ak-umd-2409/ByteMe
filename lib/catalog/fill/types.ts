/**
 * The card fact sheet: what the card-filler read on a tool's own pricing,
 * features, integrations and help pages. See docs/specs/b-real-catalog.md §3.
 */
import type { AiAnswer, PageFact } from "../../safety/types.ts";
import type { ListEntry } from "../list.ts";

export type CardPageKind = "home" | "pricing" | "features" | "integrations" | "help";
export const CARD_PAGE_KINDS: readonly CardPageKind[] = ["home", "pricing", "features", "integrations", "help"];

export type PlanSize = "small" | "medium" | "large";
export type YesNo = "yes" | "no";

export interface WorksWithFact {
  product: string;
  type: "native" | "zapier";
  quote: string;
  pageUrl: string;
}

export interface CardAi {
  /** true only when the AI returned a valid answer. */
  ran: boolean;
  description: AiAnswer<string>;
  /** answer = monthly price in US dollars as text, e.g. "49". */
  plans: Record<PlanSize, AiAnswer<string>>;
  /** The vendor's plan name for each size, e.g. "Starter". "" when unknown. */
  planNotes: Record<PlanSize, string>;
  freeTier: AiAnswer<YesNo>;
  contract: AiAnswer<"monthly" | "annual">;
  cancellation: AiAnswer<string>;
  worksWith: WorksWithFact[];
  /** Only when the page states a time. answer = minutes as text. */
  setupMinutes: AiAnswer<string>;
  setupMode: AiAnswer<"self_serve" | "needs_help">;
  /** answer = comma list, e.g. "English, Spanish". */
  languages: AiAnswer<string>;
  recordsCalls: AiAnswer<YesNo>;
  announcesRecording: AiAnswer<YesNo>;
  hipaaReady: AiAnswer<YesNo>;
  outboundAiCalls: AiAnswer<YesNo>;
  personalizedPricing: AiAnswer<YesNo>;
  sharesOrSells: AiAnswer<YesNo>;
}

export interface CardFacts {
  input: ListEntry;
  /** ISO date (YYYY-MM-DD). */
  collectedAt: string;
  pages: Record<CardPageKind, PageFact>;
  ai: CardAi;
}
