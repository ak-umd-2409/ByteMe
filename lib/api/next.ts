import { NextResponse, type NextRequest } from "next/server";
import { log } from "../shared/logger.ts";
import { clientKey, createRateLimiter } from "../shared/rateLimit.ts";
import { defaultDeps, errorResponse, type ApiDeps, type ApiResponse } from "./handlers.ts";

/**
 * Next.js glue: JSON parsing, rate limiting, error handling, logging.
 * Kept separate so lib/api/handlers.ts stays framework-free and testable.
 */
const limiters = {
  /** Places lookups: protect the Google quota. */
  lookup: createRateLimiter({ capacity: 30, refillPerMinute: 30 }),
  /** Website scans and LLM calls: the expensive ones. */
  analyze: createRateLimiter({ capacity: 8, refillPerMinute: 8 }),
  /** Pure computation. */
  compute: createRateLimiter({ capacity: 60, refillPerMinute: 120 }),
};

export type LimitKind = keyof typeof limiters;

let deps: ApiDeps | null = null;
const getDeps = () => (deps ??= defaultDeps());

function toNext(response: ApiResponse, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(response.body, { status: response.status, headers: { "cache-control": "no-store", ...extraHeaders } });
}

export async function runRoute(
  request: NextRequest,
  limit: LimitKind,
  handler: (input: { body: unknown; query: Record<string, string | undefined> }, deps: ApiDeps) => Promise<ApiResponse>,
) {
  const started = Date.now();
  const check = limiters[limit](clientKey(request.headers));
  if (!check.allowed) {
    return toNext(errorResponse(429, "rate_limited", "Too many requests. Please wait a moment and try again."), {
      "retry-after": String(check.retryAfterSec),
    });
  }
  let body: unknown = undefined;
  if (request.method === "POST") {
    const text = await request.text();
    if (text.length > 200_000) return toNext(errorResponse(413, "too_large", "The request is too large."));
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      return toNext(errorResponse(400, "invalid_json", "Send a JSON body."));
    }
  }
  const query = Object.fromEntries(request.nextUrl.searchParams.entries());
  try {
    const response = await handler({ body, query }, getDeps());
    log.info("api.request", { path: request.nextUrl.pathname, status: response.status, ms: Date.now() - started });
    return toNext(response);
  } catch (error) {
    log.error("api.unhandled", { path: request.nextUrl.pathname, error });
    return toNext(errorResponse(500, "internal_error", "Something went wrong on our side. Please try again."));
  }
}
