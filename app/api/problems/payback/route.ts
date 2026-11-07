import type { NextRequest } from "next/server";
import { handlePayback } from "@/lib/api/handlers.ts";
import { runRoute } from "@/lib/api/next.ts";

/** "Pays for itself in X days" for recommended tools. See docs/PARTS_2_3_API.md. */
export function POST(request: NextRequest) {
  return runRoute(request, "compute", ({ body }) => handlePayback(body));
}
