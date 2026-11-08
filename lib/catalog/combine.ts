/**
 * Combines the per-tool cards into data/catalog/real.json, the file the app
 * reads. Refuses to write anything if one card fails the data checker.
 * Held tools are left out: they can never be shown to owners, and the data
 * checker only allows "listed" for tools whose Safety Check is ready.
 */
import { validateCatalog } from "./validate.ts";

export type CombineResult = { ok: true; json: string; skipped: string[] } | { ok: false; errors: string[] };

const verdictOf = (r: unknown) => (r as { safetyCheck?: { verdict?: string } })?.safetyCheck?.verdict;
const idOf = (r: unknown) => String((r as { id?: unknown })?.id ?? "");

export function combine(records: unknown[]): CombineResult {
  const skipped = records.filter((r) => verdictOf(r) === "held").map(idOf);
  const kept = records.filter((r) => verdictOf(r) !== "held");
  const errors = validateCatalog(kept);
  if (errors.length) return { ok: false, errors };
  const sorted = [...kept].sort((a, b) => idOf(a).localeCompare(idOf(b)));
  return { ok: true, json: `${JSON.stringify(sorted, null, 2)}\n`, skipped: skipped.sort() };
}
