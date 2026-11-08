import type { NextRequest } from "next/server";
import { handleSubmit } from "@/lib/api/discovery.ts";
import { runRoute } from "@/lib/api/next.ts";

/** Public: "Saw an AI tool in an ad?" and vendor applications. See docs/DISCOVERY.md. */
export function POST(request: NextRequest) {
  return runRoute(request, "lookup", ({ body }) => handleSubmit(body));
}
