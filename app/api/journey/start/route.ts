import type { NextRequest } from "next/server";
import { handleJourneyStart } from "@/lib/api/journey.ts";
import { runRoute } from "@/lib/api/next.ts";

/** Step 2 of the owner journey: what we learned + a few questions. See docs/JOURNEY_API.md. */
export function POST(request: NextRequest) {
  return runRoute(request, "analyze", ({ body }, deps) => handleJourneyStart(body, deps));
}
