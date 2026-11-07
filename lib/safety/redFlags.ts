/**
 * Red flags: any one blocks a tool. See docs/specs/b-safety-check.md §4.
 */
import brandList from "../../data/safety/brands.json" with { type: "json" };
import { SAFETY_CONFIG } from "./config.ts";
import { isYoungerThan } from "./dates.ts";
import type { SafetyFacts } from "./types.ts";

export interface Brand {
  brand: string;
  words: string[];
  domains: string[];
}

const BRANDS: Brand[] = brandList;

/** Levenshtein distance, ignoring case. */
export function editDistance(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const row = [i];
    for (let j = 1; j <= t.length; j++)
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[t.length];
}

const hostOf = (domainOrUrl: string) => {
  try {
    return new URL(/^[a-z]+:\/\//i.test(domainOrUrl) ? domainOrUrl : `https://${domainOrUrl}`).hostname.toLowerCase();
  } catch {
    return domainOrUrl.toLowerCase();
  }
};

const isOfficial = (host: string, brand: Brand) =>
  brand.domains.some((d) => host === d || host.endsWith(`.${d}`));

/** A domain word that imitates a known brand, unless the domain is that brand's own. */
export function findLookalike(domain: string, brands: Brand[] = BRANDS): { brand: string; word: string } | null {
  const host = hostOf(domain).replace(/^www\./, "");
  const words = host.split(".").slice(0, -1).flatMap((part) => part.split("-")).filter(Boolean);
  const { lookalikeMaxDistance, lookalikeMinLength } = SAFETY_CONFIG;
  for (const brand of brands) {
    if (isOfficial(host, brand)) continue;
    for (const word of words)
      for (const brandWord of brand.words) {
        const short = word.length < lookalikeMinLength || brandWord.length < lookalikeMinLength;
        const distance = editDistance(word, brandWord);
        if (short ? distance === 0 : distance <= lookalikeMaxDistance) return { brand: brand.brand, word };
      }
  }
  return null;
}

/** Plain-English red flags, in a fixed order. Empty when none. */
export function findRedFlags(facts: SafetyFacts): string[] {
  const flags: string[] = [];
  const lookalike = findLookalike(facts.input.url) ?? findLookalike(facts.domain.name);
  if (lookalike) flags.push(`Name and website imitate ${lookalike.brand} (${lookalike.word} vs. ${lookalike.brand}).`);
  if (facts.pages.privacy === null) flags.push("No privacy policy found.");
  const registered = facts.domain.registeredAt;
  if (facts.downloadPrompt && registered && isYoungerThan(registered, facts.collectedAt, SAFETY_CONFIG.newDomainMonths))
    flags.push("Website is under 6 months old and asks you to download software.");
  if (facts.safeBrowsing === "listed") flags.push("Google lists this website as unsafe.");
  return flags;
}
