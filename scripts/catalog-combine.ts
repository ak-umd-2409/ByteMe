/**
 * Combine every tool card in data/catalog/tools/ into data/catalog/real.json,
 * the file the app reads. Writes nothing if any card fails the data checker.
 *
 *   npm run catalog:combine
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { combine } from "../lib/catalog/combine.ts";

const DIR = new URL("../data/catalog/tools/", import.meta.url);
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith(".json")) : [];
const records = files.map((f) => JSON.parse(readFileSync(new URL(f, DIR), "utf8")));
const result = combine(records);
if (!result.ok) {
  console.error(`Didn't write real.json. Fix these first:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`);
  process.exit(1);
}
writeFileSync(new URL("../data/catalog/real.json", import.meta.url), result.json);
const count = records.length - result.skipped.length;
console.log(`Wrote data/catalog/real.json with ${count} tool(s).`);
if (result.skipped.length) console.log(`Left out (held, can't be shown yet): ${result.skipped.join(", ")}`);
