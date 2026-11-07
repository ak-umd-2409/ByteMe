/**
 * The seven Safety Checks other than red flags. Pure: they read only the fact
 * sheet. Rules: docs/specs/b-safety-check.md §4 and "Follow-up". Numbers: config.ts.
 *
 * Every reason and warning is read by a small-business owner who knows nothing
 * about AI: short sentences, no AI words, and a warning ends with what to do.
 */
import type { Evidence, SafetyCheckItem } from "../catalog/types.ts";
import { SAFETY_CONFIG } from "./config.ts";
import { monthsBefore } from "./dates.ts";
import { isFetched, type AiAnswer, type PageFact, type SafetyFacts } from "./types.ts";

const item = (result: SafetyCheckItem["result"], reason: string, evidence: Evidence[]): SafetyCheckItem => ({
  result,
  reason,
  evidence,
});

const pageEvidence = (...pages: PageFact[]): Evidence[] =>
  pages.filter(isFetched).map((p) => ({ url: p.finalUrl, checkedAt: p.fetchedAt }));

/** Evidence for AI answers: the quote, its page, and when that page was read. */
function answerEvidence(facts: SafetyFacts, ...answers: AiAnswer<string>[]): Evidence[] {
  const fetched = Object.values(facts.pages).filter(isFetched);
  return answers
    .filter((a) => a !== "unknown")
    .map((a) => ({
      quote: a.quote,
      url: a.pageUrl,
      checkedAt: fetched.find((p) => p.finalUrl === a.pageUrl)?.fetchedAt ?? facts.collectedAt,
    }));
}

const norm = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();
const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "2007-05-26" → "May 2007". */
const monthYear = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

export function checkWhoIsBehind(facts: SafetyFacts): SafetyCheckItem {
  const { companyName, leaderName, ran } = facts.ai;
  const address = facts.ai.address !== "unknown" ? facts.ai.address : facts.ai.policyAddress;
  const { about, contact } = facts.pages;
  const evidence = answerEvidence(facts, companyName, address, leaderName);
  if (companyName !== "unknown" && address !== "unknown")
    return item("pass", `Run by ${companyName.answer}, a company at ${address.answer}.`, evidence);
  const read = isFetched(about) || isFetched(contact);
  if (read && ran.about && companyName === "unknown")
    return item("fail", "The website doesn't say which company is behind this tool.", pageEvidence(about, contact));
  const reason = !read
    ? "We couldn't find an About or Contact page that says who is behind this tool."
    : companyName === "unknown"
      ? "We couldn't tell which company is behind this tool."
      : `We couldn't find an address for ${companyName.answer}.`;
  return item("unknown", reason, evidence.length ? evidence : pageEvidence(about, contact));
}

export function leaderWarning(facts: SafetyFacts): string | null {
  return facts.ai.leaderName === "unknown" ? "We couldn't find the name of the person who runs this company." : null;
}

export function checkPrivacyPolicy(facts: SafetyFacts): SafetyCheckItem {
  const privacy = facts.pages.privacy;
  if (privacy === null) return item("fail", "There's no privacy policy on the website.", []);
  if (!isFetched(privacy)) return item("unknown", "We couldn't open the privacy policy.", []);
  if (wordCount(privacy.text) < SAFETY_CONFIG.minPrivacyWords)
    return item("unknown", "The privacy policy is too short to tell what they do with your information.", pageEvidence(privacy));
  return item("pass", "Has a full privacy policy that says what they do with your information.", pageEvidence(privacy));
}

const ANSWERS_PASS: Record<string, string> = {
  no: "Doesn't use your information to make its AI better.",
  "opt-in": "Only uses your information to make its AI better if you say yes.",
  anonymized: "Uses your information to make its AI better, but removes names first.",
  "opt-out": "Uses your information to make its AI better, but you can turn this off.",
};

export function checkDataUse(facts: SafetyFacts): SafetyCheckItem {
  const { trainsOnYourData: trains, canDeleteData: del } = facts.ai;
  const evidence = answerEvidence(facts, trains, del);
  const fallback = evidence.length ? evidence : pageEvidence(facts.pages.privacy);
  if (trains !== "unknown" && trains.answer === "yes")
    return item("fail", "It may use your customers' information to make its AI better, and we found no way to stop it.", evidence);
  if (del !== "unknown" && del.answer === "no") return item("fail", "You can't delete your information.", evidence);
  // A "no" or "names removed" answer must not be contradicted by another sentence
  // about training. The quoted sentence itself is set aside only when it really
  // says what the answer claims; every other risky sentence counts.
  if (trains !== "unknown" && (trains.answer === "no" || trains.answer === "anonymized")) {
    const { negationPattern, qualifierPattern, anonymizedPattern } = SAFETY_CONFIG;
    const quoteOk = trains.answer === "no" ? negationPattern.test(trains.quote) && !qualifierPattern.test(trains.quote) : true;
    const explained = (s: string) =>
      (quoteOk && norm(s) === norm(trains.quote)) || (trains.answer === "anonymized" && anonymizedPattern.test(s));
    const others = facts.riskySentences.filter((s) => !explained(s));
    if (others.length > 0) {
      const privacy = pageEvidence(facts.pages.privacy);
      const risky = privacy.length ? others.map((quote) => ({ ...privacy[0], quote })) : [];
      return item(
        "unknown",
        "The privacy policy isn't clear about whether it uses your information to make its AI better. A person needs to read it.",
        [...evidence, ...risky],
      );
    }
  }
  if (trains !== "unknown" && del !== "unknown")
    return item("pass", `${ANSWERS_PASS[trains.answer]} You can delete your information.`, evidence);
  const missing = [
    trains === "unknown" && "whether it uses your information to make its AI better",
    del === "unknown" && "whether you can delete your information",
  ]
    .filter(Boolean)
    .join(" or ");
  return item("unknown", `We couldn't find ${missing}.`, fallback);
}

/** The plain-words warning owners see when a tool learns from their data. */
export function trainingWarning(facts: SafetyFacts): string | null {
  const trains = facts.ai.trainsOnYourData;
  if (trains === "unknown") return null;
  if (trains.answer === "anonymized")
    return "This tool learns from how people use it. It may use your customers' calls or messages to get better, but it removes names and phone numbers first. Good to know: don't share card numbers or health details with it.";
  if (trains.answer === "opt-out")
    return "Turn this setting off after you sign up. This tool may use your customers' calls or messages to get better. You can stop this in its settings.";
  return null;
}

export function checkSecurityBasics(facts: SafetyFacts): SafetyCheckItem {
  const home = facts.pages.home;
  if (!isFetched(home)) return item("unknown", "We couldn't open the website.", []);
  if (!facts.https) return item("fail", "Your connection to this website isn't private (no https).", pageEvidence(home));
  const note = certificationWarning(facts);
  const reason = "Your connection to this website is private (https).";
  return item("pass", note ? `${reason} ${note}` : reason, pageEvidence(home));
}

export function certificationWarning(facts: SafetyFacts): string | null {
  return facts.input.handlesSensitiveData && facts.ai.securityCertification === "unknown"
    ? "This tool handles payments or health information, but we found no proof that an outside company checked its security (like PCI or SOC 2)."
    : null;
}

export function checkDomainAge(facts: SafetyFacts): SafetyCheckItem {
  const { registeredAt, name } = facts.domain;
  const evidence = [{ url: `https://rdap.org/domain/${name}`, checkedAt: facts.collectedAt }];
  if (!registeredAt) return item("unknown", "We couldn't find when the website started.", []);
  // Pass only when strictly older than 12 months; exactly 12 months fails.
  if (registeredAt.slice(0, 10) >= monthsBefore(facts.collectedAt, SAFETY_CONFIG.domainMinMonths))
    return item("fail", `The website is less than a year old (started ${monthYear(registeredAt)}). New websites are riskier.`, evidence);
  return item("pass", `The website has been around since ${monthYear(registeredAt)}.`, evidence);
}

export function checkDataLocation(facts: SafetyFacts): SafetyCheckItem {
  const where = facts.ai.whereStored;
  if (where === "unknown")
    return item("unknown", "We couldn't find which country your information is kept in.", pageEvidence(facts.pages.privacy));
  return item("pass", `Your information is kept in ${where.answer}.`, answerEvidence(facts, where));
}

export function checkPricingClarity(facts: SafetyFacts): SafetyCheckItem {
  const pricing = facts.pages.pricing;
  const { pricePattern, monthlyPattern } = SAFETY_CONFIG;
  if (pricing === null) return item("fail", "We couldn't find a pricing page.", []);
  if (!isFetched(pricing)) return item("unknown", "We couldn't open the pricing page.", []);
  if (pricePattern.test(pricing.text) && monthlyPattern.test(pricing.text))
    return item("pass", "Shows a clear monthly price.", pageEvidence(pricing));
  return item(
    "fail",
    SAFETY_CONFIG.contactSalesPattern.test(pricing.text)
      ? "No price on the website. You have to talk to their sales team."
      : "The website doesn't show a clear monthly price.",
    pageEvidence(pricing),
  );
}
