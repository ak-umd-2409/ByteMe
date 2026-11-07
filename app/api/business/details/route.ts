import type { NextRequest } from "next/server";
import { handleDetails } from "@/lib/api/handlers.ts";
import { runRoute } from "@/lib/api/next.ts";

/** Public listing details for one placeId. See docs/PARTS_2_3_API.md. */
export function GET(request: NextRequest) {
  return runRoute(request, "lookup", ({ query }, deps) => handleDetails(query, deps));
}
