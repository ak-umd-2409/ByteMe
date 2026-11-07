import type { PublicSnapshot } from "../../lib/business/snapshot.ts";
import type { SourceReview } from "../../lib/business/types.ts";

/**
 * Dave's Cooling & Heating (Dave's Mechanical Services, LLC) — Frederick, Maryland.
 * A real, publicly listed, family-owned HVAC business (est. 2006).
 *
 * Captured 2026-11-07 from the public pages in `sources`. See data/real/README.md for the rules.
 * - The business website (ravefordaves.com) blocks automated readers in robots.txt, so it was NOT
 *   crawled. Website facts come only from text a search engine shows for its pages.
 * - Yelp also blocks automated readers; Yelp facts come from search-result text only.
 * - Google reviews need the Places API (GOOGLE_PLACES_API_KEY); none are included here.
 * - Reviews: first name + last initial, link to the page, a plain-language `summary` written during
 *   extraction, and at most one short exact excerpt per source page (in `text`).
 */

const CAPTURED = "2026-11-07";
const URL = {
  bbb: "https://www.bbb.org/us/md/frederick/profile/heating-and-air-conditioning/daves-cooling-heating-0011-20015193",
  birdeye1: "https://reviews.birdeye.com/daves-cooling-heating-148890689891292",
  birdeye2: "https://reviews.birdeye.com/daves-cooling-heating-148890689891292?page=2",
  birdeye3: "https://reviews.birdeye.com/daves-cooling-heating-148890689891292?page=3",
  birdeye4: "https://reviews.birdeye.com/daves-cooling-heating-148890689891292?page=4",
  yelp1: "https://www.yelp.com/biz/daves-cooling-and-heating-frederick",
  yelp2: "https://www.yelp.com/biz/daves-cooling-and-heating-frederick-2",
  yahoo: "https://local.yahoo.com/info-238677608-dave%E2%80%99s-mechanical-service-frederick/",
  websiteFurnace: "https://ravefordaves.com/frederick-county-furnace-installation-daves-cooling-and-heating/",
  website: "https://ravefordaves.com/",
  linkedin: "https://www.linkedin.com/company/dave's-mechanical-services-llc",
};

const ALL_WEEK_24 = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type R = Omit<SourceReview, "source" | "authorUrl" | "publishedAt" | "rating"> & { rating?: number | null };
const review = (r: R): SourceReview => ({ source: "public_listing", authorUrl: null, publishedAt: null, rating: null, ...r });

const reviews: SourceReview[] = [
  // Birdeye, page 1 — reviews with visible business replies (platform not shown on the page).
  review({ id: "daves-be1-jamie", platform: "Birdeye", url: URL.birdeye1, author: "Jamie M.", relativeTime: "4 years ago", ownerReplied: true,
    text: "outstanding customer service from scheduling to completion",
    summary: "Says the company has always given great service, from booking the visit to finishing the job.", themes: ["praise_quality"] }),
  review({ id: "daves-be1-jeffrey", platform: "Birdeye", url: URL.birdeye1, author: "Jeffrey D.", relativeTime: "5 years ago", ownerReplied: true, text: "",
    summary: "Had a great experience and recommends hiring them.", themes: ["praise_quality"] }),
  review({ id: "daves-be1-stephen", platform: "Birdeye", url: URL.birdeye1, author: "Stephen C.", relativeTime: "5 years ago", ownerReplied: true, text: "",
    summary: "Praises one of the service technicians by name.", themes: ["praise_quality"] }),
  // Birdeye, page 1 — Facebook recommendations.
  review({ id: "daves-be1-pat", platform: "Facebook (via Birdeye)", url: URL.birdeye1, author: "Pat M.", relativeTime: "7 years ago", text: "",
    summary: "Called in the afternoon and had the AC repaired the same day; the technician was friendly and careful.", themes: ["praise_responsive", "praise_friendly"] }),
  review({ id: "daves-be1-mary", platform: "Facebook (via Birdeye)", url: URL.birdeye1, author: "Mary H.", relativeTime: "7 years ago", text: "",
    summary: "The technician was polite, tidy and pleasant.", themes: ["praise_friendly"] }),
  review({ id: "daves-be1-ellen", platform: "Facebook (via Birdeye)", url: URL.birdeye1, author: "Ellen K.", relativeTime: "7 years ago", text: "",
    summary: "Long-time customer; a leak was fixed and options were explained without pressure.", themes: ["praise_quality", "praise_value"] }),
  review({ id: "daves-be1-jeffd", platform: "Facebook (via Birdeye)", url: URL.birdeye1, author: "Jeff D.", relativeTime: "7 years ago", text: "",
    summary: "Replaced the furnace and AC, included a free spring check-up; prices felt reasonable.", themes: ["praise_value"] }),
  review({ id: "daves-be1-michael", platform: "Facebook (via Birdeye)", url: URL.birdeye1, author: "Michael B.", relativeTime: "7 years ago", text: "",
    summary: "Uses them for regular spring tune-ups; staff are knowledgeable and professional.", themes: ["praise_quality"] }),
  review({ id: "daves-be1-niki", platform: "Facebook (via Birdeye)", url: URL.birdeye1, author: "Niki F.", relativeTime: "7 years ago", text: "",
    summary: "Prompt visit, clear explanations, friendly technician.", themes: ["praise_responsive", "praise_friendly"] }),
  review({ id: "daves-be1-andrew", platform: "Facebook (via Birdeye)", url: URL.birdeye1, author: "Andrew W.", relativeTime: "7 years ago", text: "",
    summary: "Heat pump check-ups with written quotes and no upselling.", themes: ["praise_value"] }),
  review({ id: "daves-be1-debbie", platform: "Facebook (via Birdeye)", url: URL.birdeye1, author: "Debbie B.", relativeTime: "7 years ago", text: "",
    summary: "Heat went out after a snowstorm; they came promptly and fixed it on the spot.", themes: ["praise_responsive"] }),
  // Birdeye, page 2.
  review({ id: "daves-be2-stephanie", platform: "Facebook (via Birdeye)", url: URL.birdeye2, author: "Stephanie M.", relativeTime: "7 years ago",
    text: "thoughtful, courteous and knowledgeable",
    summary: "Very happy with the technician and plans to call again.", themes: ["praise_friendly", "praise_quality"] }),
  review({ id: "daves-be2-kimberly", platform: "Facebook (via Birdeye)", url: URL.birdeye2, author: "Kimberly C.", relativeTime: "7 years ago", text: "",
    summary: "Had a complete system installed and says the house is more comfortable than ever.", themes: ["praise_quality"] }),
  // Birdeye, page 3.
  review({ id: "daves-be3-steve", platform: "Birdeye", url: URL.birdeye3, author: "Steve D.", relativeTime: "8 years ago",
    text: "great price and expert service",
    summary: "Happy with the price and installation of a new high-efficiency system.", themes: ["praise_value", "praise_quality"] }),
  // Birdeye, page 4 — older Facebook reviews, including the only price complaint found.
  review({ id: "daves-be4-kelly", platform: "Facebook (via Birdeye)", url: URL.birdeye4, author: "Kelly E.", relativeTime: "11 years ago",
    text: "They charged us $360 to replace a $30 pressure switch",
    summary: "Felt overcharged across several visits for a well-pump problem, including a part that wasn't the cause.", themes: ["price_concerns"] }),
  review({ id: "daves-be4-brenda", platform: "Facebook (via Birdeye)", url: URL.birdeye4, author: "Brenda S.", relativeTime: "11 years ago", text: "",
    summary: "Booking call went smoothly, the technician arrived on time and suggested options.", themes: ["praise_responsive", "praise_quality"] }),
  review({ id: "daves-be4-teak", platform: "Facebook (via Birdeye)", url: URL.birdeye4, author: "Teak B.", relativeTime: "11 years ago", text: "",
    summary: "Technicians walked through the problem, the fix and the cost.", themes: ["praise_quality"] }),
  review({ id: "daves-be4-pam", platform: "Facebook (via Birdeye)", url: URL.birdeye4, author: "Pam T.", relativeTime: "11 years ago", text: "",
    summary: "Requested service at night and had a technician the next morning.", themes: ["praise_responsive"] }),
  review({ id: "daves-be4-dawn", platform: "Facebook (via Birdeye)", url: URL.birdeye4, author: "Dawn R.", relativeTime: "11 years ago", text: "",
    summary: "Quick response, on-time arrival and patient explanations.", themes: ["praise_responsive"] }),
  review({ id: "daves-be4-bryant", platform: "Facebook (via Birdeye)", url: URL.birdeye4, author: "Bryant S.", relativeTime: "11 years ago", text: "",
    summary: "Friendly office, the technician called ahead and was on time, fair price.", themes: ["praise_friendly", "praise_responsive", "praise_value"] }),
  review({ id: "daves-be4-aristurtin", platform: "Facebook (via Birdeye)", url: URL.birdeye4, author: "Aristurtin T.", relativeTime: "12 years ago", text: "",
    summary: "Technician arrived on time and fixed the heating.", themes: ["praise_responsive"] }),
  review({ id: "daves-be4-jessica", platform: "Facebook (via Birdeye)", url: URL.birdeye4, author: "Jessica J.", relativeTime: "12 years ago", text: "",
    summary: "AC failed overnight and was fixed by early the next morning.", themes: ["praise_responsive"] }),
  // Yahoo Local (shows Yelp reviews) — search-result text only.
  review({ id: "daves-yahoo-1", platform: "Yelp (via Yahoo Local)", url: URL.yahoo, author: null, relativeTime: null,
    text: "same-day service - quick, reasonably priced, and with great customer service",
    summary: "Used them twice; both visits were same-day.", themes: ["praise_responsive", "praise_value"] }),
];

export const davesCoolingHeating: PublicSnapshot = {
  placeId: "public-daves-cooling-heating",
  capturedAt: CAPTURED,
  captureNote:
    "Real public data captured Nov 7, 2026 from BBB, Birdeye, Yelp and Yahoo Local listings and search-engine text for the business website. Google reviews are not included (they need a Google Places API key).",
  details: {
    placeId: "public-daves-cooling-heating",
    name: "Dave's Cooling & Heating",
    address: {
      formatted: "10115 Old Liberty Rd, Frederick, MD 21701",
      street: "10115 Old Liberty Rd",
      city: "Frederick",
      county: "Frederick County",
      state: "Maryland",
      stateCode: "MD",
      postalCode: "21701",
      country: "US",
    },
    phone: "(301) 401-2780",
    website: URL.website,
    // Listings disagree on hours, so no single value is taken as fact. See the listings check.
    hours: [],
    rating: 4.7,
    reviewCount: 350,
    primaryType: "hvac_contractor",
    primaryTypeLabel: "Heating & air conditioning contractor",
    types: ["hvac_contractor", "plumber"],
    googleMapsUrl: null,
    businessStatus: null,
    reviews,
    provider: "public_snapshot",
  },
  listings: [
    { id: "bbb", directory: "bbb", label: "BBB", url: URL.bbb, capturedAt: CAPTURED, capturedVia: "page_fetch",
      name: "Dave's Cooling & Heating", address: "10115 Old Liberty Rd, Frederick, MD 21701-2637", phone: "(301) 401-2780",
      hours: ALL_WEEK_24.map((d) => `${d}: 12:00 AM - 12:00 AM`), rating: null, reviewCount: null },
    { id: "yelp-1", directory: "yelp", label: "Yelp (listing 1)", url: URL.yelp1, capturedAt: CAPTURED, capturedVia: "search_index",
      name: "Dave's Cooling & Heating", address: "10115 Old Liberty Rd, Frederick, MD 21701", phone: "(301) 401-2780",
      hours: ALL_WEEK_24.map((d) => `${d}: Open 24 hours`), rating: null, reviewCount: null },
    { id: "yelp-2", directory: "yelp", label: "Yelp (listing 2)", url: URL.yelp2, capturedAt: CAPTURED, capturedVia: "search_index",
      name: "Dave's Cooling & Heating", address: "10115 Old Liberty Rd, Frederick, MD 21703", phone: "(301) 401-2780",
      hours: ["Mon: 7:00 AM - 5:00 PM", "Tue: 7:00 AM - 5:00 PM", "Wed: 7:00 AM - 5:00 PM", "Thu: 7:00 AM - 5:00 PM", "Fri: 7:00 AM - 5:00 PM", "Sat: 8:00 AM - 12:00 PM"],
      rating: null, reviewCount: 13 },
    { id: "yahoo", directory: "yahoo", label: "Yahoo Local", url: URL.yahoo, capturedAt: CAPTURED, capturedVia: "search_index",
      name: "Dave's Cooling & Heating", address: "10115 Old Liberty Rd, Frederick, MD 21701", phone: "(301) 401-2780",
      hours: ["Mon 7:00 AM - 5:00 PM", "Tue 7:00 AM - 5:00 PM", "Wed 7:00 AM - 5:00 PM", "Thu 7:00 AM - 5:00 PM", "Fri 7:00 AM - 5:00 PM", "Sat 8:00 AM - 12:00 PM", "Sun Closed"],
      rating: 3.5, reviewCount: 13 },
    { id: "birdeye", directory: "birdeye", label: "Birdeye", url: URL.birdeye4, capturedAt: CAPTURED, capturedVia: "search_index",
      name: "Dave's Cooling & Heating", address: "10115 Old Liberty Rd, Frederick, MD 21701", phone: "(301) 900-8593",
      hours: ["Open 24/7"], rating: 4.7, reviewCount: 350 },
    { id: "website", directory: "website", label: "Your website", url: URL.websiteFurnace, capturedAt: CAPTURED, capturedVia: "search_index",
      name: "Dave's Cooling & Heating", address: "9022 Walnut Street, Union Bridge, MD 21791", phone: null,
      hours: ["Technicians working 24-7"], rating: null, reviewCount: null },
  ],
  website: {
    requestedUrl: URL.website,
    reachable: false,
    problem: "This website asks automated tools not to read it, so we didn't scan it. What's below is what search engines show for its pages.",
    pages: [{ url: URL.website, kind: "home", title: null, status: "blocked_by_robots" }],
    pagesScanned: 0,
    services: [
      { value: "Furnace installation", evidence: { url: URL.websiteFurnace, snippet: "Frederick County Furnace Installation" }, method: "search_index" },
      { value: "Financing", evidence: { url: URL.websiteFurnace, snippet: "Financing" }, method: "search_index" },
    ],
    products: [{ value: "Lennox, Mitsubishi and Navien equipment", evidence: { url: URL.websiteFurnace, snippet: "furnaces made by Lennox, Mitsubishi or Navien" }, method: "search_index" }],
    prices: [],
    hours: [{ value: "Technicians working 24-7", evidence: { url: URL.websiteFurnace, snippet: "technicians are always working 24-7" }, method: "search_index" }],
    phones: [],
    emails: [],
    booking: { onlineBooking: false, evidence: { url: URL.websiteFurnace, snippet: "Request Service" }, provider: null },
    contactForm: { present: false, evidence: null },
    faq: { present: false, url: null, questions: [] },
    policies: { privacy: { present: false, url: null }, refund: { present: false, url: null }, terms: { present: false, url: null } },
    phoneOnlyCallsToAction: [],
    afterHoursMessages: [],
    method: "rules",
    limitations: [
      "The website blocks automated readers (robots.txt), so it wasn't scanned. We can't tell whether “Request Service” books a time or just sends a message.",
      "Tools that run on the website (booking, chat, payments) can't be detected without a scan. Tell us what you use.",
    ],
  },
  detectedTech: [
    { id: "birdeye", name: "Birdeye", category: "marketing", confidence: "verified",
      evidence: [{ url: URL.birdeye4, matched: "Profile claimed by the business owner or representative", kind: "listing" }] },
  ],
  about: [
    { label: "Founded", value: "2006", url: URL.bbb },
    { label: "Legal name", value: "Dave's Mechanical Services, LLC", url: URL.bbb },
    { label: "BBB rating", value: "A+ (not accredited)", url: URL.bbb },
    { label: "Equipment", value: "Lennox, Mitsubishi, Navien", url: URL.websiteFurnace },
  ],
  sources: [
    { label: "BBB business profile", url: URL.bbb, via: "page_fetch", usedFor: "Name, address, phone, hours, founding year, BBB rating" },
    { label: "Birdeye reviews (pages 1–4)", url: URL.birdeye1, via: "page_fetch", usedFor: "Rating (4.7 from 350), reviews, owner replies" },
    { label: "Yelp listing 1", url: URL.yelp1, via: "search_index", usedFor: "Hours, address, phone" },
    { label: "Yelp listing 2", url: URL.yelp2, via: "search_index", usedFor: "Hours, address, phone, review count" },
    { label: "Yahoo Local (Yelp reviews)", url: URL.yahoo, via: "search_index", usedFor: "Hours, rating (3.5 from 13), one review" },
    { label: "Business website (furnace page)", url: URL.websiteFurnace, via: "search_index", usedFor: "Address, 24-7 claim, services, financing" },
    { label: "LinkedIn company page", url: URL.linkedin, via: "search_index", usedFor: "Website address, founding year" },
  ],
};
