import { createHmac, timingSafeEqual } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { listingsSchema, profileSchema, reviewAnalysisSchema, websiteAnalysisSchema } from "../api/schemas.ts";
import type { ListingsCheck } from "../business/listings.ts";
import type { OnboardingProfile, ReviewAnalysis, WebsiteAnalysis } from "../business/types.ts";
import { v } from "../shared/validate.ts";
import type { ChallengeSuggestion } from "../challenges/match.ts";
import type { ReviewText } from "../challenges/interpret.ts";
import type { Answers } from "./types.ts";

/**
 * The journey is stateless on the server. Everything we learned and everything the owner
 * told us travels in one opaque `context` string the UI keeps and sends back.
 *
 * Format: "j1." + base64url(deflate(JSON)) [+ "." + base64url(HMAC-SHA256)] when JOURNEY_SECRET is set.
 * On decode the content is re-validated with the same schemas as the public endpoints, so a
 * damaged or hand-edited context is rejected instead of trusted.
 */
export interface JourneyState {
  v: 1;
  createdAt: string;
  profile: OnboardingProfile;
  reviews: ReviewAnalysis;
  website: WebsiteAnalysis | null;
  listings: ListingsCheck | null;
  /** Source links for the "N public sources" line. */
  sources: { label: string; url: string | null }[];
  mode: { places: string; sampleData: boolean; capturedAt?: string | null };
  answers: Answers;
  /** Review texts we read, for matching the owner's challenges to what customers say. */
  reviewTexts?: ReviewText[];
  /** Challenge suggestions made for this business at the start (kept so they stay stable). */
  suggestions?: ChallengeSuggestion[];
}

export const MAX_CONTEXT_CHARS = 150_000;
const PREFIX = "j1.";

const stateSchema = v.object(
  {
    v: v.number({ min: 1, max: 1 }),
    createdAt: v.string({ max: 40 }),
    profile: profileSchema,
    reviews: reviewAnalysisSchema,
    website: v.nullable(websiteAnalysisSchema),
    listings: v.nullable(listingsSchema),
    sources: v.array(v.object({ label: v.string({ max: 200 }), url: v.nullable(v.string({ max: 500 })) }), { max: 40 }),
    mode: v.object({ places: v.string({ max: 40 }), sampleData: v.boolean(), capturedAt: v.optional(v.nullable(v.string({ max: 40 }))) }),
    answers: v.record(v.unknown(), { maxKeys: 40 }),
    reviewTexts: v.optional(
      v.array(
        v.object({ id: v.string({ max: 200 }), rating: v.nullable(v.number()), text: v.string({ max: 500 }), where: v.string({ max: 80 }), author: v.nullable(v.string({ max: 200 })), url: v.nullable(v.string({ max: 800 })) }),
        { max: 25 },
      ),
    ),
    suggestions: v.optional(
      v.array(
        v.object(
          { id: v.string({ max: 40 }), text: v.string({ max: 120 }), why: v.string({ max: 200 }), source: v.string({ max: 20 }), keywords: v.array(v.string({ max: 40 }), { max: 10 }) },
          { allowUnknown: true },
        ),
        { max: 16 },
      ),
    ),
  },
  { allowUnknown: true },
);

const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function encodeContext(state: JourneyState, secret: string | null): string {
  const payload = deflateRawSync(Buffer.from(JSON.stringify(state))).toString("base64url");
  return PREFIX + payload + (secret ? `.${sign(payload, secret)}` : "");
}

export type DecodeResult = { ok: true; state: JourneyState } | { ok: false; reason: string };

export function decodeContext(context: string, secret: string | null): DecodeResult {
  if (typeof context !== "string" || !context.startsWith(PREFIX) || context.length > MAX_CONTEXT_CHARS)
    return { ok: false, reason: "This session has expired or is damaged. Start again by finding the business." };
  const [payload, signature] = context.slice(PREFIX.length).split(".");
  if (secret) {
    const expected = Buffer.from(sign(payload, secret));
    const given = Buffer.from(signature ?? "");
    if (expected.length !== given.length || !timingSafeEqual(expected, given))
      return { ok: false, reason: "This session couldn't be verified. Start again by finding the business." };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(inflateRawSync(Buffer.from(payload, "base64url"), { maxOutputLength: 2_000_000 }).toString("utf8"));
  } catch {
    return { ok: false, reason: "This session has expired or is damaged. Start again by finding the business." };
  }
  const parsed = stateSchema.parse(raw);
  if (!parsed.ok) return { ok: false, reason: "This session has expired or is damaged. Start again by finding the business." };
  return { ok: true, state: raw as JourneyState };
}
