/**
 * Spec 2.9–2.11 — where the business is: county, rural or not, nearest SBDC region, languages spoken
 * nearby, and an internet check. Data is a small table with sources, checked 2026-11-07.
 * Census figures are county-level and only included where we've recorded them; elsewhere we say so.
 */
export interface SbdcRegion {
  name: string;
  counties: string[];
  url: string;
  phone: string | null;
}

/** Maryland SBDC regions and the counties each serves (marylandsbdc.org/locations, checked 2026-11-07). */
export const SBDC_REGIONS: SbdcRegion[] = [
  { name: "Western Region", counties: ["Allegany", "Garrett", "Washington"], url: "https://www.marylandsbdc.org/locations/western-region", phone: null },
  { name: "Northern Region", counties: ["Frederick", "Carroll", "Harford", "Cecil"], url: "https://www.marylandsbdc.org/locations/northern-region", phone: "410-386-8390" },
  { name: "Corridor Region", counties: ["Anne Arundel", "Howard", "Montgomery", "Prince George's"], url: "https://www.marylandsbdc.org/locations/corridor-region", phone: null },
  { name: "Baltimore Region", counties: ["Baltimore City", "Baltimore"], url: "https://www.marylandsbdc.org/locations/baltimore-region", phone: null },
  { name: "Southern Region", counties: ["Calvert", "Charles", "St. Mary's"], url: "https://www.marylandsbdc.org/locations/southern-region", phone: null },
  { name: "Eastern Region", counties: ["Caroline", "Dorchester", "Kent", "Queen Anne's", "Somerset", "Talbot", "Wicomico", "Worcester"], url: "https://www.marylandsbdc.org/locations/eastern-region", phone: null },
];

/** The 18 jurisdictions Maryland law defines as rural (Rural Maryland Council, checked 2026-11-07). */
export const MD_RURAL_COUNTIES = new Set([
  "Allegany", "Calvert", "Caroline", "Carroll", "Cecil", "Charles", "Dorchester", "Frederick", "Garrett",
  "Harford", "Kent", "Queen Anne's", "Somerset", "St. Mary's", "Talbot", "Washington", "Wicomico", "Worcester",
]);
const RURAL_SOURCE = { label: "Rural Maryland Council", url: "https://rural.maryland.gov/the-rural-maryland-council/" };

interface CountyCensus {
  otherLanguagePct: number;
  broadbandPct: number;
  period: string;
  url: string;
}
/** U.S. Census QuickFacts (ACS 5-year). Add counties as they are checked. */
const CENSUS: Record<string, CountyCensus> = {
  Frederick: { otherLanguagePct: 17.7, broadbandPct: 93.2, period: "2020–2024", url: "https://www.census.gov/quickfacts/frederickcountymaryland" },
};

export interface LocationContext {
  county: string | null;
  stateCode: string | null;
  rural: { value: boolean; note: string; source: typeof RURAL_SOURCE } | null;
  sbdc: SbdcRegion | null;
  languages: { otherThanEnglishPct: number; text: string; source: { label: string; url: string } } | null;
  internet: { broadbandPct: number; text: string; favorPhoneFriendly: boolean; source: { label: string; url: string } } | null;
  missing: string[];
}

export const normalizeCounty = (county: string | null | undefined) =>
  county ? county.replace(/\s+County$/i, "").replace(/^Saint /, "St. ").trim() : null;

export function locationContext(address: { county?: string | null; stateCode?: string | null; city?: string | null } | null): LocationContext {
  const stateCode = address?.stateCode ?? null;
  const county = normalizeCounty(address?.county ?? (address?.city === "Baltimore" ? "Baltimore City" : null));
  const missing: string[] = [];
  if (stateCode !== "MD" || !county) {
    return { county, stateCode, rural: null, sbdc: null, languages: null, internet: null, missing: ["Location details are only available for Maryland counties right now."] };
  }
  const rural = MD_RURAL_COUNTIES.has(county);
  const census = CENSUS[county];
  if (!census) missing.push(`Census language and internet figures for ${county} County aren't loaded yet.`);
  const oneIn = census ? Math.round(100 / census.otherLanguagePct) : null;
  return {
    county,
    stateCode,
    rural: {
      value: rural,
      note: rural ? `${county} County is one of Maryland's 18 rural counties.` : `${county} is not one of Maryland's rural counties.`,
      source: RURAL_SOURCE,
    },
    sbdc: SBDC_REGIONS.find((r) => r.counties.includes(county)) ?? null,
    languages: census
      ? {
          otherThanEnglishPct: census.otherLanguagePct,
          text: `About 1 in ${oneIn} people in ${county} County speak a language other than English at home (${census.otherLanguagePct}%).`,
          source: { label: `U.S. Census QuickFacts, ${census.period}`, url: census.url },
        }
      : null,
    internet: census
      ? {
          broadbandPct: census.broadbandPct,
          favorPhoneFriendly: census.broadbandPct < 85 || rural,
          text:
            census.broadbandPct < 85
              ? `Only ${census.broadbandPct}% of households in ${county} County have broadband. We'll favor tools that work well on a phone.`
              : `${census.broadbandPct}% of households in ${county} County have broadband.${rural ? " Parts of rural areas may still be slow, so we'll favor tools that work well on a phone." : ""}`,
          source: { label: `U.S. Census QuickFacts, ${census.period}`, url: census.url },
        }
      : null,
    missing,
  };
}
