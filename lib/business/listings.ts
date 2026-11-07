import type { PlaceDetails, WebsiteAnalysis } from "./types.ts";

/**
 * Listings check: the same business as it appears on Google, its website and public directories.
 * Deterministic. Every issue names the listings (with links) that disagree.
 *
 * Customers who find the wrong hours or number don't call, so mismatches are a real, fixable problem.
 */

export type Directory = "google" | "website" | "bbb" | "yelp" | "birdeye" | "yahoo" | "facebook" | "linkedin" | "angi" | "other";

export interface ListingRecord {
  id: string;
  directory: Directory;
  /** Shown to the owner, e.g. "Yelp (listing 2)". */
  label: string;
  url: string | null;
  /** ISO date the data was captured. */
  capturedAt: string;
  /** How we got it. "search_index" = text a search engine showed for the page. */
  capturedVia: "places_api" | "page_fetch" | "search_index" | "website_scan" | "sample";
  name: string | null;
  address: string | null;
  phone: string | null;
  /** As written on the listing, e.g. ["Monday: 7:00 AM – 5:00 PM", …] or ["Open 24 hours"]. */
  hours: string[] | null;
  rating: number | null;
  reviewCount: number | null;
  /**
   * Yes/no service claims shown on the listing, e.g. Angi's "offers emergency services".
   * `null`/missing = the listing doesn't say. Only compared when two listings both say something.
   */
  services?: Partial<Record<ServiceClaim, boolean | null>>;
}

export type ServiceClaim = "emergency_service" | "senior_discount" | "free_estimates";
const SERVICE_LABEL: Record<ServiceClaim, string> = {
  emergency_service: "emergency service",
  senior_discount: "a senior discount",
  free_estimates: "free estimates",
};

export interface ListingValue {
  /** Normalized, human-readable value, e.g. "Mon–Fri 7 AM–5 PM · Sat 8 AM–12 PM". */
  display: string;
  listingIds: string[];
}

export interface ListingField {
  field: "hours" | "address" | "phone";
  status: "match" | "differs" | "single" | "missing";
  values: ListingValue[];
}

export interface ListingIssue {
  kind: "hours" | "address" | "phone" | "duplicate" | "rating_gap" | "services";
  severity: "high" | "medium" | "low";
  /** ≤ 60 chars, for a list row. */
  headline: string;
  /** One sentence with the specifics. */
  detail: string;
  listingIds: string[];
}

export interface ListingsCheck {
  listings: ListingRecord[];
  fields: ListingField[];
  issues: ListingIssue[];
  /** Listings that agree on everything they show. */
  consistentCount: number;
}

// ---------- Hours ----------

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type Day = (typeof DAYS)[number];
type Span = [number, number] | "closed" | "24h";
export type WeekHours = Partial<Record<Day, Span>>;

const DAY_RX = "(mon|tue|wed|thu|fri|sat|sun)[a-z]*\\.?";
const TIME_RX = "(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)?";

const toMinutes = (h: string, m: string | undefined, ap: string | undefined, fallbackPm: boolean) => {
  let hour = Number(h) % 12;
  const pm = ap ? /^p/i.test(ap) : fallbackPm;
  if (pm) hour += 12;
  return hour * 60 + (m ? Number(m) : 0);
};

/** Parse listing hour lines in the formats Google, Yelp, BBB and typical websites use. */
export function parseHours(lines: string[]): WeekHours | "24/7" | null {
  const text = lines.join("\n").replace(/[–—]/g, "-");
  if (/\b(open )?24\s*(hours|hrs)\b|24\s*\/\s*7|24-7\b/i.test(text) && !/\d{1,2}(:\d{2})?\s*(am|pm)\s*-\s*\d{1,2}(:\d{2})?\s*(am|pm)/i.test(text.replace(/12:00 am\s*-\s*12:00 am/gi, ""))) {
    return "24/7";
  }
  const week: WeekHours = {};
  const lineRx = new RegExp(`^\\s*(?:hours:?\\s*)?${DAY_RX}(?:\\s*(?:-|to|through)\\s*${DAY_RX})?\\s*[:,-]?\\s*(.*)$`, "i");
  for (const raw of text.split(/\n|;|·|\|/)) {
    const m = raw.trim().match(lineRx);
    if (!m) continue;
    const from = DAYS.indexOf(m[1].toLowerCase().slice(0, 3) as Day);
    const to = m[2] ? DAYS.indexOf(m[2].toLowerCase().slice(0, 3) as Day) : from;
    const rest = m[3].trim();
    let span: Span | null = null;
    if (/closed/i.test(rest)) span = "closed";
    else if (/24\s*hours|open 24|12:00\s*am\s*-\s*12:00\s*am/i.test(rest)) span = "24h";
    else {
      const t = rest.match(new RegExp(`${TIME_RX}\\s*(?:-|to)\\s*${TIME_RX}`, "i"));
      if (t) {
        const open = toMinutes(t[1], t[2], t[3], false);
        let close = toMinutes(t[4], t[5], t[6], true);
        if (close <= open) close += 12 * 60;
        span = [open, Math.min(close, 24 * 60)];
      }
    }
    if (!span) continue;
    for (let d = from; d <= (to >= from ? to : from); d++) week[DAYS[d]] = span;
  }
  if (Object.keys(week).length === 0) return null;
  if (DAYS.every((d) => week[d] === "24h")) return "24/7";
  return week;
}

const clock = (minutes: number) => {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h % 12 === 0 ? 12 : h % 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
};
const spanLabel = (s: Span) => (s === "closed" ? "closed" : s === "24h" ? "24 hours" : `${clock(s[0])}–${clock(s[1])}`);
const DAY_LABEL: Record<Day, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

/** "Mon–Fri 7 AM–5 PM · Sat 8 AM–12 PM · Sun closed" */
export function describeHours(hours: WeekHours | "24/7"): string {
  if (hours === "24/7") return "Open 24/7";
  const parts: string[] = [];
  let i = 0;
  while (i < DAYS.length) {
    const span = hours[DAYS[i]];
    if (span === undefined) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < DAYS.length && JSON.stringify(hours[DAYS[j + 1]]) === JSON.stringify(span)) j++;
    parts.push(`${DAY_LABEL[DAYS[i]]}${j > i ? `–${DAY_LABEL[DAYS[j]]}` : ""} ${spanLabel(span)}`);
    i = j + 1;
  }
  return parts.join(" · ");
}

/** Same hours on every day both listings state. */
function sameHours(a: WeekHours | "24/7", b: WeekHours | "24/7") {
  if (a === "24/7" || b === "24/7") return a === b;
  const shared = DAYS.filter((d) => a[d] !== undefined && b[d] !== undefined);
  return shared.length > 0 && shared.every((d) => JSON.stringify(a[d]) === JSON.stringify(b[d]));
}

/** Weekday closing time in minutes, or null (used by the after-hours signal). */
export function weekdayClose(hours: WeekHours | "24/7" | null): number | null {
  if (!hours || hours === "24/7") return null;
  const spans = (["mon", "tue", "wed", "thu", "fri"] as Day[]).map((d) => hours[d]).filter((s): s is [number, number] => Array.isArray(s));
  return spans.length ? Math.max(...spans.map((s) => s[1])) : null;
}

// ---------- Address / phone ----------

const STREET_ABBR: [RegExp, string][] = [
  [/\bstreet\b/g, "st"],
  [/\broad\b/g, "rd"],
  [/\bavenue\b/g, "ave"],
  [/\bdrive\b/g, "dr"],
  [/\bboulevard\b/g, "blvd"],
  [/\blane\b/g, "ln"],
  [/\bpike\b/g, "pike"],
];

/** "10115 Old Liberty Rd, Frederick, MD 21701" → "10115 old liberty rd" */
export function addressKey(address: string): string | null {
  let first = address.toLowerCase().split(",")[0].replace(/[.#]/g, " ").replace(/\s+/g, " ").trim();
  for (const [rx, abbr] of STREET_ABBR) first = first.replace(rx, abbr);
  const m = first.match(/^(\d+[a-z]?)\s+(.+)$/);
  if (!m) return null;
  const street = m[2].replace(/\s+(frederick|union bridge|md|maryland)\b.*$/, "").trim();
  return `${m[1]} ${street}`;
}
export const phoneKey = (phone: string) => phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
const formatPhone = (digits: string) => (digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : digits);

// ---------- Building and checking ----------

/** Listings we can always build: the Google listing and what the website shows. */
export function baseListings(details: PlaceDetails | null, website: WebsiteAnalysis | null, capturedAt: string): ListingRecord[] {
  const out: ListingRecord[] = [];
  if (details && details.provider !== "public_snapshot") {
    out.push({
      id: "google",
      directory: "google",
      label: details.provider === "mock" ? "Google (sample)" : "Google",
      url: details.googleMapsUrl,
      capturedAt,
      capturedVia: details.provider === "mock" ? "sample" : "places_api",
      name: details.name,
      address: details.address.formatted || null,
      phone: details.phone,
      hours: details.hours.length ? details.hours : null,
      rating: details.rating,
      reviewCount: details.reviewCount,
    });
  }
  if (website && (website.hours.length || website.phones.length)) {
    out.push({
      id: "website",
      directory: "website",
      label: "Your website",
      url: website.hours[0]?.evidence.url ?? website.phones[0]?.evidence.url ?? website.requestedUrl,
      capturedAt,
      capturedVia: website.reachable ? "website_scan" : "search_index",
      name: null,
      address: null,
      phone: website.phones[0]?.value ?? null,
      hours: website.hours.length ? website.hours.map((h) => h.value) : null,
      rating: null,
      reviewCount: null,
    });
  }
  return out;
}

function group<T>(listings: ListingRecord[], read: (l: ListingRecord) => T | null, same: (a: T, b: T) => boolean, show: (v: T) => string) {
  const groups: { value: T; ids: string[] }[] = [];
  for (const l of listings) {
    const value = read(l);
    if (value === null) continue;
    const g = groups.find((x) => same(x.value, value));
    if (g) g.ids.push(l.id);
    else groups.push({ value, ids: [l.id] });
  }
  return groups.sort((a, b) => b.ids.length - a.ids.length).map((g) => ({ display: show(g.value), listingIds: g.ids }));
}

const statusOf = (values: ListingValue[]): ListingField["status"] =>
  values.length === 0 ? "missing" : values.length > 1 ? "differs" : values[0].listingIds.length > 1 ? "match" : "single";

export function checkListings(listings: ListingRecord[]): ListingsCheck {
  const label = (id: string) => listings.find((l) => l.id === id)?.label ?? id;
  const names = (ids: string[]) => {
    const ls = ids.map(label);
    return ls.length <= 2 ? ls.join(" and ") : `${ls.slice(0, -1).join(", ")} and ${ls.at(-1)}`;
  };

  const hours = group(
    listings,
    (l) => (l.hours ? parseHours(l.hours) : null),
    sameHours,
    describeHours,
  );
  const address = group(
    listings,
    (l) => (l.address ? addressKey(l.address) : null),
    (a, b) => a === b,
    (key) => listings.find((l) => l.address && addressKey(l.address) === key)?.address?.split(",").slice(0, 2).join(",") ?? key,
  );
  const phone = group(
    listings,
    (l) => (l.phone ? phoneKey(l.phone) : null),
    (a, b) => a === b,
    formatPhone,
  );
  const fields: ListingField[] = [
    { field: "hours", status: statusOf(hours), values: hours },
    { field: "address", status: statusOf(address), values: address },
    { field: "phone", status: statusOf(phone), values: phone },
  ];

  const issues: ListingIssue[] = [];
  if (hours.length > 1) {
    const [a, b] = hours;
    issues.push({
      kind: "hours",
      severity: "high",
      headline: "Your hours are different on different sites",
      detail: `${names(a.listingIds)} say “${a.display}”, but ${names(b.listingIds)} say “${b.display}”.`,
      listingIds: hours.flatMap((h) => h.listingIds),
    });
  }
  if (address.length > 1) {
    issues.push({
      kind: "address",
      severity: "medium",
      headline: `${address.length} different addresses are listed`,
      detail: address.map((v) => `${v.display} (${names(v.listingIds)})`).join(" vs ") + ".",
      listingIds: address.flatMap((v) => v.listingIds),
    });
  }
  if (phone.length > 1) {
    issues.push({
      kind: "phone",
      severity: "low",
      headline: `${phone.length} different phone numbers are listed`,
      detail: phone.map((v) => `${v.display} (${names(v.listingIds)})`).join(" vs ") + ". One may be a call-tracking number.",
      listingIds: phone.flatMap((v) => v.listingIds),
    });
  }
  const byDirectory = new Map<Directory, ListingRecord[]>();
  for (const l of listings) if (l.directory !== "other") byDirectory.set(l.directory, [...(byDirectory.get(l.directory) ?? []), l]);
  for (const [directory, ls] of byDirectory) {
    if (ls.length > 1 && directory !== "website") {
      issues.push({
        kind: "duplicate",
        severity: "medium",
        headline: `${ls[0].label.replace(/\s*\(.*\)$/, "")} has ${ls.length} separate listings for you`,
        detail: `Reviews and details are split between ${ls.length} pages, and they don't show the same information.`,
        listingIds: ls.map((l) => l.id),
      });
    }
  }
  const rated = listings.filter((l) => l.rating !== null && (l.reviewCount ?? 0) >= 10);
  if (rated.length > 1) {
    const hi = rated.reduce((a, b) => (b.rating! > a.rating! ? b : a));
    const lo = rated.reduce((a, b) => (b.rating! < a.rating! ? b : a));
    if (hi.rating! - lo.rating! >= 0.8) {
      issues.push({
        kind: "rating_gap",
        severity: "medium",
        headline: `${lo.label} shows a lower rating (${lo.rating}★)`,
        detail: `${lo.label} shows ${lo.rating}★ from ${lo.reviewCount} reviews, while ${hi.label} shows ${hi.rating}★ from ${hi.reviewCount}.`,
        listingIds: [lo.id, hi.id],
      });
    }
  }
  // Yes/no service claims that contradict each other (e.g. one listing offers emergency service, another says it doesn't).
  for (const claim of Object.keys(SERVICE_LABEL) as ServiceClaim[]) {
    const yes = listings.filter((l) => l.services?.[claim] === true);
    const no = listings.filter((l) => l.services?.[claim] === false);
    if (yes.length && no.length) {
      issues.push({
        kind: "services",
        severity: claim === "emergency_service" ? "high" : "medium",
        headline: `Listings disagree on whether you offer ${SERVICE_LABEL[claim]}`,
        detail: `${names(yes.map((l) => l.id))} say${yes.length === 1 ? "s" : ""} you offer ${SERVICE_LABEL[claim]}; ${names(no.map((l) => l.id))} say${no.length === 1 ? "s" : ""} you don't.`,
        listingIds: [...yes, ...no].map((l) => l.id),
      });
    }
  }

  const order = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  // Listings outside the most common value for a field, plus duplicates, count as inconsistent.
  const flagged = new Set([
    ...[hours, address, phone].flatMap((values) => values.slice(1).flatMap((v) => v.listingIds)),
    ...issues.filter((i) => i.kind === "duplicate").flatMap((i) => i.listingIds),
    ...issues.filter((i) => i.kind === "services").flatMap((i) => i.listingIds),
  ]);
  return { listings, fields, issues, consistentCount: listings.filter((l) => !flagged.has(l.id)).length };
}
