/**
 * Safety Check: decides whether an AI tool may ever be shown to an owner.
 * checkTool = judge(await collectFacts(input)). See docs/CONTRACTS.md.
 */
import type { SafetyReport } from "../catalog/types.ts";
import { collectFacts } from "./collect/index.ts";
import { judge } from "./judge.ts";
import type { CollectDeps, SafetyFacts, SafetyInput } from "./types.ts";

export { approveTool } from "./approve.ts";
export { collectFacts } from "./collect/index.ts";
export { judge } from "./judge.ts";
export type * from "./types.ts";

export async function checkTool(input: SafetyInput, deps: CollectDeps = {}): Promise<{ facts: SafetyFacts; report: SafetyReport }> {
  const facts = await collectFacts(input, deps);
  return { facts, report: judge(facts) };
}
