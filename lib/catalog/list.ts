/**
 * The tool list: which real AI tools we put in the catalog, and our own
 * choices about each (problem types, business types, batch). These are not
 * vendor facts, so they need no quote. See docs/specs/b-real-catalog.md §2.
 * Server/script use only (reads a file).
 */
import { readFileSync } from "node:fs";
import { INDUSTRIES } from "../business/industry.ts";
import type { IndustryKey } from "../business/types.ts";
import { USE_CASES, type UseCase } from "../recommend/types.ts";

export interface ListEntry {
  id: string;
  name: string;
  url: string;
  category: string;
  useCases: UseCase[];
  industries: (IndustryKey | "any")[];
  /** Set when this is an AI feature inside a tool owners already use, e.g. "Square". */
  existingProduct?: string;
  /** Takes payments or health info (passed to the Safety Check). */
  sensitive: boolean;
  batch: 1 | 2;
}

const LIST_FILE = new URL("../../data/catalog/list.json", import.meta.url);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const INDUSTRY_KEYS = new Set<string>([...Object.keys(INDUSTRIES), "any"]);
const USE_CASE_SET = new Set<string>(USE_CASES);

type Obj = Record<string, any>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** Problems with the list, one line each. Empty list = valid. */
export function validateList(entries: unknown[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  entries.forEach((e, i) => {
    const label = isObj(e) && typeof e.id === "string" ? e.id : `#${i}`;
    const err = (field: string, problem: string) => errors.push(`${label} → ${field}: ${problem}`);
    if (!isObj(e)) return void err("entry", "must be an object");
    if (!isStr(e.id) || !SLUG.test(e.id)) err("id", "must be a lowercase slug like my-tool");
    else if (seen.has(e.id)) err("id", "duplicate id");
    else seen.add(e.id);
    if (!isStr(e.name)) err("name", "is required");
    if (!isStr(e.category)) err("category", "is required");
    if (typeof e.url !== "string" || !/^https:\/\/[^\s/]+\.[^\s]+$/.test(e.url)) err("url", "must be an https address");
    if (!Array.isArray(e.useCases) || e.useCases.length === 0) err("useCases", "needs at least one problem type");
    else for (const u of e.useCases) if (!USE_CASE_SET.has(u)) err("useCases", `"${u}" is not one of the 12 problem types`);
    if (!Array.isArray(e.industries) || e.industries.length === 0) err("industries", "needs at least one industry");
    else for (const ind of e.industries) if (!INDUSTRY_KEYS.has(ind)) err("industries", `"${ind}" is not a known industry`);
    if (e.existingProduct !== undefined && !isStr(e.existingProduct)) err("existingProduct", "must be a product name");
    if (typeof e.sensitive !== "boolean") err("sensitive", "must be true or false");
    if (e.batch !== 1 && e.batch !== 2) err("batch", "must be 1 or 2");
  });
  return errors;
}

export function loadList(): ListEntry[] {
  return JSON.parse(readFileSync(LIST_FILE, "utf8")) as ListEntry[];
}
