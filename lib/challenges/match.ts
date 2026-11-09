/**
 * Pure helpers for challenge suggestions, safe to use in the browser (no server imports).
 */
import type { ProblemKey } from "../problems/types.ts";
import type { UseCase } from "../recommend/types.ts";

export interface ChallengeSuggestion {
  id: string;
  /** Owner voice, short. */
  text: string;
  /** One line: why we suggest it ("3 of 10 reviews mention slow replies"). */
  why: string;
  source: "reviews" | "website" | "listings" | "services" | "industry";
  keywords: string[];
  problem?: ProblemKey;
  useCase?: UseCase;
}

/**
 * Which suggestions fit what the owner has typed so far (client and server use the same rule).
 * Empty text: the top ones. Otherwise: suggestions sharing a word with the text, best first,
 * leaving out ones already picked or dismissed.
 */
export function matchSuggestions(all: ChallengeSuggestion[], text: string, exclude: string[] = [], limit = 5): ChallengeSuggestion[] {
  const pool = all.filter((s) => !exclude.includes(s.id));
  const words = text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [];
  if (!words.length) return pool.slice(0, limit);
  const score = (s: ChallengeSuggestion) => {
    const hay = `${s.text} ${s.keywords.join(" ")}`.toLowerCase();
    return words.reduce((n, w) => n + (hay.includes(w.replace(/(ing|ed|es|s)$/, "")) ? 1 : 0), 0);
  };
  return pool
    .map((s, i) => ({ s, i, n: score(s) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.s);
}
