/**
 * Builds one tool card (CatalogRecord) from the list entry, the card facts and
 * the Safety Check. Pure code: no internet, no AI. Every "unknown" lands in
 * needsVerification. The badge is never "verified" here, except that an
 * approved tool keeps its approval when it is still ready and nothing an
 * owner sees changed. See docs/specs/b-real-catalog.md §6.
 */
import { isFetched, type AiAnswer, type SafetyFacts } from "../safety/types.ts";
import { parseMonthly } from "./fill/answers.ts";
import type { CardFacts, PlanSize } from "./fill/types.ts";
import type { ListEntry } from "./list.ts";
import type { CatalogRecord, PriceTier, PrivacyAnswer, PrivacyKey, RulesFlagKey, SafetyReport } from "./types.ts";
import { unknownPaths } from "./validate.ts";

const SIZES: PlanSize[] = ["small", "medium", "large"];
const SIZE_LABEL: Record<PlanSize, string> = { small: "Cheapest paid plan", medium: "Middle plan", large: "Top plan" };
const FLAGS: RulesFlagKey[] = ["recordsCalls", "announcesRecording", "hipaaReady", "outboundAiCalls", "personalizedPricing"];

const known = <T extends string>(a: AiAnswer<T>): a is Exclude<AiAnswer<T>, "unknown"> => a !== "unknown";
const yesNo = (a: AiAnswer<string>): boolean | "unknown" => (known(a) ? (a.answer === "yes" ? true : a.answer === "no" ? false : "unknown") : "unknown");

const PLAIN: Record<PrivacyKey, (answer: string) => string> = {
  trainsOnYourData: (a) =>
    ({
      no: "Does not use your data to train AI.",
      "opt-in": "Uses your data to train AI only if you agree.",
      anonymized: "Uses your data to improve its AI, with names removed first.",
      "opt-out": "Uses your data to improve its AI unless you turn it off.",
      yes: "Uses your data to train its AI.",
    })[a] ?? "We couldn't confirm whether it uses your data to train AI.",
  canDeleteData: (a) =>
    ({ yes: "You can delete your data.", no: "You can't delete your data." })[a] ?? "We couldn't confirm whether you can delete your data.",
  whereStored: (a) => (a === "unknown" ? "We couldn't confirm where your data is stored." : `Your data is stored in ${a}.`),
  sharesOrSells: (a) =>
    ({ no: "Does not sell or share your data.", yes: "May sell or share your data." })[a] ??
    "We couldn't confirm whether it sells or shares your data.",
  securityCertification: (a) =>
    a === "unknown" ? "We couldn't confirm a security certification." : `Security checked by an outside company: ${a}.`,
};

function privacyAnswer(key: PrivacyKey, a: AiAnswer<string>): PrivacyAnswer {
  if (!known(a)) return { answer: "unknown", plain: PLAIN[key]("unknown"), quote: null, sourceUrl: null };
  return { answer: a.answer, plain: PLAIN[key](a.answer), quote: a.quote, sourceUrl: a.pageUrl };
}

/** The parts of a card an owner sees. If any change, a person must approve again. */
const ownerFacing = (r: CatalogRecord) =>
  JSON.stringify([r.description, r.pricing, r.worksWith, r.setupMinutes, r.setupMode, r.languages, r.privacyCard, r.rulesFlags]);

export function buildRecord(
  entry: ListEntry,
  card: CardFacts,
  safety: SafetyFacts,
  report: SafetyReport,
  previous: CatalogRecord | null = null,
): CatalogRecord {
  const ai = card.ai;
  const s = safety.ai;
  const extraChecks: string[] = [];
  const homeHost = new URL(entry.url).hostname.replace(/^www\./, "");

  const pricingPage = card.pages.pricing;
  const plans = Object.fromEntries(
    SIZES.map((size) => {
      const a = ai.plans[size];
      const monthlyUsd = known(a) ? parseMonthly(a.answer) : "unknown";
      const name = ai.planNotes[size];
      return [size, { monthlyUsd, note: monthlyUsd === "unknown" ? "" : name ? `${name} plan` : SIZE_LABEL[size] }];
    }),
  ) as Record<PlanSize, PriceTier>;

  let description = known(ai.description) ? ai.description.answer : "";
  if (!description) {
    // Our own label from the tool list, not a vendor fact. A person should replace it.
    description = `${entry.category}.`;
    extraChecks.push("description");
  }
  let setupMode = known(ai.setupMode) ? ai.setupMode.answer : null;
  if (!setupMode) {
    // The cautious choice: don't promise an owner they can set it up alone.
    setupMode = "needs_help";
    extraChecks.push("setupMode");
  }
  let languages = known(ai.languages) ? ai.languages.answer.split(",").map((l) => l.trim()).filter(Boolean) : [];
  if (!languages.length) {
    // Every site we read is in English, and the data checker needs at least one language.
    languages = ["English"];
    extraChecks.push("languages");
  }
  const minutes = known(ai.setupMinutes) ? Number(ai.setupMinutes.answer) : NaN;

  const record: CatalogRecord = {
    id: entry.id,
    name: entry.name,
    vendor: {
      company: known(s.companyName) ? s.companyName.answer : entry.name,
      website: entry.url,
      domain: homeHost,
    },
    description,
    category: entry.category,
    useCases: [...entry.useCases],
    industries: [...entry.industries],
    ...(entry.existingProduct ? { existingProduct: entry.existingProduct } : {}),
    pricing: {
      asOf: "Nov 2026",
      small: plans.small,
      medium: plans.medium,
      large: plans.large,
      freeTier: yesNo(ai.freeTier),
      contract: known(ai.contract) ? ai.contract.answer : "unknown",
      cancellation: known(ai.cancellation) ? ai.cancellation.answer : "unknown",
      pricingUrl: isFetched(pricingPage) ? pricingPage.finalUrl : "unknown",
    },
    worksWith: ai.worksWith.map((w) => ({ product: w.product, type: w.type })),
    setupMinutes: Number.isFinite(minutes) && minutes >= 0 ? minutes : "unknown",
    setupMode,
    languages,
    privacyCard: {
      trainsOnYourData: privacyAnswer("trainsOnYourData", s.trainsOnYourData),
      canDeleteData: privacyAnswer("canDeleteData", s.canDeleteData),
      whereStored: privacyAnswer("whereStored", s.whereStored),
      sharesOrSells: privacyAnswer("sharesOrSells", ai.sharesOrSells),
      securityCertification: privacyAnswer("securityCertification", s.securityCertification),
    },
    rulesFlags: Object.fromEntries(FLAGS.map((f) => [f, yesNo(ai[f])])) as CatalogRecord["rulesFlags"],
    badge: report.verdict === "blocked" ? "blocked" : "listed",
    safetyCheck: report,
    lastChecked: card.collectedAt,
    sources: [],
    needsVerification: [],
  };

  const quoted = [
    ai.description,
    ...SIZES.map((size) => ai.plans[size]),
    ai.freeTier,
    ai.contract,
    ai.cancellation,
    ai.setupMinutes,
    ai.setupMode,
    ai.languages,
    ...FLAGS.map((f) => ai[f]),
    ai.sharesOrSells,
    s.companyName,
    s.trainsOnYourData,
    s.canDeleteData,
    s.whereStored,
    s.securityCertification,
  ];
  const sources = [...quoted.filter(known).map((a) => a.pageUrl), ...ai.worksWith.map((w) => w.pageUrl)];
  record.sources = [...new Set(sources.length ? sources : [entry.url])];

  const unknowns: string[] = [];
  unknownPaths(record, "", unknowns);
  record.needsVerification = [...new Set([...unknowns, ...extraChecks])];

  if (previous?.badge === "verified" && report.verdict === "ready" && ownerFacing(previous) === ownerFacing(record)) {
    record.badge = "verified";
    record.reviewedAt = previous.reviewedAt;
    record.reviewedBy = previous.reviewedBy;
  }
  return record;
}
