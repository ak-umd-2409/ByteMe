/**
 * Saved fact sheets: data/safety/<toolId>.json. They let the demo show Safety
 * Check results with no internet or AI. Server/script use only (reads files).
 */
import { existsSync, readFileSync } from "node:fs";
import { PAGE_KINDS, type SafetyFacts } from "./types.ts";

const DIR = new URL("../../data/safety/", import.meta.url);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The path a tool's fact sheet is saved at, or null for an unsafe id. */
export function factsPath(toolId: string): URL | null {
  return SLUG.test(toolId) ? new URL(`${toolId}.json`, DIR) : null;
}

export function loadFacts(toolId: string): SafetyFacts | null {
  const path = factsPath(toolId);
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as SafetyFacts;
}

type Obj = Record<string, any>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const AI_KEYS = ["companyName", "address", "leaderName", "trainsOnYourData", "canDeleteData", "whereStored", "securityCertification"];

/** Shape check of a fact sheet. Empty list = valid. */
export function validateFacts(x: unknown): string[] {
  if (!isObj(x)) return ["facts: must be an object"];
  const errors: string[] = [];
  const err = (path: string, problem: string) => errors.push(`${path}: ${problem}`);
  const i = x.input;
  if (!isObj(i) || typeof i.url !== "string" || typeof i.name !== "string" || typeof i.handlesSensitiveData !== "boolean")
    err("input", "needs url, name and handlesSensitiveData");
  if (!isDate(x.collectedAt)) err("collectedAt", "must be a YYYY-MM-DD date");
  if (!isObj(x.pages)) err("pages", "is required");
  else
    for (const kind of PAGE_KINDS) {
      const p = x.pages[kind];
      if (p === null) continue;
      if (!isObj(p)) err(`pages.${kind}`, "must be a page, { error } or null");
      else if ("error" in p) {
        if (typeof p.error !== "string") err(`pages.${kind}.error`, "must be text");
      } else if (
        typeof p.url !== "string" ||
        typeof p.finalUrl !== "string" ||
        typeof p.status !== "number" ||
        !isDate(p.fetchedAt) ||
        typeof p.contentHash !== "string" ||
        typeof p.text !== "string"
      )
        err(`pages.${kind}`, "needs url, finalUrl, status, fetchedAt, contentHash and text");
    }
  const d = x.domain;
  if (!isObj(d) || typeof d.name !== "string" || !(d.registeredAt === null || isDate(d.registeredAt)) || d.source !== "rdap")
    err("domain", "needs name, registeredAt (date or null) and source rdap");
  if (typeof x.https !== "boolean") err("https", "must be true or false");
  if (typeof x.downloadPrompt !== "boolean") err("downloadPrompt", "must be true or false");
  const ai = x.ai;
  if (!isObj(ai) || !isObj(ai.ran) || typeof ai.ran.about !== "boolean" || typeof ai.ran.privacy !== "boolean")
    err("ai", "needs ran.about and ran.privacy");
  else
    for (const key of AI_KEYS) {
      const a = ai[key];
      if (a !== "unknown" && !(isObj(a) && typeof a.answer === "string" && typeof a.quote === "string" && typeof a.pageUrl === "string"))
        err(`ai.${key}`, 'must be "unknown" or { answer, quote, pageUrl }');
    }
  if (!Array.isArray(x.riskySentences) || !x.riskySentences.every((s: unknown) => typeof s === "string"))
    err("riskySentences", "must be a list of text");
  if (!["clean", "listed", "not_run"].includes(x.safeBrowsing)) err("safeBrowsing", "must be clean, listed or not_run");
  return errors;
}
