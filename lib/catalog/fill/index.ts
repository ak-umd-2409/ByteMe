/**
 * The card-filler: reads a tool's own pages and fills its tool card with
 * quoted facts only. Uses the internet and the AI; never throws.
 * See docs/specs/b-real-catalog.md §3.
 */
import { getLlmProvider } from "../../llm/client.ts";
import { loadConfig } from "../../shared/config.ts";
import { isFetched, type CollectDeps, type PageFact } from "../../safety/types.ts";
import type { ListEntry } from "../list.ts";
import { askCardAi, emptyCardAi } from "./ai.ts";
import { emptyCardPages, findCardPages } from "./pages.ts";
import { CARD_PAGE_KINDS, type CardFacts } from "./types.ts";

export { emptyCardAi } from "./ai.ts";
export type * from "./types.ts";

export type FillDeps = Omit<CollectDeps, "previous"> & {
  /** The last saved card, so unchanged pages reuse their AI answers. */
  previous?: CardFacts | null;
  /** The Safety Check's privacy page, for the sharesOrSells question. Not fetched again. */
  privacyPage?: PageFact;
};

const sameText = (a: PageFact, b: PageFact | undefined) =>
  isFetched(a) ? isFetched(b ?? null) && (b as { contentHash: string }).contentHash === a.contentHash : !isFetched(b ?? null);

export async function fillCard(entry: ListEntry, deps: FillDeps = {}): Promise<CardFacts> {
  const now = (deps.now ?? (() => new Date()))();
  const collectedAt = now.toISOString().slice(0, 10);
  try {
    const config = loadConfig();
    const d: CollectDeps = { timeoutMs: config.httpTimeoutMs, userAgent: config.userAgent, ...deps, previous: null, now: () => now };
    d.llm ??= getLlmProvider(config);
    const pages = await findCardPages(entry.url, d);
    pages.privacy = deps.privacyPage ?? null;
    const prev = deps.previous ?? null;
    const unchanged = prev?.ai.ran && CARD_PAGE_KINDS.every((kind) => sameText(pages[kind], prev.pages[kind]));
    const ai = unchanged ? structuredClone(prev.ai) : await askCardAi(pages, d);
    return { input: entry, collectedAt, pages, ai };
  } catch {
    return { input: entry, collectedAt, pages: emptyCardPages({ error: "unexpected" }), ai: emptyCardAi() };
  }
}
