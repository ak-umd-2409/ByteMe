import type { NextRequest } from "next/server";
import { handleSearch } from "@/lib/api/handlers.ts";
import { runRoute } from "@/lib/api/next.ts";

/** Find a business by name and town. See docs/PARTS_2_3_API.md. */
export function GET(request: NextRequest) {
  return runRoute(request, "lookup", ({ query }, deps) => handleSearch(query, deps));
}
