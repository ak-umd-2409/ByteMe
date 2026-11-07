import type { NextRequest } from "next/server";
import { handleDiscover } from "@/lib/api/handlers.ts";
import { runRoute } from "@/lib/api/next.ts";

/** Evidence-backed problem cards + the Part 4 /api/recommend payload. See docs/PARTS_2_3_API.md. */
export function POST(request: NextRequest) {
  return runRoute(request, "analyze", ({ body }, deps) => handleDiscover(body, deps));
}
