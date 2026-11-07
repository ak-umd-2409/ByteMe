import type { NextRequest } from "next/server";
import { handleAnalyze } from "@/lib/api/handlers.ts";
import { runRoute } from "@/lib/api/next.ts";

/** Build a draft profile from listing + website + reviews. See docs/PARTS_2_3_API.md. */
export function POST(request: NextRequest) {
  return runRoute(request, "analyze", ({ body }, deps) => handleAnalyze(body, deps));
}
