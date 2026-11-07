import type { ReviewAnalysis } from "../business/types.ts";
import { PROBLEMS } from "./catalog.ts";
import type { DiscoveryResult, EvidenceSource, ProblemCard } from "./types.ts";

/**
 * UI-ready, deterministic presentation fields. Short labels instead of paragraphs, so a screen
 * can show: what's wrong · why it matters · how sure we are · what it may be worth · what to do.
 */

const FAMILY_NOUN: Record<EvidenceSource, [string, string]> = {
  google_review: ["review", "reviews"],
  pasted_review: ["review", "reviews"],
  sample_review: ["review", "reviews"],
  public_review: ["review", "reviews"],
  listing: ["listing", "listings"],
  website: ["website finding", "website findings"],
  google_profile: ["Google detail", "Google details"],
  tech_stack: ["tool gap", "tool gaps"],
  owner_reported: ["from you", "from you"],
  industry_pattern: ["industry pattern", "industry patterns"],
};
const GROUP: Partial<Record<EvidenceSource, EvidenceSource>> = { pasted_review: "google_review", sample_review: "google_review", public_review: "google_review" };

/** For listing mismatches, say exactly what to fix, based on the mismatches actually found. */
function listingCopy(card: Omit<ProblemCard, "display">): { whyItMatters: string; nextStep: string } | null {
  const kinds = new Set(
    card.evidence.map((e) => e.reference?.field?.match(/^listings\.(\w+)/)?.[1]).filter((k): k is string => Boolean(k)),
  );
  if (kinds.size === 0) return null;
  const fix = [
    kinds.has("hours") ? "hours" : null,
    kinds.has("address") ? "address" : null,
    kinds.has("phone") ? "phone number" : null,
    kinds.has("services") ? "services" : null,
  ].filter(Boolean) as string[];
  const list = fix.length <= 1 ? fix.join("") : `${fix.slice(0, -1).join(", ")} and ${fix.at(-1)}`;
  const steps = [fix.length ? `Show the same ${list} on every listing` : null, kinds.has("duplicate") ? "merge duplicate listings" : null].filter(Boolean);
  const nextStep = steps.join(", then ").replace(/^m/, "M");
  const whyItMatters =
    kinds.has("hours") || kinds.has("phone")
      ? "People who see “closed” or an old number call someone else."
      : kinds.has("services")
        ? "Customers who read that you don't offer a service may not call."
        : "Customers can't tell which details are right.";
  return { whyItMatters, nextStep };
}

export function displayFor(card: Omit<ProblemCard, "display">): ProblemCard["display"] {
  const def = PROBLEMS[card.key];
  const counted = card.status === "hypothesis" ? card.evidence : card.evidence.filter((s) => s.verified);
  const counts = new Map<EvidenceSource, number>();
  for (const s of counted) {
    const k = GROUP[s.source] ?? s.source;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  // Listing evidence is counted by distinct listings, not by comparisons.
  const listingNames = new Set(counted.filter((s) => s.source === "listing").flatMap((s) => (s.links ?? []).map((l) => l.label)));
  if (listingNames.size) counts.set("listing", listingNames.size);
  const sources = [...counts.entries()]
    .map(([kind, count]) => ({ kind, count, label: kind === "owner_reported" ? "from you" : `${count} ${FAMILY_NOUN[kind][count === 1 ? 0 : 1]}` }))
    .sort((a, b) => b.count - a.count);
  const level = card.status === "confirmed" ? 3 : card.status === "likely" ? 2 : 1;
  const listing = card.key === "inconsistent_business_info" ? listingCopy(card) : null;
  return {
    headline: def.title,
    whyItMatters: listing?.whyItMatters ?? def.whyItMatters,
    nextStep: listing?.nextStep ?? def.nextStep,
    effort: def.effort,
    evidenceStrength: { level, label: level === 3 ? "Strong evidence" : level === 2 ? "Some evidence" : "Not confirmed yet", sources },
  };
}

export function overviewFor(result: Omit<DiscoveryResult, "overview">, reviews: ReviewAnalysis): DiscoveryResult["overview"] {
  const evidenced = result.problems.filter((p) => p.status !== "hypothesis");
  const quickWins = evidenced.filter((p) => p.display.effort.kind === "free");
  const needTool = evidenced.filter((p) => p.display.effort.kind === "tool");
  const parts = [
    quickWins.length ? `${quickWins.length} free fix${quickWins.length === 1 ? "" : "es"}` : null,
    needTool.length ? `${needTool.length} problem${needTool.length === 1 ? "" : "s"} a tool could help with` : null,
  ].filter(Boolean);
  return {
    headline: evidenced.length === 0 ? "No clear problems found yet" : `We found ${parts.join(" and ")}`,
    quickWins: quickWins.length,
    needTool: needTool.length,
    toCheck: result.problems.length - evidenced.length,
    topProblemKey: evidenced[0]?.key ?? null,
    strengths: reviews.praise.slice(0, 3).map((t) => ({ label: t.label, mentions: t.mentions })),
  };
}
