import { analyzeBusiness, OnboardingError } from "../business/onboarding.ts";
import { PlacesError } from "../business/places.ts";
import { decodeContext, encodeContext, MAX_CONTEXT_CHARS } from "../journey/context.ts";
import { buildAnswer, buildQuestions, businessCard, cleanAnswers, couldNotCheck, customersSay, discoverForJourney, learned, startHeadline, stateFromAnalysis, toolsFound } from "../journey/journey.ts";
import type { Answers, JourneyAnswerResponse, JourneyStartResponse } from "../journey/types.ts";
import { interpretChallenges } from "../challenges/interpret.ts";
import { challengeSuggestions, serviceSuggestions } from "../challenges/suggest.ts";
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
  placeId: v.optional(v.string({ pattern: PLACE_ID })),
  /** "Not listed? Enter it yourself." Maryland only for now. */
  manual: v.optional(
    v.object({
      name: v.string({ min: 1, max: 120 }),
      website: v.optional(v.string({ max: 500 })),
      town: v.optional(v.string({ max: 80 })),
      category: v.optional(v.string({ max: 80 })),
    }),
  ),
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
  const { placeId, manual, pastedReviews } = parsed.value;
  if (!placeId && !manual) return invalid(["placeId or manual: choose a business, or type its name"]);
  try {
    const analysis = await analyzeBusiness(
      {
        ...(placeId
          ? { placeId }
          : {
              manual: {
                name: manual!.name,
                ...(manual!.website ? { website: manual!.website } : {}),
                ...(manual!.category ? { category: manual!.category } : {}),
                address: { city: manual!.town, state: "Maryland", stateCode: "MD", country: "US", formatted: [manual!.town, "MD"].filter(Boolean).join(", ") },
              },
            }),
        pastedReviews,
      },
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
    const baseState = stateFromAnalysis(analysis, now);
    const base = discoverForJourney(baseState, baseState.profile, undefined, now);
    // Suggestions are made once here and travel in the context, so they stay the same while the owner types.
    const fromServices = await serviceSuggestions(baseState, deps.llm).catch(() => []);
    const state = { ...baseState, suggestions: challengeSuggestions(baseState, base, fromServices) };
    const questions = buildQuestions(state, base);
    const response: JourneyStartResponse = {
      context: encodeContext(state, deps.config.journeySecret),
      business: businessCard(state),
      learned: learned(state),
      headline: startHeadline(base, questions),
      questions,
      customersSay: customersSay(state),
      couldNotCheck: couldNotCheck(analysis),
      toolsFound: toolsFound(state),
      sources: { count: state.sources.length, list: state.sources },
      mode: { ...state.mode, capturedAt: state.mode.capturedAt ?? null },
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
  // The owner's challenges, read by AI when it's on (checked and cached), by keyword rules otherwise.
  const challenges = await interpretChallenges({
    text: typeof answers.challenges === "string" ? answers.challenges : null,
    picks: Array.isArray(answers.challenge_picks) ? answers.challenge_picks : [],
    suggestions: questions.find((q) => q.id === "challenges")?.suggestions ?? [],
    industry: state.profile.business.industry.value,
    business: state.profile.business.name.value ?? "the business",
    reviews: state.reviewTexts ?? [],
    llm: deps.llm,
  }).catch((error) => {
    log.warn("journey.challenges_failed", { error });
    return [];
  });
  const result = buildAnswer(state, questions, answers, now, challenges);
  const response: JourneyAnswerResponse = {
    ...result,
    context: encodeContext({ ...state, answers }, deps.config.journeySecret),
    ignored: incomingIgnored,
  };
  log.info("journey.answer", { answered: Object.keys(answers).length, opportunities: result.opportunities.length, ready: result.recommendation.ready });
  return { status: 200, body: response };
}
