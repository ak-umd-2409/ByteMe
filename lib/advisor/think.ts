/**
 * AI-first answers. When an AI provider is configured, the model reads the owner's question,
 * the recent conversation, the full business brief and the checked catalog, and writes the
 * answer itself. It recommends tools only by catalog id.
 *
 * What the server checks before an owner sees it:
 * - tool ids must be real, Verified tools that fit this business (others are dropped);
 * - tool cards, prices and links are always built from the catalog, never from model text;
 * - the text may not name a product or company we didn't give it, quote a dollar amount or
 *   percentage that isn't in the facts, or include links (lib/advisor/word.ts outsideFacts);
 * - a budget answer must fit the budget at catalog prices.
 * If any check fails, the caller falls back to the rules answer (compose.ts).
 */
import type { CatalogRecord } from "../catalog/types.ts";
import { llmJson, type LlmProvider } from "../llm/client.ts";
import type { Kv } from "../shared/kv.ts";
import { v } from "../shared/validate.ts";
import type { BusinessBrief } from "./brief.ts";
import { INDUSTRY_LABEL } from "./knowledge.ts";
import { cardFor, eligibleTools, type Pack } from "./pack.ts";
import type { AdvisorContext, AdvisorReply, AdvisorTurn, Understood } from "./types.ts";
import { outsideFacts } from "./word.ts";

const schema = v.object({
  answer: v.string({ min: 20, max: 2_400 }),
  toolIds: v.array(v.string({ max: 80 }), { max: 6 }),
  freeSteps: v.array(v.object({ title: v.string({ min: 3, max: 120 }), detail: v.string({ min: 3, max: 400 }) }), { max: 3 }),
  notNeeded: v.nullable(v.string({ max: 400 })),
  followUps: v.array(v.string({ min: 5, max: 140 }), { max: 3 }),
});

const SYSTEM = [
  "You are the MainStreet AI Business Advisor: a warm, practical advisor for small-business owners who are not technical.",
  "Answer the owner's actual question first, specifically for THEIR business. Use the BUSINESS facts (what we read on their website and listings, what customers say, each problem and its evidence, what the owner told us). Point to the specific fact you are using, e.g. 'your website has no booking link'.",
  "If there is no BUSINESS, answer for the kind of business they named, and suggest they run the free check for a tailored answer.",
  "Recommend tools ONLY from CATALOG, by id in toolIds, and name them exactly as written. Prefer tools that work with software they already use, that fit their budget, and that suit their kind of business. Use only the prices given; if a price is null, say the price isn't public. Never invent tools, prices, features, integrations, statistics, laws or facts about the business. If you don't know, say so.",
  "Put free fixes first when they solve the problem, and say plainly when AI isn't needed. Keep people on anything personal: complaints, prices, regulars.",
  "Maryland: if a tool records calls, every caller must agree, so the recording announcement must be on. Patient health information needs a HIPAA-ready tool. This is not legal advice.",
  "If BUDGET_PLAN is given, keep your picks within budgetPerMonth at catalog prices.",
  "If the question isn't about running their business, steer back kindly in one sentence.",
  "Style: under 200 words, short paragraphs separated by a blank line, plain words, no markdown, no headings, no bullet symbols, no links.",
  'Reply with JSON only: {"answer": string, "toolIds": string[] (0-4, from CATALOG), "freeSteps": [{"title": string, "detail": string}] (0-3), "notNeeded": string or null, "followUps": string[] (2-3 short questions the owner might ask next)}',
].join("\n");

function catalogFacts(tools: CatalogRecord[]) {
  return tools.map((r) => ({
    id: r.id,
    name: r.name,
    company: r.vendor.company,
    kind: r.category,
    helpsWith: r.useCases,
    builtFor: r.industries,
    monthlyUsd: r.pricing.small.monthlyUsd === "unknown" ? null : r.pricing.small.monthlyUsd,
    priceNote: r.pricing.small.note,
    freeTier: r.pricing.freeTier,
    worksWith: r.worksWith.filter((w) => w.type !== "none").map((w) => `${w.product} (${w.type === "native" ? "built in" : "via Zapier"})`),
    insideProduct: r.existingProduct ?? null,
    setup: r.setupMode === "self_serve" ? "set up yourself" : "best with help",
    recordsCalls: r.rulesFlags.recordsCalls,
    hipaaReady: r.rulesFlags.hipaaReady,
    trainsOnYourData: r.privacyCard.trainsOnYourData.answer,
    what: r.description.slice(0, 220),
  }));
}

export async function answerWithAi(
  input: { question: string; history: AdvisorTurn[]; u: Understood; brief: BusinessBrief | null; ctx: AdvisorContext | null; pack: Pack; rules: AdvisorReply },
  deps: { llm: LlmProvider; catalog: CatalogRecord[]; kv?: Kv | null },
): Promise<{ ok: true; reply: AdvisorReply } | { ok: false; reason: string }> {
  const { u, brief, ctx, pack, rules } = input;
  const tools = eligibleTools(deps.catalog, pack.industry, Boolean(ctx?.healthData) || pack.industry === "health_clinic");
  const facts = {
    question: input.question.slice(0, 600),
    conversation: input.history.slice(-6).map((t) => ({ who: t.role, text: t.text.slice(0, 600) })),
    BUSINESS: brief,
    kindOfBusiness: !brief && pack.industry ? INDUSTRY_LABEL[pack.industry] : null,
    BUDGET_PLAN: u.kind === "budget" && pack.budget !== null ? { budgetPerMonth: pack.budget, suggested: rules.budgetPlan } : null,
    likelyRelevantToolIds: pack.tools.map((t) => t.id),
    CATALOG: catalogFacts(tools),
  };
  const user = JSON.stringify(facts);
  const result = await llmJson(deps.llm, schema, { task: "advisor_think", system: SYSTEM, user, maxTokens: 900 }, { ttlMs: 7 * 24 * 3_600_000, kv: deps.kv });
  if (!result.ok) return { ok: false, reason: result.reason };
  const out = result.value;

  // Tools: only real ids we offered; also pick up any offered tool the text names but forgot to list.
  const byId = new Map(tools.map((r) => [r.id, r]));
  const ids = out.toolIds.filter((id) => byId.has(id));
  const text = `${out.answer}\n${out.freeSteps.map((f) => `${f.title} ${f.detail}`).join("\n")}\n${out.notNeeded ?? ""}`;
  for (const r of tools) if (!ids.includes(r.id) && new RegExp(`\\b${r.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(out.answer)) ids.push(r.id);
  const picked = ids.slice(0, 4).map((id) => byId.get(id)!);

  // Everything the text says must come from what we gave it.
  // Prices are numbers in the JSON; spell them as dollars too so "$59" counts as a known fact.
  const dollars = [...tools.map((r) => r.pricing.small.monthlyUsd), pack.budget, brief?.budgetPerMonth ?? null, rules.budgetPlan?.total ?? null]
    .filter((n): n is number => typeof n === "number")
    .map((n) => `$${n}`);
  const problem = outsideFacts(text, `${user}\n${dollars.join(" ")}`, deps.catalog);
  if (problem) return { ok: false, reason: `outside_facts:${problem}` };

  const cards = picked.map((r) => cardFor(r, pack.ownerTools, pack.industry));
  let budgetPlan: AdvisorReply["budgetPlan"] = null;
  if (u.kind === "budget" && pack.budget !== null) {
    const priced = cards.filter((c) => c.monthlyUsd !== null);
    const total = Math.round(priced.reduce((n, c) => n + c.monthlyUsd!, 0) * 100) / 100;
    if (total > pack.budget) return { ok: false, reason: "over_budget" };
    budgetPlan = { budget: pack.budget, picks: priced.map((c) => ({ name: c.name, monthlyUsd: c.monthlyUsd! })), total, unpriced: cards.filter((c) => c.monthlyUsd === null).map((c) => c.name) };
  }

  return {
    ok: true,
    reply: {
      ...rules,
      answer: out.answer.trim(),
      tools: cards,
      freeFirst: out.freeSteps.length ? out.freeSteps.map((f) => ({ topic: f.title, title: f.title, detail: f.detail })) : rules.freeFirst,
      budgetPlan,
      notNeeded: out.notNeeded,
      noToolYet: cards.length ? [] : rules.noToolYet,
      followUps: out.followUps.length ? out.followUps : rules.followUps,
      mode: "ai",
    },
  };
}
