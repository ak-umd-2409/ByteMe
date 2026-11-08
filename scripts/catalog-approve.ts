/**
 * Approve one tool after a person has reviewed its card:
 *
 *   npm run catalog:approve -- <toolId> --by "Rishabh"
 *
 * Only tools whose Safety Check says "ready" can be approved. Approved tools
 * get badge "verified", reviewedAt and reviewedBy.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { CatalogRecord } from "../lib/catalog/types.ts";
import { approveTool } from "../lib/safety/index.ts";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { by: { type: "string" } } });
const id = positionals[0] ?? "";
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) || !values.by?.trim()) {
  console.error('Use: npm run catalog:approve -- <toolId> --by "Your name"');
  process.exit(1);
}
const path = new URL(`../data/catalog/tools/${id}.json`, import.meta.url);
if (!existsSync(path)) {
  console.error(`No tool card for "${id}" yet. Build it first: npm run catalog:build -- --id ${id}`);
  process.exit(1);
}
const record = JSON.parse(readFileSync(path, "utf8")) as CatalogRecord;
const today = new Date().toISOString().slice(0, 10);
const result = approveTool(record, values.by, today);
if (!result.ok) {
  console.error(`Not approved: ${result.reason}`);
  process.exit(1);
}
writeFileSync(path, `${JSON.stringify(result.record, null, 2)}\n`);
console.log(`Approved ${record.name} (${id}) by ${values.by.trim()} on ${today}. Run npm run catalog:combine to update the app.`);
