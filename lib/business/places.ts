import { mockPlaces } from "../../data/mock/onboarding.ts";
import { cached, hashKey, sharedCache, type Cache } from "../shared/cache.ts";
import { loadConfig, type AppConfig } from "../shared/config.ts";
import { log } from "../shared/logger.ts";
import type { FetchLike } from "../shared/safeFetch.ts";
import type { BusinessMatch, PlaceDetails, PostalAddress, SourceReview } from "./types.ts";

/**
 * Business lookup behind one interface:
 * - `createGooglePlacesProvider` uses Google Places API (New) when a key exists.
 * - `mockPlacesProvider` serves fictional sample businesses otherwise.
 *
 * Google limits: Place Details returns at most 5 reviews and never returns the
 * owner's replies. Reviews must be shown with author attribution and should not
 * be stored long-term, so we only keep them in a short-lived memory cache.
 */
export interface PlacesProvider {
  readonly kind: "google_places" | "mock";
  search(query: string, near?: string): Promise<BusinessMatch[]>;
  details(placeId: string): Promise<PlaceDetails | null>;
}

export class PlacesError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const SEARCH_FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.primaryTypeDisplayName",
  "places.rating",
  "places.userRatingCount",
].join(",");

const DETAIL_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "addressComponents",
  "nationalPhoneNumber",
  "websiteUri",
  "regularOpeningHours",
  "rating",
  "userRatingCount",
  "primaryType",
  "primaryTypeDisplayName",
  "types",
  "googleMapsUri",
  "businessStatus",
  "reviews",
].join(",");

interface GoogleText {
  text?: string;
}
interface GooglePlace {
  id?: string;
  displayName?: GoogleText;
  formattedAddress?: string;
  addressComponents?: { longText?: string; shortText?: string; types?: string[] }[];
  nationalPhoneNumber?: string;
  websiteUri?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  primaryTypeDisplayName?: GoogleText;
  types?: string[];
  googleMapsUri?: string;
  businessStatus?: string;
  reviews?: {
    name?: string;
    rating?: number;
    text?: GoogleText;
    originalText?: GoogleText;
    authorAttribution?: { displayName?: string; uri?: string };
    publishTime?: string;
    relativePublishTimeDescription?: string;
  }[];
}

export function mapAddress(place: GooglePlace): PostalAddress {
  const find = (type: string) => place.addressComponents?.find((c) => c.types?.includes(type));
  const number = find("street_number")?.longText;
  const route = find("route")?.longText;
  return {
    formatted: place.formattedAddress ?? "",
    street: [number, route].filter(Boolean).join(" ") || null,
    city: find("locality")?.longText ?? find("postal_town")?.longText ?? null,
    county: find("administrative_area_level_2")?.longText ?? null,
    state: find("administrative_area_level_1")?.longText ?? null,
    stateCode: find("administrative_area_level_1")?.shortText ?? null,
    postalCode: find("postal_code")?.longText ?? null,
    country: find("country")?.shortText ?? null,
  };
}

export function mapGooglePlace(place: GooglePlace): PlaceDetails {
  const reviews: SourceReview[] = (place.reviews ?? [])
    .map((review, index) => ({
      id: review.name ?? `google-${place.id}-${index}`,
      source: "google" as const,
      rating: typeof review.rating === "number" ? review.rating : null,
      text: (review.originalText?.text ?? review.text?.text ?? "").trim(),
      author: review.authorAttribution?.displayName ?? null,
      authorUrl: review.authorAttribution?.uri ?? null,
      publishedAt: review.publishTime ?? null,
      relativeTime: review.relativePublishTimeDescription ?? null,
    }))
    .filter((review) => review.text.length > 0);
  return {
    placeId: place.id ?? "",
    name: place.displayName?.text ?? "Unnamed business",
    address: mapAddress(place),
    phone: place.nationalPhoneNumber ?? null,
    website: place.websiteUri ?? null,
    hours: place.regularOpeningHours?.weekdayDescriptions ?? [],
    rating: place.rating ?? null,
    reviewCount: place.userRatingCount ?? null,
    primaryType: place.primaryType ?? null,
    primaryTypeLabel: place.primaryTypeDisplayName?.text ?? null,
    types: place.types ?? [],
    googleMapsUrl: place.googleMapsUri ?? null,
    businessStatus: place.businessStatus ?? null,
    reviews,
    provider: "google_places",
  };
}

export function createGooglePlacesProvider(
  apiKey: string,
  opts: { fetchImpl?: FetchLike; cache?: Cache; timeoutMs?: number } = {},
): PlacesProvider {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const cache = opts.cache ?? sharedCache;
  const call = async (url: string, init: RequestInit, fieldMask: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8_000);
    try {
      const response = await fetchImpl(url, {
        ...init,
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
          "x-goog-fieldmask": fieldMask,
        },
      });
      if (response.status === 404) return null;
      if (!response.ok) {
        log.warn("places.http_error", { status: response.status });
        throw new PlacesError("Business lookup is unavailable right now.", 502);
      }
      return (await response.json()) as unknown;
    } catch (error) {
      if (error instanceof PlacesError) throw error;
      log.warn("places.request_failed", { error });
      throw new PlacesError("Business lookup is unavailable right now.", 502);
    } finally {
      clearTimeout(timer);
    }
  };
  return {
    kind: "google_places",
    search(query, near) {
      const textQuery = near ? `${query} near ${near}` : query;
      return cached(cache, `places:search:${hashKey(textQuery)}`, 10 * 60_000, async () => {
        const data = (await call(
          "https://places.googleapis.com/v1/places:searchText",
          { method: "POST", body: JSON.stringify({ textQuery, pageSize: 5, regionCode: "US" }) },
          SEARCH_FIELDS,
        )) as { places?: GooglePlace[] } | null;
        return (data?.places ?? []).slice(0, 5).map((place) => ({
          placeId: place.id ?? "",
          name: place.displayName?.text ?? "Unnamed business",
          address: place.formattedAddress ?? "",
          category: place.primaryTypeDisplayName?.text ?? null,
          rating: place.rating ?? null,
          reviewCount: place.userRatingCount ?? null,
          provider: "google_places" as const,
        }));
      });
    },
    details(placeId) {
      if (!/^[A-Za-z0-9_-]{10,300}$/.test(placeId)) return Promise.resolve(null);
      // Short TTL: Google restricts storing Places content, reviews especially.
      return cached(cache, `places:details:${placeId}`, 30 * 60_000, async () => {
        const data = (await call(
          `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
          { method: "GET" },
          DETAIL_FIELDS,
        )) as GooglePlace | null;
        return data ? mapGooglePlace(data) : null;
      });
    },
  };
}

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export const mockPlacesProvider: PlacesProvider = {
  kind: "mock",
  async search(query) {
    const words = normalize(query).split(" ").filter((w) => w.length > 2);
    if (words.length === 0) return [];
    return mockPlaces
      .map((place) => {
        const haystack = normalize(`${place.name} ${place.address.formatted} ${place.primaryTypeLabel ?? ""}`);
        return { place, hits: words.filter((w) => haystack.includes(w)).length };
      })
      .filter((entry) => entry.hits > 0)
      .sort((a, b) => b.hits - a.hits || a.place.name.localeCompare(b.place.name))
      .map(({ place }) => ({
        placeId: place.placeId,
        name: place.name,
        address: place.address.formatted,
        category: place.primaryTypeLabel,
        rating: place.rating,
        reviewCount: place.reviewCount,
        provider: "mock" as const,
      }));
  },
  async details(placeId) {
    const place = mockPlaces.find((p) => p.placeId === placeId);
    return place ? structuredClone(place) : null;
  },
};

export function getPlacesProvider(config: AppConfig = loadConfig()): PlacesProvider {
  return config.googlePlacesApiKey ? createGooglePlacesProvider(config.googlePlacesApiKey) : mockPlacesProvider;
}
