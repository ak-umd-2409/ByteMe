/**
 * The judge: turns a fact sheet into a SafetyReport with a verdict.
 * Pure: no network, no clock, no AI. See docs/specs/b-safety-check.md §4.
 *
 * Verdict: any red flag → blocked; else any core check not pass → held; else ready.
 */
import type { SafetyCheckItem, SafetyCheckName, SafetyReport, Verdict } from "../catalog/types.ts";
import {
  certificationWarning,
  checkDataLocation,
  checkDataUse,
  checkDomainAge,
  checkPricingClarity,
  checkPrivacyPolicy,
  checkSecurityBasics,
  checkWhoIsBehind,
} from "./checks.ts";
import { SAFETY_CONFIG } from "./config.ts";
import { findRedFlags } from "./redFlags.ts";
import type { SafetyFacts } from "./types.ts";

function redFlagsItem(flags: string[], facts: SafetyFacts): SafetyCheckItem {
  if (flags.length) return { result: "fail", reason: flags.join(" "), evidence: [{ url: facts.input.url, checkedAt: facts.collectedAt }] };
  const note = facts.safeBrowsing === "not_run" ? " Google unsafe-site check was not run." : "";
  return { result: "pass", reason: `No red flags found.${note}`, evidence: [{ url: facts.input.url, checkedAt: facts.collectedAt }] };
}

export function judge(facts: SafetyFacts): SafetyReport {
  const redFlags = findRedFlags(facts);
  const checks: Record<SafetyCheckName, SafetyCheckItem> = {
    whoIsBehind: checkWhoIsBehind(facts),
    domainAge: checkDomainAge(facts),
    privacyPolicy: checkPrivacyPolicy(facts),
    dataUse: checkDataUse(facts),
    dataLocation: checkDataLocation(facts),
    pricingClarity: checkPricingClarity(facts),
    securityBasics: checkSecurityBasics(facts),
    redFlags: redFlagsItem(redFlags, facts),
  };
  const verdict: Verdict = redFlags.length
    ? "blocked"
    : SAFETY_CONFIG.coreChecks.every((name) => checks[name].result === "pass")
      ? "ready"
      : "held";
  const warnings = SAFETY_CONFIG.warningChecks.filter((name) => checks[name].result !== "pass").map((name) => checks[name].reason);
  const cert = certificationWarning(facts);
  if (cert) warnings.push(cert);
  return { ranAt: facts.collectedAt, checks, redFlags, verdict, warnings };
}
