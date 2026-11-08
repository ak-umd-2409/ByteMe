/**
 * The honesty rule for card answers: an answer counts only when its quote is
 * on a page we actually read, word for word, and the answer is in its quote.
 * Anything else becomes "unknown". Pure code: no internet, no AI.
 */
import { isVerbatim } from "../../business/reviews.ts";
import { isFetched, type AiAnswer, type PageFact } from "../../safety/types.ts";

const NUMBER = /^\d+(\.\d+)?$/;
const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Every number written in the text, with $ and thousands commas removed: "$1,200.50" → 1200.5. */
const numbersIn = (text: string) =>
  [...text.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, "")));

/**
 * Is the answer actually in its quote? Numbers compare by value ("1200" matches
 * "$1,200"); yes/no answers are exempt (the quote is the evidence); text
 * compares ignoring case and punctuation.
 */
export function answerInQuote(answer: string, quote: string): boolean {
  const a = answer.trim();
  if (a === "yes" || a === "no") return true;
  if (NUMBER.test(a)) return numbersIn(quote).includes(Number(a));
  const s = squash(a);
  return s.length > 0 && ` ${squash(quote)} `.includes(` ${s} `);
}

/** A monthly price answer as a number, or "unknown" for anything that isn't a plain number. */
export function parseMonthly(answer: string): number | "unknown" {
  const a = answer.trim();
  return NUMBER.test(a) ? Number(a) : "unknown";
}

/**
 * Keep an AI answer only if it is `{ answer, quote, pageUrl }`, `pageUrl` is a
 * page we read, the quote is on that page word for word, the answer is in
 * `allowed` (when given; then the quote need not repeat it), and otherwise the
 * answer appears in its quote.
 */
export function keepAnswer<T extends string>(raw: unknown, pages: Record<string, PageFact>, allowed?: readonly T[]): AiAnswer<T> {
  if (typeof raw !== "object" || raw === null) return "unknown";
  const { answer: rawAnswer, quote: rawQuote, pageUrl } = raw as Record<string, unknown>;
  if (typeof rawAnswer !== "string" || typeof rawQuote !== "string" || typeof pageUrl !== "string") return "unknown";
  if (rawAnswer.length > 300 || rawQuote.length > 1000) return "unknown";
  const quote = rawQuote.trim();
  let answer = rawAnswer.trim();
  if (!answer) return "unknown";
  if (allowed) {
    answer = answer.toLowerCase();
    if (!allowed.includes(answer as T)) return "unknown";
  } else if (!answerInQuote(answer, quote)) return "unknown";
  const page = Object.values(pages).find((p) => isFetched(p) && (p.finalUrl === pageUrl || p.url === pageUrl));
  if (!page || !isFetched(page) || !isVerbatim(quote, page.text)) return "unknown";
  return { answer: answer as T, quote, pageUrl: page.finalUrl };
}
