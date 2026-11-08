import type { NextRequest } from "next/server";
import { handleJourneyAnswer } from "@/lib/api/journey.ts";
import { runRoute } from "@/lib/api/next.ts";

/** Steps 3–5 of the owner journey: apply answers → top problems + Part 4 request. See docs/JOURNEY_API.md. */
export function POST(request: NextRequest) {
  return runRoute(request, "compute", ({ body }, deps) => handleJourneyAnswer(body, deps));
}
