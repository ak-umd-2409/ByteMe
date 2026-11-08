/**
 * The real check for one discovered tool: the same steps as `npm run catalog:build`
 * (Safety Check → card-filler → judge → tool card). Facts a person found
 * (data/catalog/found) are added offline by `npm run catalog:build`; a newly
 * discovered tool starts without any.
 * Reads public pages (robots.txt respected) and asks the AI fixed questions;
 * every kept answer has a word-for-word quote. Never invents a fact.
 */
import { buildRecord } from "../catalog/build.ts";
import { fillCard } from "../catalog/fill/index.ts";
import type { ListEntry } from "../catalog/list.ts";
import type { CatalogRecord } from "../catalog/types.ts";
import { getLlmProvider } from "../llm/client.ts";
import { checkTool, judge } from "../safety/index.ts";
import { loadConfig } from "../shared/config.ts";
import type { CheckFn } from "./discovery.ts";

export const realCheck: CheckFn = async (entry: ListEntry, previous: CatalogRecord | null) => {
  const llm = getLlmProvider(loadConfig());
  const { facts } = await checkTool({ url: entry.url, name: entry.name, handlesSensitiveData: entry.sensitive }, { llm });
  // Couldn't even read the home page: don't judge the tool on nothing. The run marks it
  // "failed" and tries again next time.
  const home = facts.pages.home;
  if (!home || "error" in home) throw new Error(`couldn't reach ${new URL(entry.url).hostname} (${home && "error" in home ? home.error : "no home page"})`);
  const card = await fillCard(entry, { llm, privacyPage: facts.pages.privacy });
  return buildRecord(entry, card, facts, judge(facts), previous);
};
