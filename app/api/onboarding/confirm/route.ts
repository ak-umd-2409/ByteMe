import type { NextRequest } from "next/server";
import { handleConfirm } from "@/lib/api/handlers.ts";
import { runRoute } from "@/lib/api/next.ts";

/** Apply the owner's corrections and mark the profile confirmed. See docs/PARTS_2_3_API.md. */
export function POST(request: NextRequest) {
  return runRoute(request, "compute", ({ body }, deps) => handleConfirm(body, deps));
}
