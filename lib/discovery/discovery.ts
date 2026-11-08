/**
 * Discovery: find → Safety Check → a person decides → publish → re-check.
 * Pure state changes plus one injected `check` function, so it's fully testable
 * without the internet. See docs/DISCOVERY.md.
 */
import type { ListEntry } from "../catalog/list.ts";
import type { Badge, CatalogRecord } from "../catalog/types.ts";
import { USE_CASES, type UseCase } from "../recommend/types.ts";
import { approveTool } from "../safety/approve.ts";
import { findLookalike } from "../safety/redFlags.ts";
import { normalizeWebsiteUrl } from "../shared/safeFetch.ts";
import type { Candidate, DiscoveryState, RunSummary, Source } from "./types.ts";

/** Runs the full Safety Check + card-filler for one tool and returns its tool card. */
export type CheckFn = (entry: ListEntry, previous: CatalogRecord | null) => Promise<CatalogRecord>;

export const RECHECK_AFTER_DAYS = 90;
const MAX_ATTEMPTS = 3;
const PRIORITY: Record<Source, number> = { owner_check: 0, vendor_submission: 1, recheck: 2, watch_list: 3 };

const day = (d: Date) => d.toISOString().slice(0, 10);
const hostOf = (url: string) => normalizeWebsiteUrl(url)?.hostname.toLowerCase().replace(/^www\./, "") ?? null;
const sameSite = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`) || domain.endsWith(`.${host}`);

/** The built-in catalog with discovery's checked and decided cards laid over it (by id). */
export function liveCatalog(builtIn: CatalogRecord[], state: DiscoveryState): CatalogRecord[] {
  const ids = new Set(builtIn.map((r) => r.id));
  return [...builtIn.map((r) => state.records[r.id] ?? r), ...Object.values(state.records).filter((r) => !ids.has(r.id))];
}

function slugFor(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "tool";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

const nameFromHost = (host: string) => {
  const word = host.split(".")[0] ?? host;
  return word.charAt(0).toUpperCase() + word.slice(1);
};

// ---------------------------------------------------------------- intake

export interface SubmitInput {
  url: string;
  name?: string;
  useCases?: string[];
  category?: string;
  sensitive?: boolean;
  source: "owner_check" | "vendor_submission";
}

export type SubmitOutcome =
  | { kind: "invalid"; message: string }
  | { kind: "in_catalog"; message: string; toolId: string; name: string; badge: Badge }
  | { kind: "already_queued"; message: string; toolId: string; status: Candidate["status"] }
  | { kind: "blocked"; message: string; toolId: string }
  | { kind: "queued"; message: string; toolId: string };

const BADGE_WORDS: Record<Badge, string> = {
  verified: "is in our catalog and was checked and approved by a person",
  listed: "is in our catalog but a person hasn't reviewed it yet, so we don't recommend it",
  blocked: "failed our Safety Check, so we never show it to owners",
};

/** Adds a tool someone sent us (an owner's link check or a vendor application). */
export function submit(state: DiscoveryState, catalog: CatalogRecord[], input: SubmitInput, now: Date): { state: DiscoveryState; outcome: SubmitOutcome } {
  const url = normalizeWebsiteUrl(input.url);
  if (!url || url.protocol !== "https:" && url.protocol !== "http:") return { state, outcome: { kind: "invalid", message: "That doesn't look like a website address. Try something like https://example.com." } };
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!host.includes(".") || /^[\d.]+$/.test(host)) return { state, outcome: { kind: "invalid", message: "That doesn't look like a website address. Try something like https://example.com." } };

  const inCatalog = catalog.find((r) => sameSite(host, r.vendor.domain.toLowerCase().replace(/^www\./, "")));
  if (inCatalog)
    return { state, outcome: { kind: "in_catalog", toolId: inCatalog.id, name: inCatalog.name, badge: inCatalog.badge, message: `${inCatalog.name} ${BADGE_WORDS[inCatalog.badge]}.` } };

  const queued = state.candidates.find((c) => sameSite(host, c.domain));
  if (queued) {
    const message =
      queued.status === "blocked"
        ? `We've already looked at ${queued.name}. ${queued.note ?? "It failed our Safety Check."} We'll never recommend it.`
        : queued.status === "approved"
          ? `${queued.name} has been checked and approved.`
          : `${queued.name} is already in line for a check. A person will review it before we ever recommend it.`;
    return { state, outcome: { kind: "already_queued", toolId: queued.id, status: queued.status, message } };
  }

  const taken = new Set([...catalog.map((r) => r.id), ...state.candidates.map((c) => c.id)]);
  const name = input.name?.trim().slice(0, 80) || nameFromHost(host);
  const useCases = (input.useCases ?? []).filter((u): u is UseCase => (USE_CASES as readonly string[]).includes(u));
  const lookalike = findLookalike(host);
  const candidate: Candidate = {
    id: slugFor(name, taken),
    name,
    url: url.origin,
    domain: host,
    source: input.source,
    useCases,
    category: input.category?.trim().slice(0, 60) || "AI tool",
    sensitive: Boolean(input.sensitive),
    addedAt: now.toISOString(),
    status: lookalike ? "blocked" : "new",
    note: lookalike ? `Its web address imitates ${lookalike.brand} (“${lookalike.word}”). Blocked automatically.` : null,
    checkedAt: null,
    attempts: 0,
    decidedBy: lookalike ? "Automatic check" : null,
    decidedAt: lookalike ? now.toISOString() : null,
  };
  const next = { ...state, candidates: [...state.candidates, candidate] };
  if (lookalike)
    return {
      state: next,
      outcome: { kind: "blocked", toolId: candidate.id, message: `Be careful: ${host} imitates ${lookalike.brand}'s name. Tools like this are often scams, so we've blocked it.` },
    };
  return {
    state: next,
    outcome: {
      kind: "queued",
      toolId: candidate.id,
      message:
        input.source === "vendor_submission"
          ? `Thanks. ${name} is in line for our Safety Check, then a person reviews it. We'll only list it if it passes.`
          : `${host} isn't in our catalog yet, so we've added it to the list to check. Until a person approves it, treat it with care.`,
    },
  };
}

// ---------------------------------------------------------------- run

export interface RunOptions {
  /** The built-in catalog (data/catalog). */
  catalog: CatalogRecord[];
  /** Our watch list (data/catalog/list.json). */
  watchList: ListEntry[];
  check: CheckFn;
  now: Date;
  trigger: RunSummary["trigger"];
  /** Most tools to check in one run (a serverless function has a time limit). */
  limit?: number;
  /** Most watch-list tools to add per run, so the queue stays reviewable. */
  watchListIntake?: number;
}

const toEntry = (c: Candidate): ListEntry => ({
  id: c.id,
  name: c.name,
  url: c.url,
  category: c.category,
  useCases: c.useCases,
  industries: ["any"],
  sensitive: c.sensitive,
  batch: 2,
});

const noteFor = (r: CatalogRecord): string => {
  const sc = r.safetyCheck;
  if (sc.verdict === "blocked") return sc.redFlags[0] ?? "It failed a safety check.";
  if (sc.verdict === "held") {
    const first = Object.values(sc.checks).find((c) => c.result !== "pass");
    return `Held: ${first?.reason ?? "some checks couldn't be confirmed"}. A person needs to find the missing facts before it can be approved.`;
  }
  return "Passed the automatic checks. Ready for a person to review.";
};

export async function runDiscovery(state: DiscoveryState, opts: RunOptions): Promise<{ state: DiscoveryState; summary: RunSummary }> {
  const { now, check } = opts;
  const limit = opts.limit ?? 3;
  const next: DiscoveryState = structuredClone(state);
  const catalog = liveCatalog(opts.catalog, next);
  const knownIds = new Set([...catalog.map((r) => r.id), ...next.candidates.map((c) => c.id)]);
  const knownHosts = [...catalog.map((r) => r.vendor.domain.toLowerCase().replace(/^www\./, "")), ...next.candidates.map((c) => c.domain)];
  const added = { watchList: 0, recheck: 0 };

  // 1 · Find: watch-list tools we haven't checked yet (batch 1 first).
  const fresh = [...opts.watchList]
    .sort((a, b) => a.batch - b.batch)
    .filter((e) => {
      const host = hostOf(e.url);
      return host && !knownIds.has(e.id) && !knownHosts.some((h) => sameSite(host, h));
    })
    .slice(0, opts.watchListIntake ?? 5);
  for (const e of fresh) {
    next.candidates.push({
      id: e.id,
      name: e.name,
      url: e.url,
      domain: hostOf(e.url)!,
      source: "watch_list",
      useCases: e.useCases,
      category: e.category,
      sensitive: e.sensitive,
      addedAt: now.toISOString(),
      status: "new",
      note: null,
      checkedAt: null,
      attempts: 0,
      decidedBy: null,
      decidedAt: null,
    });
    knownIds.add(e.id);
    added.watchList += 1;
  }

  // 6 · Re-check: real (not sample) tools whose last check is too old.
  const cutoff = day(new Date(now.getTime() - RECHECK_AFTER_DAYS * 86_400_000));
  for (const r of catalog) {
    if (r.sample || r.badge === "blocked" || r.lastChecked > cutoff) continue;
    const pending = next.candidates.find((c) => c.id === r.id && (c.status === "new" || c.status === "failed"));
    if (pending) continue;
    const existing = next.candidates.findIndex((c) => c.id === r.id);
    const c: Candidate = {
      id: r.id,
      name: r.name,
      url: r.vendor.website,
      domain: r.vendor.domain,
      source: "recheck",
      useCases: r.useCases,
      category: r.category,
      sensitive: false,
      addedAt: now.toISOString(),
      status: "new",
      note: `Last checked ${r.lastChecked}.`,
      checkedAt: null,
      attempts: 0,
      decidedBy: null,
      decidedAt: null,
    };
    if (existing >= 0) next.candidates[existing] = c;
    else next.candidates.push(c);
    added.recheck += 1;
  }

  // 2–3 · Extract + Safety Check, most urgent first.
  const queue = next.candidates
    .filter((c) => c.status === "new" || (c.status === "failed" && c.attempts < MAX_ATTEMPTS))
    .sort((a, b) => PRIORITY[a.source] - PRIORITY[b.source] || a.addedAt.localeCompare(b.addedAt))
    .slice(0, limit);
  const tally = { checked: 0, ready: 0, held: 0, blocked: 0, failed: 0 };
  for (const c of queue) {
    c.attempts += 1;
    try {
      const previous = catalog.find((r) => r.id === c.id) ?? null;
      const record = await check(toEntry(c), previous);
      // A person confirms what the tool is for; keep what the submitter said if the card has nothing.
      if (!record.useCases.length && c.useCases.length) record.useCases = [...c.useCases];
      next.records[c.id] = record;
      c.status = record.badge === "blocked" ? "blocked" : record.badge === "verified" ? "approved" : "checked";
      c.note = noteFor(record);
      c.checkedAt = now.toISOString();
      if (c.status === "blocked") {
        c.decidedBy = "Automatic check";
        c.decidedAt = now.toISOString();
      }
      tally.checked += 1;
      tally[record.safetyCheck.verdict] += 1;
    } catch (error) {
      c.status = "failed";
      c.note = `The check couldn't finish: ${error instanceof Error ? error.message : String(error)}. We'll try again next run.`;
      tally.failed += 1;
    }
  }

  const summary: RunSummary = {
    ranAt: now.toISOString(),
    trigger: opts.trigger,
    added,
    ...tally,
    waiting: next.candidates.filter((c) => c.status === "new" || (c.status === "failed" && c.attempts < MAX_ATTEMPTS)).length,
  };
  next.runs = [summary, ...next.runs].slice(0, 10);
  return { state: next, summary };
}

// ---------------------------------------------------------------- decide

export interface Decision {
  action: "approve" | "block";
  reviewer: string;
  reason?: string;
  /** What the tool is for, confirmed by the reviewer (needed to approve). */
  useCases?: string[];
}

export function decide(
  state: DiscoveryState,
  catalog: CatalogRecord[],
  id: string,
  d: Decision,
  now: Date,
): { ok: true; state: DiscoveryState; message: string } | { ok: false; message: string } {
  const reviewer = d.reviewer.trim().slice(0, 60);
  if (!reviewer) return { ok: false, message: "Add the reviewer's name." };
  const next = structuredClone(state);
  const candidate = next.candidates.find((c) => c.id === id) ?? null;
  const record = next.records[id] ?? liveCatalog(catalog, next).find((r) => r.id === id) ?? null;
  if (!candidate && !record) return { ok: false, message: "We couldn't find that tool." };
  const at = now.toISOString();

  if (d.action === "block") {
    const reason = d.reason?.trim().slice(0, 200) || "A reviewer decided it isn't safe to recommend.";
    if (record) {
      const blocked = structuredClone(record);
      blocked.badge = "blocked";
      delete blocked.reviewedAt;
      blocked.reviewedBy = reviewer;
      blocked.safetyCheck = { ...blocked.safetyCheck, redFlags: [...blocked.safetyCheck.redFlags, `A reviewer blocked it: ${reason}`] };
      next.records[id] = blocked;
    }
    if (candidate) Object.assign(candidate, { status: "blocked", note: `Blocked by ${reviewer}: ${reason}`, decidedBy: reviewer, decidedAt: at });
    return { ok: true, state: next, message: "Blocked. Owners will never see it." };
  }

  if (!record) return { ok: false, message: "Run the Safety Check on this tool before approving it." };
  const useCases = d.useCases?.filter((u): u is UseCase => (USE_CASES as readonly string[]).includes(u));
  const withUses = { ...structuredClone(record), useCases: useCases?.length ? useCases : record.useCases };
  if (!withUses.useCases.length) return { ok: false, message: "Pick at least one problem this tool solves before approving it." };
  const approved = approveTool(withUses, reviewer, day(now));
  if (!approved.ok) return { ok: false, message: approved.reason };
  next.records[id] = approved.record;
  if (candidate) Object.assign(candidate, { status: "approved", note: `Approved by ${reviewer}.`, decidedBy: reviewer, decidedAt: at, useCases: approved.record.useCases });
  return { ok: true, state: next, message: "Approved. It's now in the catalog as ✓ Verified." };
}
