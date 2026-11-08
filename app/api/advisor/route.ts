import type { NextRequest } from "next/server";
import { handleAdvisor } from "@/lib/api/advisor.ts";
import { runRoute } from "@/lib/api/next.ts";
import { loadLiveCatalog } from "@/lib/discovery/index.ts";
import { getKv } from "@/lib/shared/kv.ts";

/** The MainStreet Business Advisor (docs/ADVISOR.md). Rate-limited like other AI calls. */
export function POST(request: NextRequest) {
  return runRoute(request, "analyze", async ({ body }, api) => handleAdvisor(body, { api, catalog: await loadLiveCatalog(), kv: getKv() }));
}
