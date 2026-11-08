import { NextRequest, NextResponse } from "next/server";
import { demoBusiness } from "../../../data/mock/recommendations.ts";
import { loadCatalog } from "../../../lib/catalog/index.ts";
import { toCatalogTool } from "../../../lib/catalog/toCatalogTool.ts";
import { recommend } from "../../../lib/recommend/engine.ts";
import { USE_CASES } from "../../../lib/recommend/types.ts";
import type { BusinessProfile, Problem } from "../../../lib/recommend/types.ts";

const choices = new Set(["no-recording", "no-contract", "spanish", "offline"]);
const useCases = new Set<string>(USE_CASES);

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }
  if (!body || typeof body !== "object")
    return NextResponse.json(
      { error: "Business profile is required." },
      { status: 400 },
    );
  const input = body as {
    business?: Partial<BusinessProfile>;
    problems?: Problem[];
  };
  const b = input.business;
  if (
    !b ||
    typeof b.name !== "string" ||
    b.name.length > 120 ||
    typeof b.industry !== "string" ||
    b.industry.length > 80 ||
    typeof b.state !== "string" ||
    b.state.length > 2 ||
    typeof b.monthlyBudget !== "number" ||
    !Number.isFinite(b.monthlyBudget) ||
    b.monthlyBudget < 0 ||
    b.monthlyBudget > 100000 ||
    !Array.isArray(b.currentTools) ||
    b.currentTools.length > 30 ||
    !b.currentTools.every((t) => typeof t === "string" && t.length <= 80) ||
    typeof b.needsHelp !== "boolean" ||
    !Array.isArray(b.dealBreakers) ||
    !b.dealBreakers.every((d) => choices.has(d))
  ) {
    return NextResponse.json(
      { error: "Check the business profile fields." },
      { status: 400 },
    );
  }
  const problems = input.problems;
  if (
    !Array.isArray(problems) ||
    problems.length === 0 ||
    problems.length > 8 ||
    !problems.every(
      (p) =>
        p &&
        typeof p.id === "string" &&
        p.id.length <= 80 &&
        typeof p.title === "string" &&
        p.title.length <= 140 &&
        typeof p.evidence === "string" &&
        p.evidence.length <= 500 &&
        useCases.has(p.useCase),
    )
  ) {
    return NextResponse.json(
      { error: "Check the problem list." },
      { status: 400 },
    );
  }
  const business: BusinessProfile = {
    ...demoBusiness,
    ...b,
    currentTools: b.currentTools,
    dealBreakers: b.dealBreakers,
    county:
      typeof b.county === "string" && b.county.length <= 80 ? b.county : "",
  } as BusinessProfile;
  // Our safety-checked catalog (data/catalog). The engine's gates only recommend
  // Verified tools; tools without a confirmed price are left out entirely.
  const catalog = loadCatalog()
    .map(toCatalogTool)
    .filter((t): t is NonNullable<typeof t> => t !== null);
  return NextResponse.json(recommend(business, problems, catalog), {
    headers: { "Cache-Control": "no-store" },
  });
}
