/**
 * Discovery API (docs/DISCOVERY.md):
 *   POST /api/discovery/submit   public: an owner's link check or a vendor application
 *   GET  /api/discovery/queue    reviewers: the queue, counts and recent runs
 *   POST /api/discovery/run      reviewers: run discovery now (GET = the weekly schedule)
 *   POST /api/discovery/decide   reviewers: approve or block a tool
 */
import { timingSafeEqual } from "node:crypto";
import type { CheckFn, DiscoveryStore } from "../discovery/index.ts";
import { decideTool, getStore, queueView, runNow, submitTool } from "../discovery/index.ts";
import { USE_CASES } from "../recommend/types.ts";
import { v } from "../shared/validate.ts";
import { errorResponse, type ApiResponse } from "./handlers.ts";

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export type Access = { ok: true; who: "reviewer" | "schedule" } | { ok: false; response: ApiResponse };

/**
 * Reviewers send `x-admin-token: <ADMIN_TOKEN>`. Vercel's scheduler sends
 * `Authorization: Bearer <CRON_SECRET>`. Without ADMIN_TOKEN, review actions
 * work only outside production (local development).
 */
export function checkAccess(headers: Headers, env: NodeJS.ProcessEnv = process.env): Access {
  const admin = env.ADMIN_TOKEN?.trim();
  const cron = env.CRON_SECRET?.trim();
  const given = headers.get("x-admin-token")?.trim() ?? "";
  const bearer = headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (cron && bearer && same(bearer, cron)) return { ok: true, who: "schedule" };
  if (admin) {
    if (given && same(given, admin)) return { ok: true, who: "reviewer" };
    return { ok: false, response: errorResponse(401, "unauthorized", "Enter the reviewer code to use the review queue.") };
  }
  if (env.NODE_ENV !== "production") return { ok: true, who: "reviewer" };
  return { ok: false, response: errorResponse(403, "not_configured", "The review queue is locked until ADMIN_TOKEN is set for this site.") };
}

const invalid = (errors: string[]) => errorResponse(400, "invalid_request", "Some fields are missing or invalid.", errors);

const submitBody = v.object({
  url: v.string({ min: 3, max: 500 }),
  name: v.optional(v.string({ max: 80 })),
  useCases: v.optional(v.array(v.string({ max: 40 }), { max: 12 })),
  category: v.optional(v.string({ max: 60 })),
  sensitive: v.optional(v.boolean()),
  source: v.optional(v.string({ max: 30 })),
});

export async function handleSubmit(body: unknown, store: DiscoveryStore = getStore(), now = new Date()): Promise<ApiResponse> {
  const parsed = submitBody.parse(body);
  if (!parsed.ok) return invalid(parsed.errors);
  const source = parsed.value.source === "vendor_submission" ? "vendor_submission" : "owner_check";
  const outcome = await submitTool({ ...parsed.value, source }, store, now);
  if (outcome.kind === "invalid") return errorResponse(400, "invalid_url", outcome.message);
  return { status: 200, body: outcome };
}

export async function handleQueue(store: DiscoveryStore = getStore()): Promise<ApiResponse> {
  return { status: 200, body: await queueView(store) };
}

const runBody = v.object({ limit: v.optional(v.number({ min: 1, max: 10, integer: true })) });

export async function handleRun(body: unknown, trigger: "manual" | "schedule", check: CheckFn, store: DiscoveryStore = getStore(), now = new Date()): Promise<ApiResponse> {
  const parsed = runBody.parse(body ?? {});
  if (!parsed.ok) return invalid(parsed.errors);
  const summary = await runNow({ check, trigger, limit: parsed.value.limit ?? (trigger === "schedule" ? 5 : 3) }, store, now);
  return { status: 200, body: { summary, queue: await queueView(store) } };
}

const decideBody = v.object({
  id: v.string({ min: 1, max: 60, pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/ }),
  action: v.string({ max: 10 }),
  reviewer: v.string({ min: 1, max: 60 }),
  reason: v.optional(v.string({ max: 200 })),
  useCases: v.optional(v.array(v.string({ max: 40 }), { max: 12 })),
});

export async function handleDecide(body: unknown, store: DiscoveryStore = getStore(), now = new Date()): Promise<ApiResponse> {
  const parsed = decideBody.parse(body);
  if (!parsed.ok) return invalid(parsed.errors);
  const { id, action, ...rest } = parsed.value;
  if (action !== "approve" && action !== "block") return invalid(["action: approve or block"]);
  if (rest.useCases?.some((u) => !(USE_CASES as readonly string[]).includes(u))) return invalid(["useCases: one of the 12 problem types"]);
  const result = await decideTool(id, { action, ...rest }, store, now);
  if (!result.ok) return errorResponse(409, "not_allowed", result.message);
  return { status: 200, body: { message: result.message, queue: await queueView(store) } };
}
