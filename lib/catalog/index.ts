/**
 * Public catalog functions for teammates. See docs/CONTRACTS.md.
 *
 * The catalog is read from JSON files in data/catalog, so it works with no
 * database, network or LLM. Add a new file by adding one import line below.
 */
import sample from "../../data/catalog/sample.json" with { type: "json" };
import type { IndustryKey } from "../business/types.ts";
import type { CatalogTool, UseCase } from "../recommend/types.ts";
import { toCatalogTool } from "./toCatalogTool.ts";
import type { CatalogRecord } from "./types.ts";

const FILES: unknown[][] = [sample];

export function loadCatalog(): CatalogRecord[] {
  return structuredClone(FILES.flat()) as CatalogRecord[];
}

export interface ToolFilters {
  useCase?: UseCase;
  industry?: IndustryKey;
  /** A product the owner already uses, e.g. "QuickBooks". Case-insensitive. */
  worksWith?: string;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Only Verified, human-reviewed tools — ever — in the recommendation engine's format. */
export function getVerifiedTools(filters: ToolFilters = {}, records: CatalogRecord[] = loadCatalog()): CatalogTool[] {
  return records
    .filter((r) => r.badge === "verified" && Boolean(r.reviewedAt))
    .filter((r) => !filters.useCase || r.useCases.includes(filters.useCase))
    .filter((r) => !filters.industry || r.industries.includes("any") || r.industries.includes(filters.industry))
    .filter(
      (r) => !filters.worksWith || r.worksWith.some((w) => w.type !== "none" && same(w.product, filters.worksWith!)),
    )
    .map((r) => toCatalogTool(structuredClone(r)))
    .filter((t): t is CatalogTool => t !== null);
}

/** Any one tool with its full record (any badge), or null if there is no such tool. */
export function getTool(id: string, records: CatalogRecord[] = loadCatalog()): CatalogRecord | null {
  const found = records.find((r) => r.id === id);
  return found ? structuredClone(found) : null;
}
