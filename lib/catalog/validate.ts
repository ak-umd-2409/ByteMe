/**
 * Data checker for catalog records. Returns a list of problems; an empty list
 * means the record is valid. Used by tests and by the discovery pipeline
 * before anything is saved, so bad or invented data never reaches owners.
 */
import { INDUSTRIES } from "../business/industry.ts";
import { USE_CASES } from "../recommend/types.ts";
import { PRIVACY_KEYS, RULES_FLAG_KEYS, SAFETY_CHECK_NAMES } from "./types.ts";

const BADGES = ["verified", "listed", "blocked"];
const CHECK_RESULTS = ["pass", "fail", "unknown"];
const VERDICTS = ["blocked", "held", "ready"];
const WORKS_WITH_TYPES = ["native", "zapier", "none"];
const CONTRACTS = ["monthly", "annual", "unknown"];
const SETUP_MODES = ["self_serve", "needs_help"];
const INDUSTRY_KEYS = new Set<string>([...Object.keys(INDUSTRIES), "any"]);
const USE_CASE_SET = new Set<string>(USE_CASES);

type Obj = Record<string, any>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
const isUrl = (v: unknown) => typeof v === "string" && /^https:\/\/[^\s]+$/.test(v);
const isNumOrUnknown = (v: unknown) => (typeof v === "number" && v >= 0) || v === "unknown";
const isBoolOrUnknown = (v: unknown) => typeof v === "boolean" || v === "unknown";
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};

/** Dotted paths of every "unknown" value, except where unknown is a normal answer. */
export function unknownPaths(value: unknown, path: string, out: string[]) {
  if (path === "safetyCheck") return;
  if (value === "unknown") {
    if (/^privacyCard\.\w+\.answer$/.test(path)) return;
    out.push(path);
    return;
  }
  if (Array.isArray(value)) value.forEach((v, i) => unknownPaths(v, `${path}[${i}]`, out));
  else if (isObj(value))
    for (const [k, v] of Object.entries(value)) unknownPaths(v, path ? `${path}.${k}` : k, out);
}

export function validateRecord(record: unknown): string[] {
  const errors: string[] = [];
  const err = (path: string, problem: string) => errors.push(`${path}: ${problem}`);
  if (!isObj(record)) return ["record: must be an object"];
  const r = record;

  if (!isStr(r.id) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.id)) err("id", "must be a lowercase slug");
  for (const f of ["name", "description", "category"]) if (!isStr(r[f])) err(f, "is required");

  if (!isObj(r.vendor) || !isStr(r.vendor.company) || !isUrl(r.vendor.website) || !isStr(r.vendor.domain))
    err("vendor", "needs company, an https website and domain");

  if (!Array.isArray(r.useCases) || r.useCases.length === 0) err("useCases", "needs at least one problem type");
  else for (const u of r.useCases) if (!USE_CASE_SET.has(u)) err("useCases", `"${u}" is not one of the 12 problem types`);

  if (!Array.isArray(r.industries) || r.industries.length === 0) err("industries", "needs at least one industry");
  else for (const i of r.industries) if (!INDUSTRY_KEYS.has(i)) err("industries", `"${i}" is not a known industry`);

  const p = r.pricing;
  if (!isObj(p)) err("pricing", "is required");
  else {
    if (p.asOf !== "Nov 2026") err("pricing.asOf", 'must be "Nov 2026"');
    for (const tier of ["small", "medium", "large"]) {
      if (!isObj(p[tier]) || !isNumOrUnknown(p[tier].monthlyUsd) || typeof p[tier].note !== "string")
        err(`pricing.${tier}`, "needs monthlyUsd (number or unknown) and a note");
    }
    if (!isBoolOrUnknown(p.freeTier)) err("pricing.freeTier", "must be true, false or unknown");
    if (!CONTRACTS.includes(p.contract)) err("pricing.contract", "must be monthly, annual or unknown");
    if (typeof p.cancellation !== "string") err("pricing.cancellation", "is required");
    if (!isUrl(p.pricingUrl) && p.pricingUrl !== "unknown") err("pricing.pricingUrl", "must be an https URL");
  }

  if (!Array.isArray(r.worksWith)) err("worksWith", "must be a list");
  else
    r.worksWith.forEach((w: unknown, i: number) => {
      if (!isObj(w) || !isStr(w.product) || !WORKS_WITH_TYPES.includes(w.type))
        err(`worksWith[${i}]`, "needs product and type native, zapier or none");
    });

  if (!isNumOrUnknown(r.setupMinutes)) err("setupMinutes", "must be a number or unknown");
  if (!SETUP_MODES.includes(r.setupMode)) err("setupMode", "must be self_serve or needs_help");
  if (!Array.isArray(r.languages) || r.languages.length === 0) err("languages", "needs at least one language");

  if (!isObj(r.privacyCard)) err("privacyCard", "is required");
  else
    for (const key of PRIVACY_KEYS) {
      const a = r.privacyCard[key];
      const path = `privacyCard.${key}`;
      if (!isObj(a) || !isStr(a.answer) || !isStr(a.plain)) err(path, "needs answer and plain");
      else if (a.answer !== "unknown" && (!isStr(a.quote) || !isUrl(a.sourceUrl)))
        err(path, "an answer other than unknown needs the quoted sentence and its source URL");
    }

  if (!isObj(r.rulesFlags)) err("rulesFlags", "is required");
  else
    for (const key of RULES_FLAG_KEYS)
      if (!isBoolOrUnknown(r.rulesFlags[key])) err(`rulesFlags.${key}`, "must be true, false or unknown");

  if (r.reviews !== undefined) {
    const rv = r.reviews;
    if (!isObj(rv) || typeof rv.rating !== "number" || typeof rv.count !== "number" || !isStr(rv.source))
      err("reviews", "needs rating, count and source");
  }

  if (!BADGES.includes(r.badge)) err("badge", "must be verified, listed or blocked");
  if (r.badge === "verified" && !isDate(r.reviewedAt)) err("reviewedAt", "is required for verified tools");

  const s = r.safetyCheck;
  if (!isObj(s) || !isDate(s.ranAt) || !isObj(s.checks) || !Array.isArray(s.redFlags)) err("safetyCheck", "needs ranAt, checks and redFlags");
  else
    for (const name of SAFETY_CHECK_NAMES) {
      const c = s.checks[name];
      if (!isObj(c) || !CHECK_RESULTS.includes(c.result) || typeof c.reason !== "string" || !Array.isArray(c.evidence))
        err(`safetyCheck.checks.${name}`, "needs result, reason and evidence");
    }
  if (isObj(s)) {
    if (!VERDICTS.includes(s.verdict)) err("safetyCheck.verdict", "must be blocked, held or ready");
    else if ((r.badge === "verified" || r.badge === "listed") && s.verdict !== "ready")
      err("safetyCheck.verdict", "only tools with verdict ready can be listed or verified");
    else if (r.badge === "blocked" && s.verdict !== "blocked")
      err("safetyCheck.verdict", "a blocked tool must have verdict blocked");
    if (!Array.isArray(s.warnings)) err("safetyCheck.warnings", "must be a list");
  }
  if (r.badge === "blocked" && isObj(s) && Array.isArray(s.redFlags) && s.redFlags.length === 0)
    err("safetyCheck.redFlags", "a blocked tool must say why");

  if (!isDate(r.lastChecked)) err("lastChecked", "must be a date");
  if (!Array.isArray(r.sources) || r.sources.length === 0 || !r.sources.every(isUrl))
    err("sources", "needs at least one https URL");
  if (!Array.isArray(r.needsVerification)) err("needsVerification", "must be a list");
  else {
    const unknowns: string[] = [];
    unknownPaths(r, "", unknowns);
    for (const path of unknowns)
      if (!r.needsVerification.includes(path)) err(path, 'is "unknown" but not listed in needsVerification');
  }

  if (r.sample !== undefined) {
    if (r.sample !== true) err("sample", "must be true or left out");
    const urls = [r.vendor?.website, ...(Array.isArray(r.sources) ? r.sources : [])].filter((u) => typeof u === "string");
    if (!urls.every((u: string) => hostOf(u).endsWith(".example")))
      err("sample", "sample tools must only use .example domains");
  }

  return errors;
}

export function validateCatalog(records: unknown[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  records.forEach((rec, i) => {
    const id = isObj(rec) && typeof rec.id === "string" ? rec.id : `#${i}`;
    for (const e of validateRecord(rec)) errors.push(`${id} → ${e}`);
    if (seen.has(id)) errors.push(`${id} → id: duplicate id`);
    seen.add(id);
  });
  return errors;
}
