/**
 * The approval guard: the only way a tool becomes "verified".
 * A person can approve only tools whose Safety Check verdict is "ready".
 */
import type { CatalogRecord } from "../catalog/types.ts";

export type ApproveResult = { ok: true; record: CatalogRecord } | { ok: false; reason: string };

export function approveTool(record: CatalogRecord, reviewer: string, date: string): ApproveResult {
  const verdict = record.safetyCheck?.verdict;
  if (verdict === "blocked") return { ok: false, reason: "This tool is blocked and can't be approved." };
  if (verdict !== "ready")
    return { ok: false, reason: "This tool didn't pass the core safety checks, so it can't be approved." };
  if (!reviewer.trim()) return { ok: false, reason: "Add the reviewer's name to approve this tool." };
  return { ok: true, record: { ...structuredClone(record), badge: "verified", reviewedAt: date, reviewedBy: reviewer.trim() } };
}
