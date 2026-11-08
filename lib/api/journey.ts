import { analyzeBusiness, OnboardingError } from "../business/onboarding.ts";
import { PlacesError } from "../business/places.ts";
import { decodeContext, encodeContext, MAX_CONTEXT_CHARS } from "../journey/context.ts";
import { buildAnswer, buildQuestions, businessCard, cleanAnswers, discoverForJourney, learned, startHeadline, stateFromAnalysis } from "../journey/journey.ts";
import type { Answers, JourneyAnswerResponse, JourneyStartResponse } from "../journey/types.ts";
import { log } from "../shared/logger.ts";
import { v } from "../shared/validate.ts";
import { errorResponse, type ApiDeps, type ApiResponse } from "./handlers.ts";

/**
 * The simple owner journey (docs/JOURNEY_API.md):
 *   POST /api/journey/start   { placeId, pastedReviews? }  → what we learned + a few questions
 *   POST /api/journey/answer  { context, answers }         → top problems, follow-ups, Part 4 request
 */

const PLACE_ID = /^[A-Za-z0-9_\-:.]{1,300}$/;

const startBody = v.object({
  placeId: v.string({ pattern: PLACE_ID }),
  pastedReviews: v.optional(v.string({ max: 20_000 })),
});

const answerBody = v.object({
  context: v.string({ min: 4, max: MAX_CONTEXT_CHARS, trim: false }),
  answers: v.optional(v.record(v.unknown(), { maxKeys: 40 })),
});

const invalid = (errors: string[]) => errorResponse(400, "invalid_request", "Some fields are missing or invalid.", errors);

export async function handleJourneyStart(body: unknown, deps: ApiDeps): Promise<ApiResponse> {
  const parsed = startBody.parse(body);
  if (!parsed.ok) return invalid(parsed.errors);
  try {
    const analysis = await analyzeBusiness(
      { placeId: parsed.value.placeId, pastedReviews: parsed.value.pastedReviews },
      {
        places: deps.places,
        llm: deps.llm,
        websiteMaxPages: deps.config.websiteMaxPages,
        timeoutMs: deps.config.httpTimeoutMs,
        userAgent: deps.config.userAgent,
        ...deps.onboarding,
      },
    );
    const now = deps.now?.() ?? new Date();
    const state = stateFromAnalysis(analysis, now);
    const base = discoverForJourney(state, state.profile, undefined, now);
    const questions = buildQuestions(state, base);
    const response: JourneyStartResponse = {
      context: encodeContext(state, deps.config.journeySecret),
      business: businessCard(state),
      learned: learned(state),
      headline: startHeadline(base, questions),
      questions,
      sources: { count: state.sources.length, list: state.sources },
      mode: state.mode,
    };
    log.info("journey.start", { questions: questions.length, places: state.mode.places });
    return { status: 200, body: response };
  } catch (error) {
    if (error instanceof OnboardingError) return errorResponse(error.status, error.status === 404 ? "not_found" : "invalid_request", error.message);
    if (error instanceof PlacesError) return errorResponse(502, "places_unavailable", error.message);
    throw error;
  }
}

export async function handleJourneyAnswer(body: unknown, deps: ApiDeps): Promise<ApiResponse> {
  const parsed = answerBody.parse(body);
  if (!parsed.ok) return invalid(parsed.errors);
  const decoded = decodeContext(parsed.value.context, deps.config.journeySecret);
  if (!decoded.ok) return errorResponse(400, "invalid_context", decoded.reason);
  const state = decoded.state;
  const now = deps.now?.() ?? new Date();
  const questions = buildQuestions(state);

  // New answers replace earlier ones; null clears an answer (the owner skipped it after all).
  const incoming = (parsed.value.answers ?? {}) as Answers;
  const merged: Answers = { ...state.answers };
  for (const [id, value] of Object.entries(incoming)) {
    if (value === null) delete merged[id];
    else merged[id] = value;
  }
  const { answers, ignored } = cleanAnswers(questions, merged);
  const incomingIgnored = ignored.filter((i) => i.questionId in incoming);
  const result = buildAnswer(state, questions, answers, now);
  const response: JourneyAnswerResponse = {
    ...result,
    context: encodeContext({ ...state, answers }, deps.config.journeySecret),
    ignored: incomingIgnored,
  };
  log.info("journey.answer", { answered: Object.keys(answers).length, opportunities: result.opportunities.length, ready: result.recommendation.ready });
  return { status: 200, body: response };
}
