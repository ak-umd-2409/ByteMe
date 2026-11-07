import { extractAssetUrls } from "./html.ts";
import type { DetectedTech, IndustryKey, TechCategory, TechnologyReport } from "./types.ts";
import type { RawPage } from "./website.ts";

/**
 * Deterministic technology detection from public pages.
 *
 * Only product-specific signatures count (vendor domains, generator tags,
 * vendor headers). Generic words never count: "square feet" is not Square.
 * Tools that can't be seen from outside are returned in `askOwnerAbout`
 * instead of being guessed.
 */
interface Signature {
  id: string;
  /** Catalog naming, shared with Part 4's `currentTools`. */
  name: string;
  category: TechCategory;
  urls?: RegExp[];
  html?: RegExp[];
  headers?: [string, RegExp][];
}

export const SIGNATURES: Signature[] = [
  { id: "square", name: "Square", category: "pos_payments", urls: [/(^|\/\/|\.)squareup\.com\//i, /squarecdn\.com/i, /\.square\.site\b/i] },
  { id: "toast", name: "Toast", category: "restaurant", urls: [/(^|\/\/|\.)toasttab\.com/i] },
  { id: "clover", name: "Clover", category: "pos_payments", urls: [/(^|\/\/|\.)clover\.com\/(online-ordering|pay|online)/i] },
  { id: "shopify", name: "Shopify", category: "ecommerce", urls: [/cdn\.shopify\.com/i, /\.myshopify\.com/i], html: [/Shopify\.theme\s*=/] },
  {
    id: "wix",
    name: "Wix",
    category: "website_builder",
    urls: [/static\.wixstatic\.com/i, /\.parastorage\.com/i],
    html: [/<meta[^>]+name=["']generator["'][^>]+content=["'][^"']*Wix\.com/i],
    headers: [["x-wix-request-id", /.+/]],
  },
  {
    id: "squarespace",
    name: "Squarespace",
    category: "website_builder",
    urls: [/static1\.squarespace\.com/i, /squarespace-cdn\.com/i],
    html: [/<meta[^>]+name=["']generator["'][^>]+content=["'][^"']*Squarespace/i],
  },
  {
    id: "wordpress",
    name: "WordPress",
    category: "website_builder",
    urls: [/\/wp-content\//i, /\/wp-includes\//i],
    html: [/<meta[^>]+name=["']generator["'][^>]+content=["']WordPress/i],
  },
  { id: "godaddy_builder", name: "GoDaddy Website Builder", category: "website_builder", urls: [/img1\.wsimg\.com/i], html: [/content=["']Go ?Daddy Website Builder/i] },
  {
    id: "quickbooks",
    name: "QuickBooks",
    category: "accounting",
    urls: [/quickbooks\.intuit\.com/i, /connect\.intuit\.com/i, /app\.qbo\.intuit\.com/i, /payments\.intuit\.com/i],
  },
  { id: "calendly", name: "Calendly", category: "booking", urls: [/(^|\/\/|\.)calendly\.com/i] },
  { id: "acuity", name: "Acuity Scheduling", category: "booking", urls: [/acuityscheduling\.com/i] },
  { id: "google_calendar_booking", name: "Google Calendar", category: "booking", urls: [/calendar\.google\.com\/calendar\/appointments/i, /calendar\.app\.google/i] },
  { id: "jobber", name: "Jobber", category: "field_service", urls: [/getjobber\.com/i] },
  { id: "housecall_pro", name: "Housecall Pro", category: "field_service", urls: [/housecallpro\.com/i] },
  { id: "servicetitan", name: "ServiceTitan", category: "field_service", urls: [/servicetitan\.com/i] },
  { id: "opentable", name: "OpenTable", category: "restaurant", urls: [/opentable\.com/i] },
  { id: "resy", name: "Resy", category: "restaurant", urls: [/(^|\/\/|\.)resy\.com/i] },
  { id: "mailchimp", name: "Mailchimp", category: "marketing", urls: [/list-manage\.com/i, /chimpstatic\.com/i] },
  { id: "meta_pixel", name: "Meta Pixel", category: "marketing", urls: [/connect\.facebook\.net\/.+\/fbevents\.js/i] },
  { id: "google_analytics", name: "Google Analytics", category: "analytics", urls: [/googletagmanager\.com\/gtag/i, /google-analytics\.com/i] },
  { id: "google_forms", name: "Google Forms", category: "google", urls: [/docs\.google\.com\/forms/i, /forms\.gle\//i] },
];

/** Commonly used tools that a public website usually can't reveal. */
const ASK_BY_INDUSTRY: Partial<Record<IndustryKey, string[]>> = {
  hvac: ["Jobber", "Housecall Pro", "ServiceTitan"],
  plumbing: ["Jobber", "Housecall Pro", "ServiceTitan"],
  electrical: ["Jobber", "Housecall Pro"],
  landscaping: ["Jobber"],
  cleaning: ["Jobber"],
  restaurant: ["Toast", "Square", "Clover"],
  cafe: ["Square", "Toast", "Clover"],
  salon: ["Square", "Vagaro", "Booksy"],
  retail: ["Square", "Shopify", "Clover"],
};
const ALWAYS_ASK = ["QuickBooks", "Google Calendar", "Gmail or Outlook", "Excel or Google Sheets", "Square"];

export function detectTechnology(
  pages: RawPage[],
  opts: { onGoogleMaps?: boolean; industry?: IndustryKey } = {},
): TechnologyReport {
  const found = new Map<string, DetectedTech>();
  const add = (sig: Signature, evidence: DetectedTech["evidence"][number]) => {
    const entry = found.get(sig.id) ?? { id: sig.id, name: sig.name, category: sig.category, evidence: [], confidence: "verified" as const };
    if (entry.evidence.length < 3 && !entry.evidence.some((e) => e.matched === evidence.matched)) entry.evidence.push(evidence);
    found.set(sig.id, entry);
  };

  for (const page of pages) {
    const assets = extractAssetUrls(page.html);
    for (const sig of SIGNATURES) {
      for (const asset of assets) {
        if (sig.urls?.some((pattern) => pattern.test(asset.url)))
          add(sig, { url: page.url, matched: asset.url.slice(0, 160), kind: asset.kind });
      }
      for (const pattern of sig.html ?? []) {
        const match = page.html.match(pattern);
        if (match) add(sig, { url: page.url, matched: match[0].slice(0, 160), kind: "html" });
      }
      for (const [header, pattern] of sig.headers ?? []) {
        const value = page.headers[header];
        if (value && pattern.test(value)) add(sig, { url: page.url, matched: `${header} header`, kind: "header" });
      }
    }
  }
  if (opts.onGoogleMaps) {
    found.set("google_business_profile", {
      id: "google_business_profile",
      name: "Google Business Profile",
      category: "google",
      evidence: [{ url: "https://www.google.com/maps", matched: "Business listing found on Google Maps", kind: "places" }],
      confidence: "verified",
    });
  }
  const detected = [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
  const detectedNames = new Set(detected.map((d) => d.name));
  const askOwnerAbout = [...new Set([...(ASK_BY_INDUSTRY[opts.industry ?? "other"] ?? []), ...ALWAYS_ASK])].filter(
    (name) => !detectedNames.has(name),
  );
  const limitations = [
    "We only list tools with a product-specific fingerprint on the public website. Back-office tools (accounting, phone systems, calendars) are usually invisible from outside, so please confirm them.",
  ];
  if (pages.length === 0) limitations.push("No website pages were available, so nothing could be detected from a website.");
  return { detected, askOwnerAbout, limitations };
}
