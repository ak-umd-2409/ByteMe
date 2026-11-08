import type {
  BusinessProfile,
  CatalogTool,
  Exclusion,
  FitScore,
  Problem,
  Recommendation,
  RecommendationResult,
  ToolChoice,
} from "./types.ts";

const round = (value: number) => Math.round(value * 10) / 10;
const same = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();
const isFood = (industry: string) =>
  /restaurant|cafe|café|food|grocery|delivery/.test(industry.toLowerCase());
const has = (
  profile: BusinessProfile,
  item: BusinessProfile["dealBreakers"][number],
) => profile.dealBreakers.includes(item);

/** Safety status and owner rules are gates. A score can never override them. */
export function exclusionReason(
  tool: CatalogTool,
  business: BusinessProfile,
): string | null {
  if (tool.status !== "verified" || !tool.reviewedAt)
    return "Not yet verified by a human reviewer.";
  if (
    business.handlesHealthData &&
    (!tool.flags.hipaaReady || !tool.flags.baaAvailable)
  )
    return "Health data requires a suitable tool and a signed business associate agreement.";
  if (
    business.state.toUpperCase() === "MD" &&
    isFood(business.industry) &&
    tool.flags.personalizesPrices
  )
    return "Personalized pricing is unsuitable for this Maryland food business.";
  if (
    business.handlesLargeCustomerList &&
    (!tool.flags.dataDeletion || !tool.flags.dataMinimization)
  )
    return "Data deletion or minimization could not be confirmed for this customer list.";
  if (has(business, "no-recording") && tool.flags.recordsCalls)
    return "You asked for no call recording.";
  if (has(business, "no-contract") && tool.flags.requiresContract)
    return "You asked for no contract.";
  if (
    has(business, "spanish") &&
    !tool.languages.some((l) => same(l, "Spanish"))
  )
    return "Spanish support is required.";
  if (has(business, "offline") && !tool.flags.worksOffline)
    return "Offline operation is required.";
  return null;
}

export function scoreTool(
  tool: CatalogTool,
  problem: Problem,
  business: BusinessProfile,
): FitScore {
  const problemPoints = tool.useCases.includes(problem.useCase) ? 35 : 0;
  const integrationKinds = business.currentTools.flatMap((current) =>
    Object.entries(tool.integrations)
      .filter(([name]) => same(name, current))
      .map(([, kind]) => kind),
  );
  const integrationPoints =
    business.currentTools.length === 0
      ? 12.5
      : integrationKinds.includes("native")
        ? 25
        : integrationKinds.includes("via-zapier")
          ? 12.5
          : 0;
  const budgetRatio =
    business.monthlyBudget > 0
      ? tool.monthlyPrice / business.monthlyBudget
      : tool.monthlyPrice === 0
        ? 0
        : Infinity;
  const budgetPoints =
    budgetRatio <= 1
      ? 20
      : budgetRatio >= 1.5
        ? 0
        : round((20 * (1.5 - budgetRatio)) / 0.5);
  const setupPoints =
    tool.setupMinutes <= 60
      ? 10
      : tool.setupMinutes >= 240
        ? 0
        : round((10 * (240 - tool.setupMinutes)) / 180);
  // A missing review sample is neutral, not a fabricated star rating.
  const reviewPoints =
    (tool.reviewCount ?? 0) >= 10 && tool.reviewRating !== undefined
      ? round(Math.max(0, Math.min(5, tool.reviewRating)) * 2)
      : 5;
  const parts = {
    problem: problemPoints,
    integration: integrationPoints,
    budget: budgetPoints,
    setup: setupPoints,
    reviews: reviewPoints,
  };
  const reasons = [
    problemPoints
      ? `Solves ${problem.title.toLowerCase()}`
      : "Does not match this problem",
    integrationKinds.includes("native")
      ? "Connects directly to a tool you use"
      : integrationKinds.includes("via-zapier")
        ? "Connects through Zapier"
        : "No confirmed integration with your tools",
    tool.monthlyPrice <= business.monthlyBudget
      ? "Within your monthly budget"
      : "Above your monthly budget",
    tool.setupMinutes <= 60
      ? "Setup estimated under an hour"
      : "May take more setup time",
    (tool.reviewCount ?? 0) >= 10
      ? "Review sample considered"
      : "Limited review evidence; neutral score used",
  ];
  return {
    total: round(Object.values(parts).reduce((sum, value) => sum + value, 0)),
    parts,
    reasons,
  };
}

function choice(
  tool: CatalogTool,
  problem: Problem,
  business: BusinessProfile,
): ToolChoice {
  const score = scoreTool(tool, problem, business);
  const matched = business.currentTools.find((current) =>
    Object.keys(tool.integrations).some((name) => same(name, current)),
  );
  const badges = [
    tool.demoOnly ? "Demo catalog status" : "Catalog verified",
    ...(matched ? [`Works with ${matched}`] : []),
    ...(tool.flags.recordsCalls &&
    tool.flags.announcesRecording &&
    business.state === "MD"
      ? ["Recording notice declared"]
      : []),
    ...(tool.flags.hipaaReady && tool.flags.baaAvailable
      ? ["Health data terms declared"]
      : []),
    ...(tool.languages.some((l) => same(l, "Spanish")) ? ["Spanish"] : []),
  ];
  const warnings = [
    ...(business.state.toUpperCase() === "MD" &&
    tool.flags.recordsCalls &&
    !tool.flags.announcesRecording
      ? [
          "Keep call recording off until you confirm the tool gives the required recording notice.",
        ]
      : []),
    ...(tool.flags.outboundAICalls && !business.hasOutboundCallConsent
      ? [
          "Use inbound answering first. Before enabling outbound AI calls, collect any required customer consent.",
        ]
      : []),
    ...(tool.monthlyPrice > business.monthlyBudget
      ? [
          `Its listed price is $${Math.round(tool.monthlyPrice - business.monthlyBudget)} above your monthly budget.`,
        ]
      : []),
  ];
  const why =
    `${tool.name} addresses ${problem.title.toLowerCase()}${matched ? ` and works with ${matched}` : ""}. ` +
    `${tool.monthlyPrice <= business.monthlyBudget ? "Its listed monthly cost fits your budget" : "Its listed monthly cost exceeds your budget"}; ` +
    `setup is estimated at ${tool.setupMinutes} minutes.`;
  return { tool, score, why, badges, warnings };
}

function sortedChoices(
  tools: CatalogTool[],
  problem: Problem,
  business: BusinessProfile,
): ToolChoice[] {
  return tools
    .filter((t) => t.useCases.includes(problem.useCase))
    .map((t) => choice(t, problem, business))
    .sort(
      (a, b) =>
        b.score.total - a.score.total ||
        a.tool.monthlyPrice - b.tool.monthlyPrice ||
        a.tool.name.localeCompare(b.tool.name),
    );
}

function makeKit(
  problems: Problem[],
  eligible: CatalogTool[],
  business: BusinessProfile,
): ToolChoice[] {
  const topProblems = problems.slice(0, 4);
  if (topProblems.length < 2) return [];
  let best: ToolChoice[] = [];
  let bestValue = -Infinity;
  const search = (
    index: number,
    selected: ToolChoice[],
    ids: Set<string>,
    total: number,
  ) => {
    if (index === topProblems.length) {
      if (selected.length < 2) return;
      const value =
        selected.reduce((sum, c) => sum + c.score.total, 0) +
        selected.length * 25 -
        Math.max(0, total - business.monthlyBudget) * 3;
      if (
        value > bestValue ||
        (value === bestValue &&
          total < best.reduce((s, c) => s + c.tool.monthlyPrice, 0))
      ) {
        best = selected.slice();
        bestValue = value;
      }
      return;
    }
    search(index + 1, selected, ids, total);
    for (const candidate of sortedChoices(
      eligible,
      topProblems[index],
      business,
    ).slice(0, 8)) {
      if (
        ids.has(candidate.tool.id) ||
        total + candidate.tool.monthlyPrice > business.monthlyBudget
      )
        continue;
      ids.add(candidate.tool.id);
      selected.push(candidate);
      search(index + 1, selected, ids, total + candidate.tool.monthlyPrice);
      selected.pop();
      ids.delete(candidate.tool.id);
    }
  };
  search(0, [], new Set(), 0);
  return best;
}

export function recommend(
  business: BusinessProfile,
  problems: Problem[],
  catalog: CatalogTool[],
): RecommendationResult {
  const eligible = catalog.filter(
    (tool) => exclusionReason(tool, business) === null,
  );
  const kitChoices = makeKit(problems, eligible, business);
  const rows = problems.map((problem) => {
    const candidates = sortedChoices(eligible, problem, business);
    const excluded: Exclusion[] = catalog
      .filter((tool) => tool.useCases.includes(problem.useCase))
      .flatMap((tool) => {
        const reason = exclusionReason(tool, business);
        return reason ? [{ toolId: tool.id, toolName: tool.name, reason }] : [];
      });
    const options: Recommendation[] = [];
    const existing = candidates.find(
      (c) =>
        c.tool.existingProduct &&
        business.currentTools.some((t) => same(t, c.tool.existingProduct!)),
    );
    if (existing)
      options.push({
        kind: "already-have",
        title: "Use what you already have",
        description: `Add a feature to ${existing.tool.existingProduct}.`,
        choices: [existing],
        monthlyPrice: existing.tool.monthlyPrice,
        note: "Shown price is the incremental monthly cost in this sample catalog.",
      });
    const quick =
      candidates.find((c) => c.tool.id !== existing?.tool.id) ?? candidates[0];
    if (quick)
      options.push({
        kind: "quick-fix",
        title: "Quick fix",
        description: existing
          ? "The strongest stand-alone alternative to your existing tools."
          : "The strongest single-tool match for this problem.",
        choices: [quick],
        monthlyPrice: quick.tool.monthlyPrice,
      });
    if (
      kitChoices.length >= 2 &&
      kitChoices.some((c) => c.tool.useCases.includes(problem.useCase))
    )
      options.push({
        kind: "starter-kit",
        title: "Starter Kit",
        description: `A coordinated plan for ${kitChoices.length} of your problems.`,
        choices: kitChoices,
        monthlyPrice: kitChoices.reduce(
          (sum, c) => sum + c.tool.monthlyPrice,
          0,
        ),
        note: "Total assumes listed monthly prices; confirm vendor terms before purchase.",
      });
    const cheapest = [...candidates].sort(
      (a, b) =>
        a.tool.monthlyPrice - b.tool.monthlyPrice ||
        b.score.total - a.score.total,
    )[0];
    if (cheapest && cheapest.tool.id !== quick?.tool.id)
      options.push({
        kind: "lowest-cost",
        title: "Lowest cost",
        description:
          "The least expensive eligible way to address this problem.",
        choices: [cheapest],
        monthlyPrice: cheapest.tool.monthlyPrice,
      });
    if (business.needsHelp && candidates[0])
      options.push({
        kind: "done-for-you",
        title: "Get help setting it up",
        description: "Pair this tool with a local business advisor.",
        choices: [candidates[0]],
        monthlyPrice: candidates[0].tool.monthlyPrice,
        note: "Advisor availability and implementation services are not guaranteed.",
        helpUrl: "https://www.marylandsbdc.org/locations",
      });
    // Recommendation types can point to the same winner (for example, the best
    // fit can also be the cheapest). Keep up to three distinct Verified tools
    // visible so a good candidate never disappears without explanation.
    const surfaced = new Set(
      options
        .filter((option) => option.kind !== "starter-kit")
        .flatMap((option) => option.choices.map((candidate) => candidate.tool.id)),
    );
    for (const candidate of candidates) {
      if (surfaced.size >= 3) break;
      if (surfaced.has(candidate.tool.id)) continue;
      options.push({
        kind: "alternative",
        title: "Another verified option",
        description: "A checked alternative worth comparing with the best fit.",
        choices: [candidate],
        monthlyPrice: candidate.tool.monthlyPrice,
      });
      surfaced.add(candidate.tool.id);
    }
    return { problem, options, excluded };
  });
  const comparison = [
    ...new Map(
      rows
        .flatMap((row) => row.options.flatMap((option) => option.choices))
        .map((c) => [c.tool.id, c]),
    ).values(),
  ]
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, 3);
  return {
    forBusiness: business.name,
    generatedAt: new Date().toISOString(),
    sampleData: catalog.some((t) => t.demoOnly),
    problems: rows,
    comparison,
  };
}
