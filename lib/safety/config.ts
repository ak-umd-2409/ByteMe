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
  /** Brand words shorter than this only match exactly. */
  lookalikeMinLength: 5,
  maxPages: 6,
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
  pricePattern: /\$\s?\d/,
  monthlyPattern: /(per month|\/\s?mo\b|monthly|month-to-month)/i,
  contactSalesPattern: /\b(contact sales|talk to sales|request a quote|get a quote)\b/i,
} as const;
