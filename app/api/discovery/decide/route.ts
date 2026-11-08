import { NextResponse, type NextRequest } from "next/server";
import { checkAccess, handleDecide } from "@/lib/api/discovery.ts";
import { runRoute } from "@/lib/api/next.ts";

/** Reviewers: approve or block a tool. */
export function POST(request: NextRequest) {
  const access = checkAccess(request.headers);
  if (!access.ok) return NextResponse.json(access.response.body, { status: access.response.status });
  return runRoute(request, "compute", ({ body }) => handleDecide(body));
}
