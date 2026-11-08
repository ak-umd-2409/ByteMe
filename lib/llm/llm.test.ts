import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryCache } from "../shared/cache.ts";
import type { Kv } from "../shared/kv.ts";
import { v } from "../shared/validate.ts";
import { createOpenRouterProvider, llmJson } from "./client.ts";
import { memoryLedger } from "./ledger.ts";

const config = { openRouterApiKey: "test-key", openRouterModel: "openai/gpt-4o-mini", llmMaxCallsPerHour: 100, llmBudgetUsd: 1 };
const reply = (content: string, cost = 0.002) =>
  (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { cost, prompt_tokens: 1000, completion_tokens: 100 } }), { status: 200 })) as unknown as typeof fetch;
const schema = v.object({ answer: v.string({ max: 50 }) });
const req = { task: "test", system: "s", user: "u" };

function fakeKv(): Kv & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, val) => void data.set(k, val),
    incrByFloat: async (k, by) => {
      const n = Number(data.get(k) ?? 0) + by;
      data.set(k, String(n));
      return n;
    },
  };
}

describe("AI spend and caching", () => {
  it("records what OpenRouter says each call cost", async () => {
    const ledger = memoryLedger();
    const p = createOpenRouterProvider(config, reply('{"answer":"yes"}', 0.0031), ledger);
    assert.equal(await p.complete(req), '{"answer":"yes"}');
    assert.equal(await ledger.spent(), 0.0031);
  });

  it("stops calling once the dollar cap is reached", async () => {
    let calls = 0;
    const counting = (async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const p = createOpenRouterProvider(config, counting, memoryLedger(1.0));
    assert.equal(await p.complete(req), null);
    assert.equal(calls, 0);
  });

  it("a saved answer is reused without calling the AI, and checked against the schema first", async () => {
    let calls = 0;
    const counting = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"answer":"fresh"}' } }], usage: { cost: 0.001 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const p = createOpenRouterProvider(config, counting, memoryLedger());
    const kv = fakeKv();
    const first = await llmJson(p, schema, req, { cache: createMemoryCache(), kv });
    assert.deepEqual(first, { ok: true, value: { answer: "fresh" }, provider: p.name });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(kv.data.size, 1, "saved for next time");
    // A new server instance (empty memory cache) reuses the saved answer.
    const again = await llmJson(p, schema, req, { cache: createMemoryCache(), kv });
    assert.equal(again.ok, true);
    assert.equal(calls, 1);
    // A saved answer that no longer fits the schema is ignored, not trusted.
    for (const k of kv.data.keys()) kv.data.set(k, JSON.stringify({ answer: 42 }));
    await llmJson(p, schema, req, { cache: createMemoryCache(), kv });
    assert.equal(calls, 2);
  });

  it("bad JSON from the model is dropped, never repaired, and nothing is cached", async () => {
    const p = createOpenRouterProvider(config, reply("not json"), memoryLedger());
    const kv = fakeKv();
    const res = await llmJson(p, schema, req, { cache: createMemoryCache(), kv });
    assert.deepEqual(res, { ok: false, reason: "malformed" });
    assert.equal(kv.data.size, 0);
  });
});
