import type { ListingRecord } from "./listings.ts";
import type { BusinessMatch, DetectedTech, PlaceDetails, WebsiteAnalysis } from "./types.ts";
import type { PlacesProvider } from "./places.ts";

/**
 * Public snapshot: a real business's publicly available information, captured with a source
 * link and date for every fact, so the full workflow can run without network access or API keys.
 *
 * Rules for snapshot data (see data/real/README.md):
 * - Nothing invented. Every value comes from a public page listed in `sources`.
 * - Reviews keep a link, the reviewer's first name + last initial, and either a short exact
 *   excerpt (≤ 15 words, at most one per source page) or a plain-language summary marked as such.
 * - Sites that block automated readers (robots.txt) are not crawled; only what a search engine
 *   shows for them is used, marked `search_index`.
 */
export interface PublicSnapshot {
  placeId: string;
  capturedAt: string;
  captureNote: string;
  details: PlaceDetails;
  listings: ListingRecord[];
  website: WebsiteAnalysis;
  detectedTech: DetectedTech[];
  about: { label: string; value: string; url: string }[];
  sources: { label: string; url: string; via: "page_fetch" | "search_index"; usedFor: string }[];
}

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function snapshotPlacesProvider(snapshots: PublicSnapshot[]): PlacesProvider {
  return {
    kind: "public_snapshot",
    async search(query) {
      const words = normalize(query).split(" ").filter((w) => w.length > 2);
      if (words.length === 0) return [];
      // Rank by matches; a word in the business name counts more than one in the address.
      const score = (s: PublicSnapshot) => {
        const name = normalize(s.details.name);
        const rest = normalize(`${s.details.address.formatted} ${s.details.primaryTypeLabel ?? ""}`);
        return words.reduce((sum, w) => sum + (name.includes(w) ? 2 : rest.includes(w) ? 1 : 0), 0);
      };
      return snapshots
        .map((s) => ({ s, score: score(s) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.s)
        .map(
          (s): BusinessMatch => ({
            placeId: s.placeId,
            name: s.details.name,
            address: s.details.address.formatted,
            category: s.details.primaryTypeLabel,
            rating: s.details.rating,
            reviewCount: s.details.reviewCount,
            provider: "public_snapshot",
          }),
        );
    },
    async details(placeId) {
      const s = snapshots.find((x) => x.placeId === placeId);
      return s ? structuredClone(s.details) : null;
    },
  };
}

/** Try each provider in order; first non-empty answer wins. */
export function chainProviders(kind: PlacesProvider["kind"], providers: PlacesProvider[]): PlacesProvider {
  return {
    kind,
    async search(query, near) {
      const all: BusinessMatch[] = [];
      for (const p of providers) all.push(...(await p.search(query, near)));
      return all.slice(0, 8);
    },
    async details(placeId) {
      for (const p of providers) {
        const d = await p.details(placeId);
        if (d) return d;
      }
      return null;
    },
  };
}
