import type { NextRequest } from "next/server";
import { handlePlanOpen } from "@/lib/api/plan.ts";
import { runRoute } from "@/lib/api/next.ts";
import { loadLiveCatalog } from "@/lib/discovery/index.ts";

/** Opens a plan link that carries the plan itself (used when saved links aren't switched on). */
export function POST(request: NextRequest) {
  return runRoute(request, "compute", async ({ body }, api) => handlePlanOpen(body, { api, kv: null, catalog: await loadLiveCatalog() }));
}
