import type { PublicSnapshot } from "../../lib/business/snapshot.ts";
import type { SourceReview } from "../../lib/business/types.ts";

/**
 * Frederick Heating & Air Conditioning — Jefferson, Maryland.
 * A real, publicly listed, family-owned HVAC business (est. 1994, MD HVAC license #1623).
 *
 * Captured 2026-11-07 from the public pages in `sources`. See data/real/README.md for the rules.
 * - The business website was read page by page (home, about, contact) with a text-extraction fetch.
 *   Scripts were not captured, so tools that load by script (chat, booking widgets, analytics) can't
 *   be detected. Services and promotions pages come from search-engine text.
 * - Google reviews and the Google Business Profile need GOOGLE_PLACES_API_KEY; none are included.
 *   The website links to the Google profile ("Check out our other reviews!").
 * - Reviews: first name + last initial, link to the page, a plain-language `summary` written during
 *   extraction, and at most one short exact excerpt per source page (in `text`).
 * - Website testimonials are chosen by the business, so they are labelled as such.
 */

const CAPTURED = "2026-11-07";
const URL = {
  home: "https://www.frederickheatingandac.com/",
  about: "https://www.frederickheatingandac.com/about/",
  contact: "https://www.frederickheatingandac.com/contact",
  services: "https://www.frederickheatingandac.com/services",
  promotions: "https://www.frederickheatingandac.com/promotions",
  angi1: "https://angi.com/companylist/us/md/jefferson/frederick-heating-and-air-cond-reviews-3477884.htm",
  angi2: "https://angi.com/companylist/us/md/jefferson/frederick-heating-and-air-conditioning-reviews-10605098.htm",
  homeadvisor: "https://www.homeadvisor.com/rated.FrederickHeatingAir.77902027.html",
  bbbReviews:
    "https://prod.bbb.org/us/md/jefferson/profile/heating-and-air-conditioning/frederick-heating-air-conditioning-0011-23017607/customer-reviews",
  bestpros: "https://www.bestprosintown.com/md/jefferson/frederick-heating-and-air-conditioning-/comments/",
  googleReviewsLink:
    "https://www.google.com/search?q=frederick%20heating%20and%20air%20conditioning#lrd=0x89c9dbf85695b659:0x5e786023ddceaee3,1,,,,",
};

const WEEKDAYS_7_7 = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((d) => `${d}: 7:00 AM - 7:00 PM`);

type R = Omit<SourceReview, "source" | "authorUrl"> & { rating: number | null };
const review = (r: R): SourceReview => ({ source: "public_listing", authorUrl: null, ...r });

const reviews: SourceReview[] = [
  // Angi listing 1 (3477884) — one exact excerpt for this page.
  review({ id: "fhac-angi1-susan", platform: "Angi", url: URL.angi1, author: "Susan B.", rating: 5, publishedAt: "2018-01", relativeTime: "Jan 2018",
    text: "the tech thoroughly reviewed our equipment",
    summary: "Asked for a check-up after high winter bills; the technician reviewed the equipment and found it in good order.", themes: ["praise_quality"] }),
  review({ id: "fhac-angi1-steven", platform: "Angi", url: URL.angi1, author: "Steven B.", rating: 5, publishedAt: "2016-09", relativeTime: "Sep 2016", text: "",
    summary: "Calls them for every issue; praises their knowledge, fair prices and courtesy.", themes: ["praise_value", "praise_quality"] }),
  review({ id: "fhac-angi1-david", platform: "Angi", url: URL.angi1, author: "David B.", rating: 5, publishedAt: "2016-08", relativeTime: "Aug 2016", text: "",
    summary: "AC failed in the evening; the owner diagnosed it by phone and a technician fixed it the next morning.", themes: ["praise_responsive"] }),
  // Angi listing 2 (10605098) — one exact excerpt for this page.
  review({ id: "fhac-angi2-mohammed", platform: "Angi", url: URL.angi2, author: "Mohammed M.", rating: 5, publishedAt: "2023-04", relativeTime: "Apr 2023",
    text: "They are amazing. I cant explain how professional they are",
    summary: "Says the team is amazing and very professional.", themes: ["praise_quality"] }),
  review({ id: "fhac-angi2-chris", platform: "Angi", url: URL.angi2, author: "Chris T.", rating: 5, publishedAt: "2023-04", relativeTime: "Apr 2023", text: "",
    summary: "Price was decent compared with other companies; the job took two days.", themes: ["praise_value"] }),
  review({ id: "fhac-angi2-matthew", platform: "Angi", url: URL.angi2, author: "Matthew B.", rating: 5, publishedAt: "2023-04", relativeTime: "Apr 2023", text: "",
    summary: "Describes them as professional, polite, considerate and responsive.", themes: ["praise_friendly", "praise_responsive"] }),
  review({ id: "fhac-angi2-mariviola", platform: "Angi", url: URL.angi2, author: "Mari-Viola B.", rating: 5, publishedAt: "2023-03", relativeTime: "Mar 2023", text: "",
    summary: "Very happy with the new Amana unit they installed.", themes: ["praise_quality"] }),
  // BBB customer reviews — one exact excerpt for this page.
  review({ id: "fhac-bbb-mohammad", platform: "BBB", url: URL.bbbReviews, author: "Mohammad Mehdi M.", rating: 5, publishedAt: "2023-02-04", relativeTime: "Feb 2023",
    text: "Highly suggest contacting them if you need maintenance, repair and replacement",
    summary: "Recommends them for maintenance, repair and replacement.", themes: ["praise_quality"] }),
  review({ id: "fhac-bbb-kathleen", platform: "BBB", url: URL.bbbReviews, author: "Kathleen S.", rating: 5, publishedAt: "2022-11-29", relativeTime: "Nov 2022", text: "",
    summary: "Recommends the company 100%.", themes: ["praise_quality"] }),
  // Best Pros in Town comments (search-engine text; reviewer and date not shown).
  review({ id: "fhac-bestpros-1", platform: "Best Pros in Town", url: URL.bestpros, author: null, rating: null, publishedAt: null, relativeTime: null,
    text: "They arrived the same day I called.",
    summary: "Called about an old central air unit; they came the same day and suggested an updated system.", themes: ["praise_responsive"] }),
  // Testimonials the business chose for its own home page — one exact excerpt for this page.
  review({ id: "fhac-site-kathy", platform: "Testimonial on the business's website", url: URL.home, author: "Kathy O.", rating: null, publishedAt: null, relativeTime: null,
    text: "Technician came out right away and was very knowledgeable!",
    summary: "The technician came right away and answered all their questions.", themes: ["praise_responsive", "praise_quality"] }),
  review({ id: "fhac-site-carmen", platform: "Testimonial on the business's website", url: URL.home, author: "Carmen Q.", rating: null, publishedAt: null, relativeTime: null, text: "",
    summary: "Thanks them for a quick response and a job well done.", themes: ["praise_responsive"] }),
  review({ id: "fhac-site-lucas", platform: "Testimonial on the business's website", url: URL.home, author: "Lucas C.", rating: null, publishedAt: null, relativeTime: null, text: "",
    summary: "AC went out; says the service was excellent at an excellent cost.", themes: ["praise_value"] }),
  review({ id: "fhac-site-doug", platform: "Testimonial on the business's website", url: URL.home, author: "Doug W.", rating: null, publishedAt: null, relativeTime: null, text: "",
    summary: "Prompt attention, courteous service and a reliable replacement unit.", themes: ["praise_responsive", "praise_friendly"] }),
];

export const frederickHeatingAc: PublicSnapshot = {
  placeId: "public-frederick-heating-ac",
  capturedAt: CAPTURED,
  captureNote:
    "Real public data captured Nov 7, 2026 from the business website, two Angi listings, HomeAdvisor and BBB. Google reviews are not included (they need a Google Places API key); the website links to them.",
  details: {
    placeId: "public-frederick-heating-ac",
    name: "Frederick Heating & Air Conditioning",
    address: {
      formatted: "4801 Broad Run Rd., Jefferson, MD 21755",
      street: "4801 Broad Run Rd.",
      city: "Jefferson",
      county: "Frederick County",
      state: "Maryland",
      stateCode: "MD",
      postalCode: "21755",
      country: "US",
    },
    phone: "(240) 674-0814",
    website: URL.home,
    // Taken from the listings check (the website and Angi agree), not set here.
    hours: [],
    // No single overall rating: Angi shows 5.0 on two separate listings (4 reviews each), BBB 5/5 from 2.
    rating: null,
    reviewCount: null,
    primaryType: "hvac_contractor",
    primaryTypeLabel: "Heating & air conditioning contractor",
    types: ["hvac_contractor"],
    googleMapsUrl: null,
    businessStatus: null,
    reviews,
    provider: "public_snapshot",
  },
  listings: [
    { id: "website", directory: "website", label: "Your website", url: URL.home, capturedAt: CAPTURED, capturedVia: "page_fetch",
      name: "Frederick Heating & Air Conditioning", address: "4801 Broad Run Rd., Jefferson, MD 21755", phone: "(240) 674-0814",
      hours: [...WEEKDAYS_7_7, "Saturday: Closed", "Sunday: Closed"], rating: null, reviewCount: null,
      // Promotions page: "Seniors, age 62 and over, and members of the armed services receive a discount on all services."
      // Emergency service is not mentioned on the pages read, so it's left unknown.
      services: { senior_discount: true, free_estimates: true, emergency_service: null } },
    { id: "angi-1", directory: "angi", label: "Angi (listing 1)", url: URL.angi1, capturedAt: CAPTURED, capturedVia: "page_fetch",
      name: "Frederick Heating & Air Cond", address: "4801 Broad Run Rd, Jefferson, MD 21755", phone: null,
      hours: WEEKDAYS_7_7, rating: 5, reviewCount: 4,
      // "Yes, FREDERICK HEATING & AIR COND offers emergency services." / "offers a 10% senior discount." / "offers free project estimates."
      services: { emergency_service: true, senior_discount: true, free_estimates: true } },
    { id: "angi-2", directory: "angi", label: "Angi (listing 2)", url: URL.angi2, capturedAt: CAPTURED, capturedVia: "page_fetch",
      name: "Frederick heating and air conditioning", address: "4801 BROAD RUN RD., Jefferson, MD 21755", phone: null,
      hours: null, rating: 5, reviewCount: 4,
      // "No, … does not offer emergency services." / "No, … does not offer a senior discount." / "Yes, … offers free project estimates."
      services: { emergency_service: false, senior_discount: false, free_estimates: true } },
    { id: "homeadvisor", directory: "other", label: "HomeAdvisor", url: URL.homeadvisor, capturedAt: CAPTURED, capturedVia: "search_index",
      name: "Frederick Heating & Air Conditioning", address: null, phone: null, hours: null, rating: null, reviewCount: null,
      // "No, Frederick Heating & Air Conditioning does not offer emergency services."
      services: { emergency_service: false, free_estimates: true } },
    { id: "bbb", directory: "bbb", label: "BBB", url: URL.bbbReviews, capturedAt: CAPTURED, capturedVia: "page_fetch",
      name: "Frederick Heating & Air Conditioning", address: "4801 Broad Run Rd, Jefferson, MD 21755-8728", phone: "(240) 674-0814",
      hours: null, rating: 5, reviewCount: 2 },
  ],
  website: {
    requestedUrl: URL.home,
    reachable: true,
    problem: null,
    pages: [
      { url: URL.home, kind: "home", title: "Frederick Heating & Air Conditioning", status: "scanned" },
      { url: URL.about, kind: "about", title: "About — Frederick Heating & Air Conditioning", status: "scanned" },
      { url: URL.contact, kind: "contact", title: "Contact | Schedule Your HVAC Service Today — Frederick Heating & Air Conditioning", status: "scanned" },
      { url: URL.services, kind: "services", title: "Services", status: "scanned" },
      { url: URL.promotions, kind: "other", title: "Promotions", status: "scanned" },
    ],
    pagesScanned: 5,
    services: [
      { value: "Maintenance & repair", evidence: { url: URL.services, snippet: "Maintenance & Repair Services" }, method: "search_index" },
      { value: "Yearly maintenance contracts (2 visits, 10% off repairs)", evidence: { url: URL.services, snippet: "yearly maintenance contracts which include two visits per year" }, method: "search_index" },
      { value: "System replacement estimates", evidence: { url: URL.services, snippet: "we offer replacement estimates on all residential equipment" }, method: "search_index" },
      { value: "Oil-to-heat-pump conversions", evidence: { url: URL.about, snippet: "oil-to-heat pump conversions" }, method: "page_fetch" },
      { value: "Free second opinions", evidence: { url: URL.about, snippet: "We also offer free second opinions" }, method: "page_fetch" },
    ],
    products: [
      { value: "Goodman and Amana equipment", evidence: { url: URL.about, snippet: "the Goodman and Amana brands are the best" }, method: "page_fetch" },
    ],
    prices: [],
    hours: [
      { value: "Monday - Friday 7 AM - 7 PM", evidence: { url: URL.home, snippet: "Monday - Friday 7 AM - 7 PM" }, method: "page_fetch" },
      { value: "Saturday - Sunday Closed", evidence: { url: URL.home, snippet: "Saturday - Sunday Closed" }, method: "page_fetch" },
    ],
    phones: [{ value: "(240) 674-0814", evidence: { url: URL.home, snippet: "(240) 674-0814" }, method: "page_fetch" }],
    emails: [{ value: "frederickhvac@aol.com", evidence: { url: URL.home, snippet: "frederickhvac@aol.com" }, method: "page_fetch" }],
    // The only call to action is a free-estimate request; no booking, scheduling or calendar link was found.
    booking: { onlineBooking: false, evidence: { url: URL.home, snippet: "GET YOUR FREE ESTIMATE NOW" }, provider: null },
    contactForm: { present: true, evidence: { url: URL.about, snippet: "fill out our free estimate form" } },
    faq: { present: false, url: null, questions: [] },
    policies: { privacy: { present: false, url: null }, refund: { present: false, url: null }, terms: { present: false, url: null } },
    phoneOnlyCallsToAction: [],
    afterHoursMessages: [],
    method: "rules",
    limitations: [
      "Pages were read as text, without scripts. A booking, chat or payment tool that loads by script wouldn't show up — tell us if you use one.",
      "The estimate form's fields weren't captured; the site says “we’ll contact you as soon as possible” but gives no response time.",
    ],
  },
  detectedTech: [
    { id: "squarespace", name: "Squarespace", category: "website_builder", confidence: "verified",
      evidence: [{ url: URL.home, matched: "images.squarespace-cdn.com", kind: "html" }] },
    { id: "google_business_profile", name: "Google Business Profile", category: "marketing", confidence: "verified",
      evidence: [{ url: URL.home, matched: "“Check out our other reviews!” links to the Google profile", kind: "link" }] },
  ],
  about: [
    { label: "Founded", value: "1994", url: URL.about },
    { label: "Owner", value: "Michael T. Remsburg (family owned)", url: URL.about },
    { label: "License", value: "Maryland HVAC #1623", url: URL.angi2 },
    { label: "Fees", value: "No trip, service or diagnostic charge", url: URL.contact },
    { label: "Financing", value: "0% APR or up to 15-year terms", url: URL.home },
  ],
  sources: [
    { label: "Business website — home", url: URL.home, via: "page_fetch", usedFor: "Hours, phone, email, calls to action, links, testimonials, platform" },
    { label: "Business website — about", url: URL.about, via: "page_fetch", usedFor: "Owner, founding year, estimate form, services" },
    { label: "Business website — contact", url: URL.contact, via: "page_fetch", usedFor: "Estimate request, fee policy" },
    { label: "Business website — services & promotions", url: URL.services, via: "search_index", usedFor: "Services, senior & military discount" },
    { label: "Angi listing 1", url: URL.angi1, via: "page_fetch", usedFor: "Hours, emergency service & senior discount claims, 4 reviews" },
    { label: "Angi listing 2", url: URL.angi2, via: "page_fetch", usedFor: "Emergency service & senior discount claims, license, 4 reviews" },
    { label: "HomeAdvisor", url: URL.homeadvisor, via: "search_index", usedFor: "Emergency service claim" },
    { label: "BBB customer reviews", url: URL.bbbReviews, via: "page_fetch", usedFor: "Address, phone, 2 reviews" },
    { label: "Best Pros in Town comments", url: URL.bestpros, via: "search_index", usedFor: "1 review excerpt" },
    { label: "Google reviews (linked from website)", url: URL.googleReviewsLink, via: "search_index", usedFor: "Not read — needs a Google Places API key" },
  ],
};
