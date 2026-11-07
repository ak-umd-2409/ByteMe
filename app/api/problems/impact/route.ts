import type { NextRequest } from "next/server";
import { handleImpact } from "@/lib/api/handlers.ts";
import { runRoute } from "@/lib/api/next.ts";

/** Recalculate one estimate after the owner edits an assumption. See docs/PARTS_2_3_API.md. */
export function POST(request: NextRequest) {
  return runRoute(request, "compute", ({ body }) => handleImpact(body));
}
