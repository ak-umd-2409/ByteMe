/**
 * Run the Safety Check on one tool's website and print the result in plain English.
 *
 *   npm run safety:check -- <url> [--id <toolId>] [--name "<name>"] [--sensitive]
 *
 * --id        reuse the saved fact sheet's AI answers for unchanged pages, and
 *             save the new fact sheet to data/safety/<toolId>.json
 * --sensitive the tool takes payments or health info
 *
 * Reads .env.local if present (OPENROUTER_API_KEY, GOOGLE_SAFE_BROWSING_API_KEY).
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { SAFETY_CHECK_NAMES } from "../lib/catalog/types.ts";
import { normalizeWebsiteUrl } from "../lib/shared/safeFetch.ts";
import { checkTool } from "../lib/safety/index.ts";
import { factsPath, loadFacts } from "../lib/safety/saved.ts";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: run without keys (AI questions become "couldn't tell").
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { id: { type: "string" }, name: { type: "string" }, sensitive: { type: "boolean", default: false } },
});

const url = normalizeWebsiteUrl(positionals[0] ?? "");
if (!url || !url.hostname.includes(".")) {
  console.error('Please give a website address, for example: npm run safety:check -- https://squareup.com');
  process.exit(1);
}
const id = values.id;
if (id !== undefined && !factsPath(id)) {
  console.error("--id must be a lowercase slug like my-tool-name.");
  process.exit(1);
}

const { facts, report } = await checkTool(
  { url: url.toString(), name: values.name ?? url.hostname.replace(/^www\./, ""), handlesSensitiveData: values.sensitive },
  { previous: id ? loadFacts(id) : null },
);

const VERDICT_TEXT = {
  ready: "READY: passed every must-pass check. A person can now approve it.",
  held: "HELD: a must-pass check failed or couldn't be confirmed. It can't be approved yet.",
  blocked: "BLOCKED: it has a red flag. It will never be shown to owners.",
};
const MARK = { pass: "✓", fail: "✗", unknown: "?" };

console.log(`\nSafety Check: ${facts.input.name} (${facts.input.url}) on ${facts.collectedAt}`);
console.log(`\n${VERDICT_TEXT[report.verdict]}`);
if (report.redFlags.length) console.log(`\nRed flags:\n${report.redFlags.map((f) => `  - ${f}`).join("\n")}`);
if (report.warnings.length) console.log(`\nWarnings:\n${report.warnings.map((w) => `  - ${w}`).join("\n")}`);
console.log("\nChecks:");
for (const name of SAFETY_CHECK_NAMES) {
  const check = report.checks[name];
  console.log(`  ${MARK[check.result]} ${name}: ${check.reason}`);
}
const pages = Object.entries(facts.pages)
  .map(([kind, page]) => `${kind}=${page === null ? "not found" : "error" in page ? `error (${page.error})` : "read"}`)
  .join(", ");
console.log(`\nPages: ${pages}`);
console.log(`AI read About/Contact: ${facts.ai.ran.about ? "yes" : "no"}, Privacy: ${facts.ai.ran.privacy ? "yes" : "no"}`);

if (id) {
  const path = factsPath(id)!;
  writeFileSync(path, `${JSON.stringify(facts, null, 2)}\n`);
  console.log(`\nSaved the fact sheet to data/safety/${id}.json`);
}
