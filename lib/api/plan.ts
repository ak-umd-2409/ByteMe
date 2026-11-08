/**
 * Plan sharing (spec §5.4):
 *   POST /api/plan/share  { context, choices, currentTools } → { path, stored, expiresAt }
 *   POST /api/plan/open   { link }                            → AdvisorView (for links that carry the plan)
 *   /plan/<id> reads a saved share with openSavedShare().
 *
 * With storage configured (Upstash Redis, same as the review queue) a share is saved for
 * 30 days under a random id. Without it, the link itself carries the share in the part
 * after "#", which browsers never send to a server. Either way the plan is rebuilt here
 * from the signed journey context, never taken from the browser as-is.
 */
import { randomBytes } from "node:crypto";
import type { CatalogRecord } from "../catalog/types.ts";
import type { JourneyAnswerResponse } from "../journey/types.ts";
import { MAX_CONTEXT_CHARS } from "../journey/context.ts";
import { advisorView, decodeShareLink, encodeShareLink, parseSaved, SHARE_DAYS, type AdvisorView, type SavedShare } from "../plan/share.ts";
import type { Kv } from "../shared/kv.ts";
import { log } from "../shared/logger.ts";
import { v } from "../shared/validate.ts";
import { errorResponse, type ApiDeps, type ApiResponse } from "./handlers.ts";
import { handleJourneyAnswer } from "./journey.ts";

export interface PlanDeps {
  api: ApiDeps;
  kv: Kv | null;
  catalog: CatalogRecord[];
  now?: () => Date;
  newId?: () => string;
}

const ID = /^[A-Za-z0-9_-]{16,40}$/;
const keyFor = (id: string) => `mainstreet:plan:${id}`;

const shareBody = v.object({
  context: v.string({ min: 4, max: MAX_CONTEXT_CHARS, trim: false }),
  choices: v.optional(v.record(v.string({ max: 80 }), { maxKeys: 20 })),
  currentTools: v.optional(v.array(v.string({ max: 80 }), { max: 30 })),
});
const openBody = v.object({ link: v.string({ min: 4, max: MAX_CONTEXT_CHARS + 2_000, trim: false }) });

async function rebuild(saved: SavedShare, deps: PlanDeps, stored: boolean): Promise<{ ok: true; view: AdvisorView } | { ok: false; response: ApiResponse }> {
  const res = await handleJourneyAnswer({ context: saved.context, answers: {} }, deps.api);
  if (res.status !== 200) return { ok: false, response: res };
  // Only tools that exist in the catalog; buildPlan drops any that aren't Verified.
  const known = new Set(deps.catalog.map((r) => r.id));
  const choices = Object.fromEntries(Object.entries(saved.choices).filter(([, id]) => id && known.has(id))) as SavedShare["choices"];
  return { ok: true, view: advisorView(res.body as JourneyAnswerResponse, { ...saved, choices }, deps.catalog, stored) };
}

export async function handlePlanShare(body: unknown, deps: PlanDeps): Promise<ApiResponse> {
  const parsed = shareBody.parse(body);
  if (!parsed.ok) return errorResponse(400, "invalid_request", "Some fields are missing or invalid.", parsed.errors);
  const saved = parseSaved({ v: 1, ...parsed.value, createdAt: (deps.now?.() ?? new Date()).toISOString() });
  if (!saved) return errorResponse(400, "invalid_request", "Some fields are missing or invalid.");
  const check = await rebuild(saved, deps, Boolean(deps.kv));
  if (!check.ok) return check.response;

  if (deps.kv) {
    const id = deps.newId?.() ?? randomBytes(16).toString("base64url");
    try {
      await deps.kv.set(keyFor(id), JSON.stringify(saved), SHARE_DAYS * 86_400);
      log.info("plan.share", { stored: true });
      return { status: 200, body: { path: `/plan/${id}`, stored: true, expiresAt: check.view.expiresAt } };
    } catch (error) {
      // Storage is down: still give the owner a working link rather than an error.
      log.warn("plan.share.store_failed", { error });
    }
  }
  log.info("plan.share", { stored: false });
  return { status: 200, body: { path: `/plan/view#${encodeShareLink(saved)}`, stored: false, expiresAt: null } };
}

export async function handlePlanOpen(body: unknown, deps: PlanDeps): Promise<ApiResponse> {
  const parsed = openBody.parse(body);
  if (!parsed.ok) return errorResponse(400, "invalid_request", "Some fields are missing or invalid.", parsed.errors);
  const saved = decodeShareLink(parsed.value.link);
  if (!saved) return errorResponse(400, "invalid_link", "This link is broken. Ask the owner to send it again.");
  const out = await rebuild(saved, deps, false);
  return out.ok ? { status: 200, body: out.view } : out.response;
}

/** For /plan/<id>. "missing" covers both never-existed and expired (storage drops it after 30 days). */
export async function openSavedShare(id: string, deps: PlanDeps): Promise<{ ok: true; view: AdvisorView } | { ok: false; reason: "missing" | "unavailable" | "broken" }> {
  if (!ID.test(id)) return { ok: false, reason: "missing" };
  if (!deps.kv) return { ok: false, reason: "unavailable" };
  let raw: string | null;
  try {
    raw = await deps.kv.get(keyFor(id));
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (!raw) return { ok: false, reason: "missing" };
  let saved: SavedShare | null = null;
  try {
    saved = parseSaved(JSON.parse(raw));
  } catch {
    saved = null;
  }
  if (!saved) return { ok: false, reason: "broken" };
  const out = await rebuild(saved, deps, true);
  return out.ok ? { ok: true, view: out.view } : { ok: false, reason: "broken" };
}
