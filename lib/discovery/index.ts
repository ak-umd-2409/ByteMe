/**
 * Discovery service: the functions routes and pages call. See docs/DISCOVERY.md.
 */
import { loadCatalog } from "../catalog/index.ts";
import watch from "../../data/catalog/list.json" with { type: "json" };
import type { ListEntry } from "../catalog/list.ts";
import type { CatalogRecord } from "../catalog/types.ts";
import { decide, liveCatalog, runDiscovery, submit, type CheckFn, type Decision, type SubmitInput } from "./discovery.ts";
import { getStore, type DiscoveryStore } from "./store.ts";
import type { DiscoveryState } from "./types.ts";

// Imported (not read from disk) so it's always bundled with the server code.
const loadList = (): ListEntry[] => structuredClone(watch) as ListEntry[];

export { liveCatalog, RECHECK_AFTER_DAYS } from "./discovery.ts";
export type { CheckFn, Decision, SubmitInput, SubmitOutcome } from "./discovery.ts";
export { getStore, memoryStore, fileStore, redisStore } from "./store.ts";
export type { DiscoveryStore } from "./store.ts";
export * from "./types.ts";

/** The catalog owners see: the built-in tools plus everything discovery checked or decided. */
export async function loadLiveCatalog(store: DiscoveryStore = getStore(), env: NodeJS.ProcessEnv = process.env): Promise<CatalogRecord[]> {
  let records: CatalogRecord[];
  try {
    records = liveCatalog(loadCatalog(), await store.load());
  } catch {
    // Storage down: owners still get the built-in catalog.
    records = loadCatalog();
  }
  // CATALOG_SAMPLES=hide drops the made-up demo tools once real tools are approved.
  return env.CATALOG_SAMPLES === "hide" ? records.filter((r) => !r.sample) : records;
}

export async function submitTool(input: SubmitInput, store: DiscoveryStore = getStore(), now = new Date()) {
  const state = await store.load();
  const { state: next, outcome } = submit(state, liveCatalog(loadCatalog(), state), input, now);
  if (next !== state) await store.save(next);
  return outcome;
}

export async function runNow(opts: { check: CheckFn; trigger: "manual" | "schedule"; limit?: number }, store: DiscoveryStore = getStore(), now = new Date()) {
  const { state, summary } = await runDiscovery(await store.load(), { catalog: loadCatalog(), watchList: loadList(), now, ...opts });
  await store.save(state);
  return summary;
}

export async function decideTool(id: string, d: Decision, store: DiscoveryStore = getStore(), now = new Date()) {
  const result = decide(await store.load(), loadCatalog(), id, d, now);
  if (result.ok) await store.save(result.state);
  return result.ok ? { ok: true as const, message: result.message } : { ok: false as const, message: result.message };
}

/** What the review page shows. */
/** How many real tools we track (the watch list). */
export const watchListSize = () => (watch as unknown[]).length;

export async function queueView(store: DiscoveryStore = getStore()) {
  const state: DiscoveryState = await store.load();
  const catalog = liveCatalog(loadCatalog(), state);
  const count = (b: CatalogRecord["badge"]) => catalog.filter((r) => r.badge === b).length;
  return {
    storage: { kind: store.kind, describe: store.describe },
    counts: { verified: count("verified"), listed: count("listed"), blocked: count("blocked"), watchList: loadList().length },
    candidates: [...state.candidates].sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
    records: state.records,
    runs: state.runs,
    /** Built-in tools still waiting for a person (sample data included). */
    builtInWaiting: catalog.filter((r) => r.badge === "listed" && !state.candidates.some((c) => c.id === r.id)),
  };
}
