/**
 * The gaps list: what we couldn't confirm about a tool, in plain words, with
 * the page to look at and the field to fill in data/catalog/found/<id>.json.
 */
import { SAFETY_CHECK_NAMES, type CatalogRecord, type SafetyCheckName, type SafetyReport } from "./types.ts";

const FIELD_TEXT: Record<string, [text: string, page: string, field?: string]> = {
  description: ["Couldn't confirm a sentence that says what it does", "home", "description"],
  "pricing.small.monthlyUsd": ["Couldn't confirm the price of the cheapest plan", "pricing", "plans.small"],
  "pricing.medium.monthlyUsd": ["Couldn't confirm the price of the middle plan", "pricing", "plans.medium"],
  "pricing.large.monthlyUsd": ["Couldn't confirm the price of the top plan", "pricing", "plans.large"],
  "pricing.freeTier": ["Couldn't confirm whether there's a free plan", "pricing", "freeTier"],
  "pricing.contract": ["Couldn't confirm whether it's billed monthly or yearly", "pricing", "contract"],
  "pricing.cancellation": ["Couldn't confirm how to cancel", "pricing or terms", "cancellation"],
  "pricing.pricingUrl": ["Couldn't find the pricing page", "pricing"],
  setupMinutes: ["Couldn't confirm how long setup takes", "help", "setupMinutes"],
  setupMode: ["Couldn't confirm whether an owner can set it up alone", "help", "setupMode"],
  languages: ["Couldn't confirm which languages it works in", "features", "languages"],
  "rulesFlags.recordsCalls": ["Couldn't confirm whether it records calls", "features", "recordsCalls"],
  "rulesFlags.announcesRecording": ["Couldn't confirm whether it tells callers they're recorded", "features", "announcesRecording"],
  "rulesFlags.hipaaReady": ["Couldn't confirm whether it's HIPAA-ready", "security", "hipaaReady"],
  "rulesFlags.outboundAiCalls": ["Couldn't confirm whether its AI calls people", "features", "outboundAiCalls"],
  "rulesFlags.personalizedPricing": ["Couldn't confirm whether it sets prices per customer", "features", "personalizedPricing"],
};

/** Which found-fact fields would settle each Safety Check, and where to look. */
const CHECK_HINT: Partial<Record<SafetyCheckName, [page: string, fields: string[]]>> = {
  whoIsBehind: ["about or contact", ["companyName", "address", "leaderName"]],
  privacyPolicy: ["privacy", []],
  dataUse: ["privacy", ["trainsOnYourData", "canDeleteData"]],
  dataLocation: ["privacy or security", ["whereStored"]],
  pricingClarity: ["pricing", []],
};

const fill = (fields: string[]) => (fields.length ? ` → fill ${fields.map((f) => `"${f}"`).join(" or ")}` : "");

export function gapsFor(record: CatalogRecord, report: SafetyReport, previous: CatalogRecord | null = null): string[] {
  const gaps: string[] = [];
  if (report.verdict === "blocked") for (const flag of report.redFlags) gaps.push(`Blocked: ${flag}`);
  if (previous?.badge === "verified" && record.badge !== "verified")
    gaps.push("Needs approval again: something changed since it was approved.");
  for (const path of record.needsVerification) {
    const known = FIELD_TEXT[path];
    if (!known) gaps.push(`Couldn't confirm ${path}.`);
    else gaps.push(`${known[0]} (${known[1]} page)${fill(known[2] ? [known[2]] : [])}.`);
  }
  for (const name of SAFETY_CHECK_NAMES) {
    const check = report.checks[name];
    if (check.result === "pass" || name === "redFlags") continue;
    const hint = CHECK_HINT[name];
    gaps.push(`Safety Check: ${check.reason}${hint ? ` (${hint[0]} page)${fill(hint[1])}` : ""}`);
  }
  return gaps;
}
