/**
 * Google reviews through SerpApi, used only when Google's own Places API sends no review text
 * (a Google project without billing gets ratings but no reviews). One call per business, by
 * Google place ID. Reviews are labelled "Google (via SerpApi)", linked to Google, and kept only
 * in the short-lived memory cache, the same as Google's own.
 */
import { sharedCache, type Cache } from "../shared/cache.ts";
import { log } from "../shared/logger.ts";
import type { FetchLike } from "../shared/safeFetch.ts";
import type { PlaceDetails, SourceReview } from "./types.ts";
import type { PlacesProvider } from "./places.ts";

interface SerpReview {
  link?: string;
  rating?: number;
  date?: string;
  iso_date?: string;
  snippet?: string;
  extracted_snippet?: { original?: string; translated?: string };
  user?: { name?: string; link?: string };
  review_id?: string;
}

/** Most reviews we read per business (SerpApi's first page holds about 8). */
const MAX_REVIEWS = 10;

export function mapSerpReviews(placeId: string, reviews: SerpReview[]): SourceReview[] {
  return reviews
    .map((r, i) => ({
      id: r.review_id ?? `serpapi-${placeId}-${i}`,
      source: "google" as const,
      platform: "Google (via SerpApi)",
      rating: typeof r.rating === "number" ? r.rating : null,
      text: (r.extracted_snippet?.original?.trim() || r.snippet?.trim() || "").trim(),
      author: r.user?.name ?? null,
      authorUrl: r.user?.link ?? null,
      url: r.link ?? null,
      publishedAt: r.iso_date ?? null,
      relativeTime: r.date ?? null,
    }))
    .filter((r) => r.text.length > 0)
    .slice(0, MAX_REVIEWS);
}

export async function fetchSerpReviews(
  placeId: string,
  apiKey: string,
  opts: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<SourceReview[]> {
  return (await fetchSerpReviewsWithStatus(placeId, apiKey, opts)).reviews;
}

/** Same as fetchSerpReviews, plus a short status saying what happened (for diagnosing). */
export async function fetchSerpReviewsWithStatus(
  placeId: string,
  apiKey: string,
  opts: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<{ reviews: SourceReview[]; status: string }> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_maps_reviews");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("hl", "en");
  url.searchParams.set("sort_by", "qualityScore");
  url.searchParams.set("api_key", apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await (opts.fetchImpl ?? fetch)(url.toString(), { signal: controller.signal });
    if (!res.ok) {
      // 401: bad key. 429: the month's free searches are used up. Either way, carry on without.
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      log.warn("serpapi.http_error", { status: res.status, error: body.error });
      return { reviews: [], status: `http_${res.status}${body.error ? `: ${body.error.slice(0, 120)}` : ""}` };
    }
    const body = (await res.json()) as { reviews?: SerpReview[]; error?: string };
    if (body.error) {
      log.warn("serpapi.error", { error: body.error });
      return { reviews: [], status: `error: ${body.error.slice(0, 120)}` };
    }
    const reviews = mapSerpReviews(placeId, body.reviews ?? []);
    return { reviews, status: reviews.length ? `ok:${reviews.length}` : "no_reviews" };
  } catch (error) {
    log.warn("serpapi.request_failed", { error });
    return { reviews: [], status: error instanceof Error && error.name === "AbortError" ? "timeout" : "request_failed" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Wraps the Google provider: when Google sends a business without review text, fill the
 * reviews in from SerpApi. Never throws because of SerpApi; the check simply goes on without.
 */
export function withSerpReviews(
  provider: PlacesProvider,
  apiKey: string,
  opts: { fetchImpl?: FetchLike; cache?: Cache; timeoutMs?: number } = {},
): PlacesProvider {
  const cache = opts.cache ?? sharedCache;
  return {
    kind: provider.kind,
    search: (query, near) => provider.search(query, near),
    async details(placeId) {
      const details = await provider.details(placeId);
      if (!details || details.provider !== "google_places" || details.reviews.length > 0) return details;
      const key = `serpapi:reviews:${placeId}`;
      const hit = cache.get<{ reviews: SourceReview[]; status: string }>(key);
      const result = hit ?? (await fetchSerpReviewsWithStatus(placeId, apiKey, opts));
      // Keep good answers for 30 minutes; retry failures after a minute (e.g. a key added late).
      if (!hit) cache.set(key, result, result.reviews.length ? 30 * 60_000 : 60_000);
      log.info("serpapi.reviews", { status: result.status });
      return { ...details, reviews: result.reviews.length ? result.reviews : details.reviews, serpapi: result.status } satisfies PlaceDetails;
    },
  };
}
