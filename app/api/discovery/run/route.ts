import { NextResponse, type NextRequest } from "next/server";
import { checkAccess, handleRun } from "@/lib/api/discovery.ts";
import { runRoute } from "@/lib/api/next.ts";
import { realCheck } from "@/lib/discovery/pipeline.ts";

// Each tool takes a few page reads and AI calls; a run checks at most a handful.
export const maxDuration = 300;

/** Reviewers: "Run discovery now". */
export function POST(request: NextRequest) {
  const access = checkAccess(request.headers);
  if (!access.ok) return NextResponse.json(access.response.body, { status: access.response.status });
  return runRoute(request, "analyze", ({ body }) => handleRun(body, "manual", realCheck));
}

/** The weekly schedule (vercel.json → crons). Vercel sends Authorization: Bearer $CRON_SECRET. */
export function GET(request: NextRequest) {
  const access = checkAccess(request.headers);
  if (!access.ok || access.who !== "schedule")
    return NextResponse.json({ error: { code: "unauthorized", message: "Only the weekly schedule can call this." } }, { status: 401 });
  return runRoute(request, "analyze", () => handleRun({}, "schedule", realCheck));
}
