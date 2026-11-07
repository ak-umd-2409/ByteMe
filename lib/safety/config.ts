/**
 * Every threshold, pattern and word list the Safety Check uses, in one place.
 * See docs/specs/b-safety-check.md §4.
 */
import type { SafetyCheckName } from "../catalog/types.ts";

export const SAFETY_CONFIG = {
  coreChecks: ["whoIsBehind", "privacyPolicy", "dataUse", "securityBasics", "redFlags"] as readonly SafetyCheckName[],
  warningChecks: ["domainAge", "dataLocation", "pricingClarity"] as readonly SafetyCheckName[],
  minPrivacyWords: 150,
  domainMinMonths: 12,
  newDomainMonths: 6,
  lookalikeMaxDistance: 2,
  /** Brand words this long or longer allow lookalikeMaxDistance edits. Shorter ones allow only one typo trick. */
  lookalikeLongLength: 9,
  /** Brand words shorter than this only match exactly. */
  lookalikeMinLength: 5,
  maxPages: 6,
  /** Big vendor home pages are often 1.5–3 MB of HTML. */
  maxPageBytes: 5_000_000,
  downloadExtensions: [".exe", ".dmg", ".msi", ".apk", ".pkg"],
  fallbackPaths: {
    about: ["/about", "/about-us", "/company"],
    contact: ["/contact", "/contact-us"],
    privacy: ["/privacy", "/privacy-policy", "/legal/privacy"],
    pricing: ["/pricing", "/plans"],
    terms: ["/terms", "/terms-of-service", "/legal/terms"],
  },
  riskyPatterns: [
    /\btrain(s|ed|ing)?\b/i,
    /\bimprov\w*\s+(our|the)?\s*(models?|ai|algorithms?)\b/i,
    /\bmachine learning\b/i,
  ],
  /** A "we don't train" sentence must have one of these... */
  negationPattern: /\b(not|never|no)\b|n't\b/i,
  /** ...and none of these, or a person must read it. */
  qualifierPattern: /\b(unless|except|but|however|may|might|anonymi[sz]ed|aggregated?|de-identified|improve\w*)\b/i,
  /** An "anonymized" training answer needs one of these words in its quote. */
  anonymizedPattern: /\b(de[- ]?identified|aggregated?|anonymi[sz]\w*|pseudonymi[sz]\w*)\b/i,
  /** An "opt-out" training answer needs its quote to say how to stop it. */
  optOutPattern: /\b(opt(ing)?[- ]?out|turn(ing)? (it |this )?off|switch(ing)? (it |this )?off|disable|withdraw)\b/i,
  /** An "opt-in" training answer needs its quote to say the customer agrees first. */
  consentPattern: /\b(opts?[- ]?in|opted[- ]?in|consent\w*|agree\w*|permission|allow\w*|authori[sz]\w*|choose)\b/i,
  /** Any training answer other than "no" must be quoted from a sentence about training or improving AI. */
  trainingTopicPattern: /\b(train\w*|models?|ai|artificial intelligence|machine learning|improv\w*)\b/i,
  pricePattern: /\$\s?\d/,
  monthlyPattern: /(per month|\/\s?mo\b|monthly|month-to-month)/i,
  contactSalesPattern: /\b(contact sales|talk to sales|request a quote|get a quote)\b/i,
} as const;
