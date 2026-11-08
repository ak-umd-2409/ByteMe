import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadCatalog } from "../catalog/index.ts";
import type { CatalogRecord } from "../catalog/types.ts";
import type { CheckFn } from "../discovery/index.ts";
import { memoryStore } from "../discovery/index.ts";
import { checkAccess, handleDecide, handleQueue, handleRun, handleSubmit } from "./discovery.ts";

const NOW = new Date("2026-11-08T14:00:00Z");
const h = (x: Record<string, string>) => new Headers(x);

describe("who may review", () => {
  it("needs the reviewer code when ADMIN_TOKEN is set", () => {
    const env = { NODE_ENV: "production", ADMIN_TOKEN: "s3cret" } as NodeJS.ProcessEnv;
    assert.equal(checkAccess(h({}), env).ok, false);
    assert.equal(checkAccess(h({ "x-admin-token": "nope" }), env).ok, false);
    assert.deepEqual(checkAccess(h({ "x-admin-token": "s3cret" }), env), { ok: true, who: "reviewer" });
  });

  it("lets Vercel's weekly schedule in with CRON_SECRET", () => {
    const env = { NODE_ENV: "production", CRON_SECRET: "cron-1", ADMIN_TOKEN: "s3cret" } as NodeJS.ProcessEnv;
    assert.deepEqual(checkAccess(h({ authorization: "Bearer cron-1" }), env), { ok: true, who: "schedule" });
    assert.equal(checkAccess(h({ authorization: "Bearer wrong" }), env).ok, false);
  });

  it("is locked in production until ADMIN_TOKEN is set, open in local development", () => {
    const prod = checkAccess(h({}), { NODE_ENV: "production" } as NodeJS.ProcessEnv);
    assert.equal(prod.ok, false);
    if (!prod.ok) assert.equal(prod.response.status, 403);
    assert.equal(checkAccess(h({}), { NODE_ENV: "development" } as NodeJS.ProcessEnv).ok, true);
  });
});

describe("discovery endpoints", () => {
  const ready: CheckFn = async (entry) => {
    const r: CatalogRecord = structuredClone(loadCatalog().find((x) => x.id === "quotequick")!);
    Object.assign(r, { id: entry.id, name: entry.name, badge: "listed", vendor: { company: entry.name, website: entry.url, domain: new URL(entry.url).hostname } });
    delete r.sample;
    delete r.reviewedAt;
    r.safetyCheck = { ...r.safetyCheck, verdict: "ready" };
    return r;
  };

  it("an owner's link goes into the queue; a bad link is a 400", async () => {
    const store = memoryStore();
    const ok = await handleSubmit({ url: "https://rosie.ai" }, store, NOW);
    assert.equal(ok.status, 200);
    assert.equal((ok.body as { kind: string }).kind, "queued");
    assert.equal((await handleSubmit({ url: "nope" }, store, NOW)).status, 400);
    assert.equal((await handleSubmit({}, store, NOW)).status, 400);
  });

  it("run → decide end to end", async () => {
    const store = memoryStore();
    await handleSubmit({ url: "https://rosie.ai", name: "Rosie", useCases: ["missed-calls"], source: "vendor_submission" }, store, NOW);
    const run = await handleRun({ limit: 1 }, "manual", ready, store, NOW);
    assert.equal(run.status, 200);
    assert.equal((run.body as { summary: { checked: number } }).summary.checked, 1);
    assert.equal((await handleDecide({ id: "rosie", action: "approve", reviewer: "" }, store, NOW)).status, 400);
    assert.equal((await handleDecide({ id: "rosie", action: "delete", reviewer: "R" }, store, NOW)).status, 400);
    const ok = await handleDecide({ id: "rosie", action: "approve", reviewer: "Rishabh" }, store, NOW);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const q = (await handleQueue(store)).body as { counts: { verified: number }; candidates: { status: string }[] };
    assert.equal(q.candidates[0].status, "approved");
    assert.equal(q.counts.verified, 4);
    assert.equal((await handleRun({ limit: 99 }, "manual", ready, store, NOW)).status, 400);
  });
});
