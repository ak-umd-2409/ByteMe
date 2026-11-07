import type { OnboardingProfile } from "../business/types.ts";
import type { DiscoveryResult } from "../problems/types.ts";
import { evaluateRules, type RulesReport } from "./maryland.ts";

/** Build the rules context from a profile. Values we only assumed ("default") count as unknown. */
export function rulesForProfile(profile: OnboardingProfile, discovery?: DiscoveryResult | null): RulesReport {
  const known = (f: { value: boolean | null; source: string | null }) => (f.source === "default" ? null : f.value);
  const phoneUseCases = new Set(["missed-calls", "customer-messaging"]);
  return evaluateRules({
    stateCode: profile.business.address.value?.stateCode ?? null,
    industry: profile.business.industry.value,
    handlesHealthData: known(profile.owner.handlesHealthData),
    handlesLargeCustomerList: known(profile.owner.handlesLargeCustomerList),
    hasOutboundCallConsent: known(profile.owner.hasOutboundCallConsent),
    phoneToolsLikely: Boolean(
      discovery?.problems.some((p) => (p.status !== "hypothesis" || !p.needsOwnerConfirmation) && p.useCase && phoneUseCases.has(p.useCase)),
    ),
  });
}
