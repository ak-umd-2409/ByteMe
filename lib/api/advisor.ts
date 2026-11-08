/**
 * POST /api/advisor  { message, context?, industry?, history? } → AdvisorReply
 *
 * The MainStreet Business Advisor (docs/ADVISOR.md). Answers come from the owner's own
 * results (rebuilt from the journey context, which is signed when JOURNEY_SECRET is set) and
 * the checked catalog. AI wording is optional and checked against those facts; when it's off,
 * slow, over budget or strays, the owner gets the rules answer. Nothing is stored.
 */
import type { IndustryKey } from "../business/types.ts";
import type { CatalogRecord } from "../catalog/types.ts";
import type { JourneyAnswerResponse } from "../journey/types.ts";
import { decodeContext, MAX_CONTEXT_CHARS, type JourneyState } from "../journey/context.ts";
import { buildBrief, type BusinessBrief } from "../advisor/brief.ts";
import { answerWithAi } from "../advisor/think.ts";
import { compose } from "../advisor/compose.ts";
import { INDUSTRY_TOPICS } from "../advisor/knowledge.ts";
import { buildPack, contextFrom, knownProducts } from "../advisor/pack.ts";
import type { AdvisorContext, AdvisorReply, AdvisorTurn } from "../advisor/types.ts";
import { understand } from "../advisor/understand.ts";
import { disabledProvider, type LlmProvider } from "../llm/client.ts";
import type { Kv } from "../shared/kv.ts";
import { log } from "../shared/logger.ts";
import { v } from "../shared/validate.ts";
import { errorResponse, type ApiDeps, type ApiResponse } from "./handlers.ts";
import { handleJourneyAnswer } from "./journey.ts";

export interface AdvisorDeps {
  api: ApiDeps;
  catalog: CatalogRecord[];
  /** Defaults to api.llm. */
  llm?: LlmProvider;
  kv?: Kv | null;
}

const industries = Object.keys(INDUSTRY_TOPICS) as IndustryKey[];

const body = v.object({
  message: v.string({ min: 1, max: 600 }),
  context: v.optional(v.string({ min: 4, max: MAX_CONTEXT_CHARS, trim: false })),
  industry: v.optional(v.oneOf(industries)),
  history: v.optional(
    v.array(v.object({ role: v.oneOf(["owner", "advisor"] as const), text: v.string({ min: 1, max: 2_000 }) }), { max: 12 }),
  ),
});

export async function handleAdvisor(input: unknown, deps: AdvisorDeps): Promise<ApiResponse> {
  const parsed = body.parse(input);
  if (!parsed.ok) return errorResponse(400, "invalid_request", "Some fields are missing or invalid.", parsed.errors);
  const { message, context, industry } = parsed.value;
  const history = (parsed.value.history ?? []) as AdvisorTurn[];

  let ctx: AdvisorContext | null = null;
  let brief: BusinessBrief | null = null;
  let notice: string | null = null;
  if (context) {
    const res = await handleJourneyAnswer({ context, answers: {} }, deps.api);
    if (res.status === 200) {
      const answer = res.body as JourneyAnswerResponse;
      ctx = contextFrom(answer);
      const decoded = decodeContext(context, deps.api.config.journeySecret);
      brief = buildBrief(answer, decoded.ok ? (decoded.state as JourneyState) : null);
    } else notice = "I couldn't open your saved results, so this answer is general. Run the check again to get answers about your business.";
  }

  const u = understand(message, history, knownProducts(deps.catalog));
  const pack = buildPack(u, ctx, deps.catalog, industry ?? null);
  let reply: AdvisorReply = { ...compose(u, ctx, pack), notice };

  // With an AI provider, the model writes the answer from the full business brief and the
  // checked catalog; the server checks it. Without one (or if a check fails), the rules answer stands.
  const llm = deps.llm ?? deps.api.llm;
  if (llm !== disabledProvider) {
    const ai = await answerWithAi({ question: message, history, u, brief, ctx, pack, rules: reply }, { llm, catalog: deps.catalog, kv: deps.kv });
    if (ai.ok) reply = { ...ai.reply, notice };
    else log.info("advisor.rules_fallback", { reason: ai.reason });
  }
  log.info("advisor.answer", { kind: u.kind, topics: pack.topics, tools: reply.tools.length, mode: reply.mode, context: Boolean(ctx) });
  return { status: 200, body: reply };
}
