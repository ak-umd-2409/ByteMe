/**
 * Which catalog tools fit an owner, and plain words for the ones we leave out.
 */
import { INDUSTRIES } from "../business/industry.ts";
import type { IndustryKey } from "../business/types.ts";
import type { CatalogTool } from "../recommend/types.ts";
import { toCatalogTool } from "./toCatalogTool.ts";
import type { CatalogRecord } from "./types.ts";

const norm = (s: string) => s.trim().toLowerCase();

/** The industry key for a key or label ("Restaurant", "restaurant"), or null if we don't know it. */
function industryKey(industry: string): IndustryKey | null {
  const n = norm(industry);
  const hit = Object.values(INDUSTRIES).find((i) => i.key === n || norm(i.label) === n);
  return hit ? hit.key : null;
}

/** True when the tool is made for any business or for this owner's type of business. */
export function fitsIndustry(record: CatalogRecord, industry: string): boolean {
  if (record.industries.includes("any")) return true;
  const key = industryKey(industry);
  return key !== null && record.industries.includes(key);
}

/** The engine's rule reasons (lib/recommend/engine.ts exclusionReason), in an owner's words. */
const PLAIN: Record<string, string> = {
  "Call recording consent could not be confirmed for Maryland.":
    "we couldn't confirm it warns callers before recording (Maryland law).",
  "Health data requires a suitable tool and a signed business associate agreement.":
    "we couldn't confirm it's safe for patient health information (HIPAA).",
  "Personalized pricing is unsuitable for this Maryland food business.":
    "it may charge different customers different prices, which Maryland limits for food businesses.",
  "Outbound AI calls require a documented consent path.":
    "it may make AI phone calls, which need your customers' permission first (federal rule).",
  "Data deletion or minimization could not be confirmed for this customer list.":
    "we couldn't confirm it can delete customer data (Maryland privacy law).",
  "You asked for no call recording.": "you asked for no call recording.",
  "You asked for no contract.": "you asked for no long contract.",
  "Spanish support is required.": "it doesn't work in Spanish.",
  "Offline operation is required.": "it needs the internet to work.",
};

/** Why a tool that never passed review is out (same order as the tool screens). */
function safetyReason(r: CatalogRecord): string {
  if (r.safetyCheck.redFlags.length) return r.safetyCheck.redFlags[0];
  if (r.badge === "listed") return "Waiting for a person to check it. We never recommend tools before that.";
  const failed = Object.values(r.safetyCheck.checks).find((c) => c.result === "fail");
  return failed?.reason ?? "It didn't pass our safety check.";
}

/**
 * The reason shown under "Why not these?". A verified tool left out by an owner
 * rule says which rule, never that it failed the safety check.
 */
export function leftOutReason(record: CatalogRecord | undefined, engineReason: string): string {
  if (record && record.badge !== "verified") return safetyReason(record);
  return `Not shown: ${PLAIN[engineReason] ?? engineReason}`;
}

/** The tools the recommendation engine may pick from for this owner's type of business. */
export function catalogFor(records: CatalogRecord[], industry: string): CatalogTool[] {
  return records
    .filter((r) => fitsIndustry(r, industry))
    .map(toCatalogTool)
    .filter((t): t is CatalogTool => t !== null);
}
