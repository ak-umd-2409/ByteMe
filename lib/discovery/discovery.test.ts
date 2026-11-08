import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadCatalog } from "../catalog/index.ts";
import type { ListEntry } from "../catalog/list.ts";
import type { CatalogRecord, Verdict } from "../catalog/types.ts";
import { decide, liveCatalog, runDiscovery, submit, type CheckFn } from "./discovery.ts";
import { decideTool, loadLiveCatalog, memoryStore, queueView, redisStore, fileStore, submitTool } from "./index.ts";
import { emptyState } from "./types.ts";

const NOW = new Date("2026-11-08T14:00:00Z");
const catalog = loadCatalog();
const template = catalog.find((r) => r.id === "ringwise-receptionist")!;

/** A fake Safety Check: returns a card with the verdict the test asks for. */
const fakeCheck =
  (verdicts: Record<string, Verdict | "throw"> = {}): CheckFn =>
  async (entry, previous) => {
    const v = verdicts[entry.id] ?? "held";
    if (v === "throw") throw new Error("site timed out");
    const r: CatalogRecord = structuredClone(template);
    r.id = entry.id;
    r.name = entry.name;
    r.vendor = { company: entry.name, website: entry.url, domain: new URL(entry.url).hostname };
    r.useCases = entry.useCases;
    delete r.sample;
    delete r.reviewedAt;
    delete r.reviewedBy;
    r.lastChecked = "2026-11-08";
    r.badge = v === "blocked" ? "blocked" : previous?.badge === "verified" && v === "ready" ? "verified" : "listed";
    r.safetyCheck = { ...r.safetyCheck, verdict: v, redFlags: v === "blocked" ? ["No privacy policy."] : [] };
    return r;
  };

const entry = (id: string, url: string, batch: 1 | 2 = 1): ListEntry => ({ id, name: id, url, category: "AI tool", useCases: ["missed-calls"], industries: ["any"], sensitive: false, batch });

describe("intake: owner link checks and vendor submissions", () => {
  it("rejects things that aren't website addresses", () => {
    const { outcome } = submit(emptyState(), catalog, { url: "not a link", source: "owner_check" }, NOW);
    assert.equal(outcome.kind, "invalid");
  });

  it("recognises a tool already in the catalog, by its website", () => {
    const { state, outcome } = submit(emptyState(), catalog, { url: "https://www.ringwise.example/pricing", source: "owner_check" }, NOW);
    assert.equal(outcome.kind, "in_catalog");
    assert.equal(state.candidates.length, 0);
  });

  it("blocks a brand lookalike on the spot, without the internet", () => {
    const { state, outcome } = submit(emptyState(), catalog, { url: "https://squaree-ai.com", source: "owner_check" }, NOW);
    assert.equal(outcome.kind, "blocked");
    assert.match(outcome.message, /Square/);
    assert.equal(state.candidates[0].status, "blocked");
    assert.equal(state.candidates[0].decidedBy, "Automatic check");
  });

  it("queues a new tool once, with a unique id", () => {
    const a = submit(emptyState(), catalog, { url: "rosie.ai", name: "Rosie", useCases: ["missed-calls", "nonsense"], source: "vendor_submission" }, NOW);
    assert.equal(a.outcome.kind, "queued");
    const c = a.state.candidates[0];
    assert.deepEqual([c.id, c.domain, c.url, c.useCases], ["rosie", "rosie.ai", "https://rosie.ai", ["missed-calls"]]);
    const again = submit(a.state, catalog, { url: "https://www.rosie.ai/", source: "owner_check" }, NOW);
    assert.equal(again.outcome.kind, "already_queued");
    const other = submit(a.state, catalog, { url: "https://rosie-answering.com", name: "Rosie", source: "owner_check" }, NOW);
    assert.equal(other.state.candidates[1].id, "rosie-2");
  });
});

describe("run: find → check → queue", () => {
  it("adds watch-list tools a few at a time, checks the most urgent first, and records the run", async () => {
    let state = submit(emptyState(), catalog, { url: "https://owner-pick.ai", source: "owner_check" }, NOW).state;
    const watchList = [entry("w1", "https://w1.ai"), entry("w2", "https://w2.ai"), entry("w3", "https://w3.ai", 2), entry("ringwise-receptionist", "https://ringwise.example")];
    const out = await runDiscovery(state, { catalog, watchList, check: fakeCheck({ w1: "ready", w2: "blocked" }), now: NOW, trigger: "manual", limit: 3, watchListIntake: 2 });
    state = out.state;
    assert.deepEqual(out.summary.added, { watchList: 2, recheck: 0 }, "batch 1 first, catalog tools skipped, intake capped");
    assert.equal(out.summary.checked, 3);
    // The owner's link is checked first.
    assert.equal(state.candidates.find((c) => c.domain === "owner-pick.ai")!.status, "checked");
    assert.equal(state.candidates.find((c) => c.id === "w1")!.status, "checked");
    assert.match(state.candidates.find((c) => c.id === "w1")!.note!, /Ready for a person/);
    assert.equal(state.candidates.find((c) => c.id === "w2")!.status, "blocked");
    assert.equal(state.records.w1.badge, "listed", "a check never makes a tool Verified");
    assert.equal(out.summary.waiting, 0);
    assert.equal(state.runs.length, 1);
  });

  it("one failing site doesn't stop the run, and it's retried later", async () => {
    const out = await runDiscovery(emptyState(), { catalog, watchList: [entry("a", "https://a.ai"), entry("b", "https://b.ai")], check: fakeCheck({ a: "throw" }), now: NOW, trigger: "schedule" });
    const a = out.state.candidates.find((c) => c.id === "a")!;
    assert.equal(a.status, "failed");
    assert.match(a.note!, /timed out/);
    assert.equal(out.state.candidates.find((c) => c.id === "b")!.status, "checked");
    assert.equal(out.summary.waiting, 1);
  });

  it("re-checks real tools after 90 days, and skips sample tools", async () => {
    const old: CatalogRecord = { ...structuredClone(template), id: "old-tool", lastChecked: "2026-07-01", vendor: { company: "Old", website: "https://old.ai", domain: "old.ai" } };
    delete old.sample;
    const state = { ...emptyState(), records: { "old-tool": old } };
    const out = await runDiscovery(state, { catalog, watchList: [], check: fakeCheck({ "old-tool": "ready" }), now: NOW, trigger: "schedule" });
    assert.equal(out.summary.added.recheck, 1);
    assert.equal(out.state.records["old-tool"].lastChecked, "2026-11-08");
    // Re-checked and still ready: a previously Verified tool stays Verified.
    assert.equal(out.state.records["old-tool"].badge, "verified");
  });
});

describe("decide: a person approves or blocks", () => {
  const checked = async (verdict: Verdict) => {
    const s = submit(emptyState(), catalog, { url: "https://rosie.ai", name: "Rosie", source: "owner_check" }, NOW).state;
    return (await runDiscovery(s, { catalog, watchList: [], check: fakeCheck({ rosie: verdict }), now: NOW, trigger: "manual" })).state;
  };

  it("approves only ready tools, needs a name and a problem type, and publishes them", async () => {
    const state = await checked("ready");
    assert.equal(decide(state, catalog, "rosie", { action: "approve", reviewer: " " }, NOW).ok, false);
    const noUse = decide(state, catalog, "rosie", { action: "approve", reviewer: "Rishabh" }, NOW);
    assert.equal(noUse.ok, false);
    assert.match(noUse.ok ? "" : noUse.message, /problem/);
    const ok = decide(state, catalog, "rosie", { action: "approve", reviewer: "Rishabh", useCases: ["missed-calls"] }, NOW);
    assert.ok(ok.ok);
    if (!ok.ok) return;
    const r = liveCatalog(catalog, ok.state).find((x) => x.id === "rosie")!;
    assert.deepEqual([r.badge, r.reviewedBy, r.reviewedAt], ["verified", "Rishabh", "2026-11-08"]);
    assert.equal(ok.state.candidates[0].status, "approved");
  });

  it("refuses to approve a held tool", async () => {
    const res = decide(await checked("held"), catalog, "rosie", { action: "approve", reviewer: "Rishabh", useCases: ["missed-calls"] }, NOW);
    assert.equal(res.ok, false);
  });

  it("blocking hides the tool and keeps the reason owners will see", async () => {
    const res = decide(await checked("ready"), catalog, "rosie", { action: "block", reviewer: "Rishabh", reason: "Asks for card details up front" }, NOW);
    assert.ok(res.ok);
    if (!res.ok) return;
    const r = res.state.records.rosie;
    assert.equal(r.badge, "blocked");
    assert.ok(r.safetyCheck.redFlags.some((f) => f.includes("Asks for card details")));
  });

  it("a reviewer can block a built-in catalog tool", () => {
    const res = decide(emptyState(), catalog, "booknest", { action: "block", reviewer: "Rishabh", reason: "Changed its privacy policy" }, NOW);
    assert.ok(res.ok);
    if (res.ok) assert.equal(liveCatalog(catalog, res.state).find((r) => r.id === "booknest")!.badge, "blocked");
  });
});

describe("storage and the service layer", () => {
  it("submit → queue → decide through a store, and the live catalog reflects it", async () => {
    const store = memoryStore();
    const outcome = await submitTool({ url: "https://rosie.ai", name: "Rosie", source: "vendor_submission" }, store, NOW);
    assert.equal(outcome.kind, "queued");
    const view = await queueView(store);
    assert.equal(view.candidates.length, 1);
    assert.equal(view.storage.kind, "memory");
    assert.ok(view.counts.watchList > 50);
    const blocked = await decideTool("booknest", { action: "block", reviewer: "R", reason: "test" }, store, NOW);
    assert.ok(blocked.ok);
    assert.equal((await loadLiveCatalog(store)).find((r) => r.id === "booknest")!.badge, "blocked");
  });

  it("file store round-trips", async () => {
    const dir = mkdtempSync(join(tmpdir(), "disc-"));
    try {
      const store = fileStore(join(dir, "d.json"));
      assert.deepEqual(await store.load(), emptyState());
      await store.save({ ...emptyState(), runs: [] });
      assert.equal((await store.load()).version, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("redis store speaks the Upstash REST format", async () => {
    const kv = new Map<string, string>();
    const calls: unknown[] = [];
    const fake = (async (_url: string, init: RequestInit) => {
      const cmd = JSON.parse(String(init.body)) as string[];
      calls.push(cmd[0]);
      assert.equal((init.headers as Record<string, string>).authorization, "Bearer tok");
      const result = cmd[0] === "GET" ? (kv.get(cmd[1]) ?? null) : (kv.set(cmd[1], cmd[2]), "OK");
      return new Response(JSON.stringify({ result }), { status: 200 });
    }) as typeof fetch;
    const store = redisStore("https://x.upstash.io", "tok", fake);
    assert.deepEqual(await store.load(), emptyState());
    await store.save({ ...emptyState(), runs: [] });
    assert.equal((await store.load()).version, 1);
    assert.deepEqual(calls, ["GET", "SET", "GET"]);
  });

  it("CATALOG_SAMPLES=hide removes the made-up demo tools everywhere", async () => {
    const all = await loadLiveCatalog(memoryStore(), {} as unknown as NodeJS.ProcessEnv);
    const real = await loadLiveCatalog(memoryStore(), { CATALOG_SAMPLES: "hide" } as unknown as NodeJS.ProcessEnv);
    assert.ok(all.some((r) => r.sample));
    assert.ok(!real.some((r) => r.sample));
  });

  it("owners still get the built-in catalog if storage is down", async () => {
    const broken = { ...memoryStore(), load: async () => Promise.reject(new Error("down")) };
    assert.equal((await loadLiveCatalog(broken)).length, catalog.length);
  });
});
