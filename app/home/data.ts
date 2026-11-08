/**
 * Everything the homepage shows that comes from real data, assembled on the server:
 * - a real result for a real Maryland business, from its saved public data (no network call),
 * - checked tools and prices from the live catalog,
 * - a real advisor answer (rules mode, so it's the same every time and costs nothing),
 * - the research quotes and figures (data/research/painpoints.json, each with its source).
 */
import research from "@/data/research/painpoints.json" with { type: "json" };
import { PUBLIC_SNAPSHOTS } from "@/data/real/index.ts";
import { handleAdvisor } from "@/lib/api/advisor.ts";
import { defaultDeps } from "@/lib/api/handlers.ts";
import { handleJourneyAnswer, handleJourneyStart } from "@/lib/api/journey.ts";
import { buildPack, realTools } from "@/lib/advisor/pack.ts";
import { GUIDES } from "@/lib/advisor/knowledge.ts";
import type { AdvisorReply, ToolCard } from "@/lib/advisor/types.ts";
import type { IndustryKey } from "@/lib/business/types.ts";
import type { CatalogRecord } from "@/lib/catalog/types.ts";
import type { JourneyAnswerResponse, JourneyStartResponse } from "@/lib/journey/types.ts";
import { disabledProvider } from "@/lib/llm/client.ts";
import type { UseCase } from "@/lib/recommend/types.ts";

export type Quote = (typeof research.quotes)[number];
export type Figure = (typeof research.figures)[number];

export interface Preview {
  name: string;
  subtitle: string;
  capturedAt: string;
  learned: { text: string; kind: string }[];
  problems: { headline: string; status: string; proof: string; source: string }[];
  fix: { problem: string; proof: string; useCase: UseCase; tool: ToolCard } | null;
}

export interface Example {
  key: string;
  label: string;
  kind: "real" | "illustrative";
  problem: string;
  aiCan: string;
  keepHuman: string;
  tool: ToolCard | null;
  /** Shown when we have no checked tool for this yet. */
  noTool: string | null;
}

const SNAPSHOT_ID = "public-frederick-heating-ac";

async function preview(catalog: CatalogRecord[]): Promise<Preview | null> {
  const api = { ...defaultDeps(), llm: disabledProvider };
  const start = await handleJourneyStart({ placeId: SNAPSHOT_ID }, api);
  if (start.status !== 200) return null;
  const s = start.body as JourneyStartResponse;
  const ans = await handleJourneyAnswer({ context: s.context, answers: {} }, api);
  if (ans.status !== 200) return null;
  const a = ans.body as JourneyAnswerResponse;
  const snap = PUBLIC_SNAPSHOTS.find((x) => x.placeId === SNAPSHOT_ID);
  const problems = a.opportunities.slice(0, 2).map((o) => ({
    headline: o.headline,
    status: o.statusLabel,
    proof: o.evidence[0] ? (o.evidence[0].title ?? o.evidence[0].text) : o.whyItMatters,
    source: o.evidence[0]?.sourceLabel ?? "",
  }));
  // A checked tool for the first problem that has one.
  let fix: Preview["fix"] = null;
  for (const o of a.opportunities) {
    if (!o.useCase) continue;
    const pack = buildPack({ kind: "topic", topics: [o.useCase as UseCase], budget: null, industry: "hvac", toolsNamed: [] }, null, catalog);
    if (pack.tools[0]) {
      fix = { problem: o.headline, proof: o.evidence[0] ? (o.evidence[0].title ?? o.evidence[0].text) : o.whyItMatters, useCase: o.useCase as UseCase, tool: pack.tools[0] };
      break;
    }
  }
  return {
    name: a.business.name,
    subtitle: a.business.subtitle,
    capturedAt: snap?.capturedAt ?? "",
    learned: s.learned.slice(0, 3).map((l) => ({ text: l.text, kind: l.kind })),
    problems,
    fix,
  };
}

const EXAMPLES: { key: string; label: string; industry: IndustryKey; topic: UseCase; problem: string }[] = [
  { key: "restaurant", label: "Restaurant", industry: "restaurant", topic: "missed-calls", problem: "The phone rings all through the dinner rush, and calls go unanswered." },
  { key: "salon", label: "Salon", industry: "salon", topic: "booking", problem: "Booking happens by phone between clients, so openings go unfilled." },
  { key: "retail", label: "Retail shop", industry: "retail", topic: "customer-messaging", problem: "The same questions arrive every day by message and email." },
  { key: "home", label: "Home services", industry: "cleaning", topic: "quotes", problem: "Quotes get written at night, and slow quotes lose jobs." },
];

function examples(catalog: CatalogRecord[], p: Preview | null): Example[] {
  const out: Example[] = [];
  if (p?.fix) {
    // The real finding that has a checked fix, described with that same problem's guide.
    out.push({
      key: "hvac",
      label: "HVAC",
      kind: "real",
      problem: `${p.name}: ${p.fix.problem.toLowerCase()}.`,
      aiCan: GUIDES[p.fix.useCase].whatAiDoes,
      keepHuman: GUIDES[p.fix.useCase].keepHuman,
      tool: p.fix.tool,
      noTool: null,
    });
  }
  for (const e of EXAMPLES) {
    const pack = buildPack({ kind: "topic", topics: [e.topic], budget: null, industry: e.industry, toolsNamed: [] }, null, catalog);
    out.push({
      key: e.key,
      label: e.label,
      kind: "illustrative",
      problem: e.problem,
      aiCan: GUIDES[e.topic].whatAiDoes,
      keepHuman: GUIDES[e.topic].keepHuman,
      tool: pack.tools[0] ?? null,
      noTool: pack.tools[0] ? null : `We haven't checked a tool for this yet. Free first step: ${GUIDES[e.topic].freeFirst.title.toLowerCase()}.`,
    });
  }
  return out;
}

export interface HomeData {
  preview: Preview | null;
  examples: Example[];
  quotes: Quote[];
  figures: Figure[];
  researchChecked: string;
  approved: number;
  advisorSample: { question: string; reply: AdvisorReply } | null;
}

export async function homeData(catalog: CatalogRecord[]): Promise<HomeData> {
  const p = await preview(catalog).catch(() => null);
  const question = "I have $100 a month. What can I realistically do?";
  const res = await handleAdvisor({ message: question, industry: "hvac" }, { api: { ...defaultDeps(), llm: disabledProvider }, catalog, llm: disabledProvider, kv: null }).catch(() => null);
  return {
    preview: p,
    examples: examples(catalog, p),
    quotes: research.quotes,
    figures: research.figures,
    researchChecked: research.checked,
    approved: realTools(catalog).length,
    advisorSample: res && res.status === 200 ? { question, reply: res.body as AdvisorReply } : null,
  };
}
