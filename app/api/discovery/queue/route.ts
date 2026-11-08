import { NextResponse, type NextRequest } from "next/server";
import { checkAccess, handleQueue } from "@/lib/api/discovery.ts";
import { runRoute } from "@/lib/api/next.ts";

/** Reviewers: the discovery queue. See docs/DISCOVERY.md. */
export function GET(request: NextRequest) {
  const access = checkAccess(request.headers);
  if (!access.ok) return NextResponse.json(access.response.body, { status: access.response.status });
  return runRoute(request, "compute", () => handleQueue());
}
