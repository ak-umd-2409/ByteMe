/**
 * Build real tool cards from data/catalog/list.json.
 *
 *   npm run catalog:build -- --batch 1
 *   npm run catalog:build -- --id rosie
 *
 * For each tool: Safety Check → card-filler → facts a person found → judge →
 * tool card. Writes data/safety/<id>.json, data/catalog/cards/<id>.json and
 * data/catalog/tools/<id>.json, and prints what is still missing.
 * One tool failing never stops the run. Reads .env.local if present.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { buildRecord } from "../lib/catalog/build.ts";
import { fillCard } from "../lib/catalog/fill/index.ts";
import type { CardFacts } from "../lib/catalog/fill/types.ts";
import { applyFound, forReuse, loadFound } from "../lib/catalog/found.ts";
import { gapsFor } from "../lib/catalog/gaps.ts";
import { loadList, validateList } from "../lib/catalog/list.ts";
import type { CatalogRecord } from "../lib/catalog/types.ts";
import { checkTool, judge } from "../lib/safety/index.ts";
import { factsPath, loadFacts } from "../lib/safety/saved.ts";
import { strongProvider } from "./strongProvider.ts";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: run without the AI (answers become "couldn't confirm").
}

const { values } = parseArgs({ options: { batch: { type: "string" }, id: { type: "string" } } });
const list = loadList();
const listErrors = validateList(list);
if (listErrors.length) {
  console.error(`The tool list has problems:\n${listErrors.map((e) => `  - ${e}`).join("\n")}`);
  process.exit(1);
}
const entries = values.id
  ? list.filter((e) => e.id === values.id)
  : values.batch
    ? list.filter((e) => String(e.batch) === values.batch)
    : [];
if (!entries.length) {
  console.error("Say which tools to build: --batch 1, --batch 2 or --id <toolId> (an id from data/catalog/list.json).");
  process.exit(1);
}

const CARDS = new URL("../data/catalog/cards/", import.meta.url);
const TOOLS = new URL("../data/catalog/tools/", import.meta.url);
mkdirSync(CARDS, { recursive: true });
mkdirSync(TOOLS, { recursive: true });
const readJson = <T>(url: URL): T | null => (existsSync(url) ? (JSON.parse(readFileSync(url, "utf8")) as T) : null);
const writeJson = (url: URL, value: unknown) => writeFileSync(url, `${JSON.stringify(value, null, 2)}\n`);

const ai = strongProvider();
console.log(`Building ${entries.length} tool(s) with AI model: ${ai.model}\n`);
const tally = { ready: 0, held: 0, blocked: 0, failed: 0 };

for (const entry of entries) {
  try {
    const cardUrl = new URL(`${entry.id}.json`, CARDS);
    const toolUrl = new URL(`${entry.id}.json`, TOOLS);
    const previousRecord = readJson<CatalogRecord>(toolUrl);

    const { facts } = await checkTool(
      { url: entry.url, name: entry.name, handlesSensitiveData: entry.sensitive },
      { llm: ai.provider, previous: forReuse(loadFacts(entry.id)) },
    );
    const card = await fillCard(entry, { llm: ai.provider, previous: readJson<CardFacts>(cardUrl), privacyPage: facts.pages.privacy });
    const found = await applyFound(loadFound(entry.id), card, facts);
    const report = judge(found.safety);
    const record = buildRecord(entry, found.card, found.safety, report, previousRecord);

    // The card is saved before person-found facts (so the AI answers can be reused);
    // the fact sheet after them (so its saved verdict matches the tool card).
    writeJson(cardUrl, card);
    writeJson(factsPath(entry.id)!, found.safety);
    writeJson(toolUrl, record);

    tally[report.verdict] += 1;
    const badge = record.badge === "verified" ? " (approved)" : "";
    console.log(`${entry.name} (${entry.id}): ${report.verdict.toUpperCase()}${badge}`);
    for (const field of found.accepted) console.log(`  ✓ accepted the fact you found for ${field}`);
    for (const r of found.rejected) console.log(`  ✗ didn't accept the fact for ${r.field}: ${r.why}`);
    for (const gap of gapsFor(record, report, previousRecord)) console.log(`  - ${gap}`);
    console.log("");
  } catch (error) {
    tally.failed += 1;
    console.log(`${entry.name} (${entry.id}): FAILED, skipped (${error instanceof Error ? error.message : String(error)})\n`);
  }
}

console.log(`Done. Ready: ${tally.ready}, held: ${tally.held}, blocked: ${tally.blocked}, failed: ${tally.failed}.`);
console.log(`AI calls used: ${ai.calls()}.`);
