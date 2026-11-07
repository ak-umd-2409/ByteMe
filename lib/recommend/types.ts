export type UseCase =
  | "missed-calls"
  | "quotes"
  | "reviews"
  | "booking"
  | "marketing"
  | "bookkeeping";
export type ToolStatus = "verified" | "listed" | "blocked";
export type IntegrationKind = "native" | "via-zapier";
export type RecommendationKind =
  "already-have" | "quick-fix" | "starter-kit" | "lowest-cost" | "done-for-you";

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
  why: string;
  badges: string[];
}

export interface Recommendation {
  kind: RecommendationKind;
  title: string;
  description: string;
  choices: ToolChoice[];
  monthlyPrice: number;
  note?: string;
  helpUrl?: string;
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
  problems: ProblemRecommendations[];
  comparison: ToolChoice[];
}
