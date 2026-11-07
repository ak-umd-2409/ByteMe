/**
 * The seven Safety Checks other than red flags. Pure: they read only the fact
 * sheet. Rules: docs/specs/b-safety-check.md §4. Numbers: config.ts.
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

export function checkWhoIsBehind(facts: SafetyFacts): SafetyCheckItem {
  const { companyName, address, leaderName, ran } = facts.ai;
  const { about, contact } = facts.pages;
  const evidence = answerEvidence(facts, companyName, address, leaderName);
  if (companyName !== "unknown" && address !== "unknown" && leaderName !== "unknown")
    return item("pass", `Run by ${companyName.answer}, led by ${leaderName.answer}, at ${address.answer}.`, evidence);
  const read = isFetched(about) || isFetched(contact);
  if (read && ran.about && companyName === "unknown")
    return item("fail", "The About and Contact pages don't say which company runs this tool.", pageEvidence(about, contact));
  const missing = [
    companyName === "unknown" && "company name",
    address === "unknown" && "address",
    leaderName === "unknown" && "leader's name",
  ].filter(Boolean);
  const reason = !read
    ? "We couldn't read an About or Contact page."
    : !ran.about
      ? "We couldn't read the About and Contact pages closely enough to say who runs this tool."
      : `We couldn't find the ${missing.join(", ")}.`;
  return item("unknown", reason, evidence.length ? evidence : pageEvidence(about, contact));
}

export function checkPrivacyPolicy(facts: SafetyFacts): SafetyCheckItem {
  const privacy = facts.pages.privacy;
  if (privacy === null) return item("fail", "We found no privacy policy anywhere on the website.", []);
  if (!isFetched(privacy)) return item("unknown", "We couldn't read the privacy policy page (the website blocked us or didn't answer).", []);
  if (wordCount(privacy.text) < SAFETY_CONFIG.minPrivacyWords)
    return item("unknown", "The privacy policy is too short to tell what happens to your data.", pageEvidence(privacy));
  return item("pass", "Has a full privacy policy.", pageEvidence(privacy));
}

export function checkDataUse(facts: SafetyFacts): SafetyCheckItem {
  const { trainsOnYourData: trains, canDeleteData: del } = facts.ai;
  const evidence = answerEvidence(facts, trains, del);
  const fallback = evidence.length ? evidence : pageEvidence(facts.pages.privacy);
  if (trains !== "unknown" && trains.answer === "yes")
    return item("fail", "Uses your data to train its AI.", evidence);
  if (del !== "unknown" && del.answer === "no") return item("fail", "You can't delete your data.", evidence);
  // The "no training" sentence itself often says "train". It is set aside only when it
  // reads as a plain no (a negation and no exceptions); every other risky sentence counts.
  const plainNo = trains !== "unknown" && SAFETY_CONFIG.negationPattern.test(trains.quote) && !SAFETY_CONFIG.qualifierPattern.test(trains.quote);
  const others = trains === "unknown" ? [] : facts.riskySentences.filter((s) => !(plainNo && norm(s) === norm(trains.quote)));
  if (trains !== "unknown" && trains.answer === "no" && others.length > 0) {
    const privacy = pageEvidence(facts.pages.privacy);
    const risky = privacy.length ? others.map((quote) => ({ ...privacy[0], quote })) : [];
    return item(
      "unknown",
      "The policy says it doesn't train on your data, but other sentences mention training or improving models. A person must read it.",
      [...evidence, ...risky],
    );
  }
  if (trains !== "unknown" && del !== "unknown")
    return item(
      "pass",
      trains.answer === "opt-in"
        ? "Only trains on your data if you say yes, and you can delete your data."
        : "Doesn't train on your data, and you can delete your data.",
      evidence,
    );
  const missing = [trains === "unknown" && "whether it trains AI on your data", del === "unknown" && "whether you can delete your data"]
    .filter(Boolean)
    .join(" or ");
  return item("unknown", `We couldn't find ${missing}.`, fallback);
}

export function checkSecurityBasics(facts: SafetyFacts): SafetyCheckItem {
  const home = facts.pages.home;
  if (!isFetched(home)) return item("unknown", "We couldn't reach the website.", []);
  if (!facts.https) return item("fail", "The website doesn't use a secure (https) connection.", pageEvidence(home));
  const note = certificationWarning(facts);
  return item("pass", note ? `Uses a secure (https) connection. ${note}` : "Uses a secure (https) connection.", pageEvidence(home));
}

export function certificationWarning(facts: SafetyFacts): string | null {
  return facts.input.handlesSensitiveData && facts.ai.securityCertification === "unknown"
    ? "Takes payments or health info, but we found no security certification (like PCI or SOC 2)."
    : null;
}

export function checkDomainAge(facts: SafetyFacts): SafetyCheckItem {
  const { registeredAt, name } = facts.domain;
  const evidence = [{ url: `https://rdap.org/domain/${name}`, checkedAt: facts.collectedAt }];
  if (!registeredAt) return item("unknown", "We couldn't find when the website was registered.", []);
  // Pass only when strictly older than 12 months; exactly 12 months fails.
  if (registeredAt.slice(0, 10) >= monthsBefore(facts.collectedAt, SAFETY_CONFIG.domainMinMonths))
    return item("fail", `The website is only a year old or less (registered ${registeredAt.slice(0, 10)}).`, evidence);
  return item("pass", `The website has been around since ${registeredAt.slice(0, 10)}.`, evidence);
}

export function checkDataLocation(facts: SafetyFacts): SafetyCheckItem {
  const where = facts.ai.whereStored;
  if (where === "unknown")
    return item("unknown", "We couldn't find where your data is stored.", pageEvidence(facts.pages.privacy));
  return item("pass", `Your data is stored in ${where.answer}.`, answerEvidence(facts, where));
}

export function checkPricingClarity(facts: SafetyFacts): SafetyCheckItem {
  const pricing = facts.pages.pricing;
  const { pricePattern, monthlyPattern } = SAFETY_CONFIG;
  if (pricing === null) return item("fail", "We found no public pricing page.", []);
  if (!isFetched(pricing)) return item("unknown", "We couldn't check the pricing page.", []);
  if (pricePattern.test(pricing.text) && monthlyPattern.test(pricing.text))
    return item("pass", "Shows a monthly price in dollars.", pageEvidence(pricing));
  return item(
    "fail",
    SAFETY_CONFIG.contactSalesPattern.test(pricing.text)
      ? "No public price: you have to contact sales."
      : "The pricing page doesn't show a clear monthly price.",
    pageEvidence(pricing),
  );
}
