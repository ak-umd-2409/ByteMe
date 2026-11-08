import type { IndustryKey } from "../business/types.ts";

/** The 12 problem types from FEATURE_SPEC. Tools and problems both use these. */
export const USE_CASES = [
  "missed-calls",
  "booking",
  "reviews",
  "marketing",
  "customer-messaging",
  "quotes",
  "bookkeeping",
  "inventory",
  "staff-scheduling",
  "website-seo",
  "email-marketing",
  "admin-paperwork",
] as const;
export type UseCase = (typeof USE_CASES)[number];
export type ToolStatus = "verified" | "listed" | "blocked";
export type IntegrationKind = "native" | "via-zapier";
export type RecommendationKind =
  | "already-have"
  | "quick-fix"
  | "starter-kit"
  | "lowest-cost"
  | "alternative"
  | "done-for-you";

export interface Problem {
  id: string;
  useCase: UseCase;
  title: string;
  evidence: string;
}

export interface BusinessProfile {
  name: string;
  industry: string;
  state: string;
  county: string;
  monthlyBudget: number;
  currentTools: string[];
  needsHelp: boolean;
  handlesHealthData?: boolean;
  handlesLargeCustomerList?: boolean;
  hasOutboundCallConsent?: boolean;
  dealBreakers: Array<"no-recording" | "no-contract" | "spanish" | "offline">;
}

export interface CatalogTool {
  id: string;
  name: string;
  category: string;
  description: string;
  website: string;
  status: ToolStatus;
  reviewedAt?: string;
  useCases: UseCase[];
  /** Industries the vendor is designed for. `any` means a general-purpose tool. */
  industries: (IndustryKey | "any")[];
  monthlyPrice: number;
  pricingNote: string;
  integrations: Record<string, IntegrationKind>;
  existingProduct?: string;
  setupMinutes: number;
  reviewRating?: number;
  reviewCount?: number;
  languages: string[];
  flags: {
    recordsCalls?: boolean;
    announcesRecording?: boolean;
    outboundAICalls?: boolean;
    requiresOutboundConsent?: boolean;
    hipaaReady?: boolean;
    baaAvailable?: boolean;
    personalizesPrices?: boolean;
    dataDeletion?: boolean;
    dataMinimization?: boolean;
    worksOffline?: boolean;
    requiresContract?: boolean;
  };
  privacySummary: string;
  setupSummary: string;
  demoOnly?: boolean;
}

export interface FitScore {
  total: number;
  parts: {
    problem: number;
    integration: number;
    budget: number;
    setup: number;
    reviews: number;
  };
  reasons: string[];
}

export interface ToolChoice {
  tool: CatalogTool;
  score: FitScore;
  /** The job this score was calculated against, especially important inside a kit. */
  fitFor: Pick<Problem, "id" | "useCase" | "title">;
  why: string;
  badges: string[];
  /** Setup conditions the owner must handle before enabling an optional feature. */
  warnings: string[];
}

export interface Recommendation {
  kind: RecommendationKind;
  title: string;
  description: string;
  choices: ToolChoice[];
  monthlyPrice: number;
  note?: string;
  helpUrl?: string;
  /** Starter Kits can be tailored to the business domain or centered on one problem. */
  kitType?: "industry" | "problem";
  kitFor?: string;
}

export interface Exclusion {
  toolId: string;
  toolName: string;
  reason: string;
}

export interface ProblemRecommendations {
  problem: Problem;
  options: Recommendation[];
  excluded: Exclusion[];
}

export interface RecommendationResult {
  forBusiness: string;
  generatedAt: string;
  sampleData: boolean;
  /** Business-domain bundles live here because they are not tied to one problem row. */
  starterKits: Recommendation[];
  problems: ProblemRecommendations[];
  comparison: ToolChoice[];
}
