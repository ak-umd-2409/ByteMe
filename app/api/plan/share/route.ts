import type { NextRequest } from "next/server";
import { handlePlanShare } from "@/lib/api/plan.ts";
import { runRoute } from "@/lib/api/next.ts";
import { loadLiveCatalog } from "@/lib/discovery/index.ts";
import { getKv } from "@/lib/shared/kv.ts";

/** "Send my plan to my SBDC advisor": make a link to a read-only copy (spec §5.4). */
export function POST(request: NextRequest) {
  return runRoute(request, "compute", async ({ body }, api) => handlePlanShare(body, { api, kv: getKv(), catalog: await loadLiveCatalog() }));
}
