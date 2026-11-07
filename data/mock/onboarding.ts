import type { PlaceDetails } from "../../lib/business/types.ts";

/**
 * SAMPLE DATA — fictional businesses for local development and the demo when
 * no GOOGLE_PLACES_API_KEY is set. Names, reviews and websites are invented.
 * "Mike's Heating & Cooling" matches the Part 4 demo persona.
 *
 * Websites use the reserved `.example` TLD and are served from `mockWebsites`
 * below, never fetched from the internet.
 */

const hours = (open: string, close: string, weekend = "Closed") => [
  `Monday: ${open} – ${close}`,
  `Tuesday: ${open} – ${close}`,
  `Wednesday: ${open} – ${close}`,
  `Thursday: ${open} – ${close}`,
  `Friday: ${open} – ${close}`,
  `Saturday: ${weekend}`,
  `Sunday: Closed`,
];

export const mockPlaces: PlaceDetails[] = [
  {
    placeId: "mock-mikes-heating",
    name: "Mike's Heating & Cooling",
    address: {
      formatted: "118 Market St, Frederick, MD 21701, USA",
      street: "118 Market St",
      city: "Frederick",
      county: "Frederick County",
      state: "Maryland",
      stateCode: "MD",
      postalCode: "21701",
      country: "US",
    },
    phone: "(301) 555-0142",
    website: "https://mikes-heating.example",
    hours: hours("7:00 AM", "5:00 PM"),
    rating: 4.3,
    reviewCount: 87,
    primaryType: "hvac_contractor",
    primaryTypeLabel: "HVAC contractor",
    types: ["hvac_contractor", "plumber", "point_of_interest", "establishment"],
    googleMapsUrl: null,
    businessStatus: "OPERATIONAL",
    provider: "mock",
    reviews: [
      {
        id: "mock-mikes-r1", source: "mock", rating: 2, author: "Sample reviewer A", authorUrl: null,
        publishedAt: "2026-10-12T14:00:00Z", relativeTime: "3 weeks ago",
        text: "Our furnace died on a Friday evening. I called three times and it went straight to voicemail. Nobody called me back until Monday, so we hired someone else.",
      },
      {
        id: "mock-mikes-r2", source: "mock", rating: 5, author: "Sample reviewer B", authorUrl: null,
        publishedAt: "2026-09-30T14:00:00Z", relativeTime: "a month ago",
        text: "Mike and his tech were friendly and did excellent work on our AC. Fair price and very professional.",
      },
      {
        id: "mock-mikes-r3", source: "mock", rating: 3, author: "Sample reviewer C", authorUrl: null,
        publishedAt: "2026-09-02T14:00:00Z", relativeTime: "2 months ago",
        text: "Good repair once they showed up, but it took over a week to get the written estimate for the new heat pump.",
      },
      {
        id: "mock-mikes-r4", source: "mock", rating: 2, author: "Sample reviewer D", authorUrl: null,
        publishedAt: "2026-08-15T14:00:00Z", relativeTime: "3 months ago",
        text: "Left a message about a leaking unit and never heard back. Had to call again two days later.",
      },
      {
        id: "mock-mikes-r5", source: "mock", rating: 5, author: "Sample reviewer E", authorUrl: null,
        publishedAt: "2026-07-20T14:00:00Z", relativeTime: "4 months ago",
        text: "Quick, honest and knowledgeable. They explained everything and the price was reasonable.",
      },
    ],
  },
  {
    placeId: "mock-glow-studio",
    name: "Glow Hair Studio",
    address: {
      formatted: "42 West St, Annapolis, MD 21401, USA",
      street: "42 West St",
      city: "Annapolis",
      county: "Anne Arundel County",
      state: "Maryland",
      stateCode: "MD",
      postalCode: "21401",
      country: "US",
    },
    phone: "(410) 555-0177",
    website: "https://glow-studio.example",
    hours: hours("10:00 AM", "7:00 PM", "9:00 AM – 4:00 PM"),
    rating: 4.6,
    reviewCount: 152,
    primaryType: "hair_salon",
    primaryTypeLabel: "Hair salon",
    types: ["hair_salon", "beauty_salon", "point_of_interest", "establishment"],
    googleMapsUrl: null,
    businessStatus: "OPERATIONAL",
    provider: "mock",
    reviews: [
      {
        id: "mock-glow-r1", source: "mock", rating: 4, author: "Sample reviewer F", authorUrl: null,
        publishedAt: "2026-10-28T14:00:00Z", relativeTime: "a week ago",
        text: "Love my cut! Only complaint is it's hard to book an appointment. I had to call three times during my lunch break.",
      },
      {
        id: "mock-glow-r2", source: "mock", rating: 5, author: "Sample reviewer G", authorUrl: null,
        publishedAt: "2026-10-01T14:00:00Z", relativeTime: "a month ago",
        text: "Friendly stylists, great color work, and a really welcoming space.",
      },
      {
        id: "mock-glow-r3", source: "mock", rating: 3, author: "Sample reviewer H", authorUrl: null,
        publishedAt: "2026-09-10T14:00:00Z", relativeTime: "2 months ago",
        text: "Wish they had online booking. The phone is always busy and I waited 25 minutes past my appointment time.",
      },
    ],
  },
  {
    placeId: "mock-bean-there",
    name: "Bean There Café",
    address: {
      formatted: "905 S Charles St, Baltimore, MD 21230, USA",
      street: "905 S Charles St",
      city: "Baltimore",
      county: "Baltimore City",
      state: "Maryland",
      stateCode: "MD",
      postalCode: "21230",
      country: "US",
    },
    phone: "(443) 555-0109",
    website: "https://bean-there.example",
    hours: hours("6:30 AM", "3:00 PM", "7:30 AM – 3:00 PM"),
    rating: 4.5,
    reviewCount: 311,
    primaryType: "coffee_shop",
    primaryTypeLabel: "Coffee shop",
    types: ["coffee_shop", "cafe", "food", "point_of_interest", "establishment"],
    googleMapsUrl: null,
    businessStatus: "OPERATIONAL",
    provider: "mock",
    reviews: [
      {
        id: "mock-bean-r1", source: "mock", rating: 5, author: "Sample reviewer I", authorUrl: null,
        publishedAt: "2026-10-30T14:00:00Z", relativeTime: "a week ago",
        text: "Best cortado in Federal Hill. Friendly baristas and great value.",
      },
      {
        id: "mock-bean-r2", source: "mock", rating: 2, author: "Sample reviewer J", authorUrl: null,
        publishedAt: "2026-10-05T14:00:00Z", relativeTime: "a month ago",
        text: "Ordered catering for our office and nobody responded to my email for four days.",
      },
    ],
  },
  {
    placeId: "mock-garrett-farm",
    name: "Garrett Valley Farm Market",
    address: {
      formatted: "2210 Bittinger Rd, Oakland, MD 21550, USA",
      street: "2210 Bittinger Rd",
      city: "Oakland",
      county: "Garrett County",
      state: "Maryland",
      stateCode: "MD",
      postalCode: "21550",
      country: "US",
    },
    phone: "(301) 555-0190",
    website: null,
    hours: hours("9:00 AM", "5:00 PM", "9:00 AM – 2:00 PM"),
    rating: 4.8,
    reviewCount: 64,
    primaryType: "farm",
    primaryTypeLabel: "Farm",
    types: ["farm", "store", "point_of_interest", "establishment"],
    googleMapsUrl: null,
    businessStatus: "OPERATIONAL",
    provider: "mock",
    reviews: [
      {
        id: "mock-farm-r1", source: "mock", rating: 5, author: "Sample reviewer K", authorUrl: null,
        publishedAt: "2026-10-18T14:00:00Z", relativeTime: "3 weeks ago",
        text: "Excellent produce and the friendliest family. Worth the drive.",
      },
      {
        id: "mock-farm-r2", source: "mock", rating: 4, author: "Sample reviewer L", authorUrl: null,
        publishedAt: "2026-09-21T14:00:00Z", relativeTime: "a month ago",
        text: "Great apples. I emailed to ask about a bulk order and didn't hear back, so I just drove over.",
      },
    ],
  },
];

/** Fictional website HTML, keyed by origin. */
export const mockWebsites: Record<string, Record<string, string>> = {
  "https://mikes-heating.example": {
    "/": `<!doctype html><html><head><title>Mike's Heating & Cooling | Frederick, MD HVAC</title>
<script src="https://www.googletagmanager.com/gtag/js?id=G-SAMPLE"></script></head>
<body><nav><a href="/services">Services</a> <a href="/contact">Contact</a> <a href="/faq">FAQ</a> <a href="/privacy-policy">Privacy Policy</a></nav>
<h1>Heating & cooling you can count on</h1>
<p>Furnace repair, AC installation, heat pumps and maintenance plans for Frederick County.</p>
<p>Hours: Mon–Fri 7am–6pm</p>
<p>Call to schedule: (301) 555-0142</p>
<p>Pay your invoice online: <a href="https://squareup.com/pay-invoice/sample">Pay with Square</a></p>
</body></html>`,
    "/services": `<html><head><title>Services | Mike's Heating & Cooling</title></head><body>
<h1>Our services</h1><ul><li>Furnace repair</li><li>AC installation</li><li>Heat pump installation</li><li>Seasonal maintenance plans</li><li>Duct cleaning</li></ul>
<p>Diagnostic visit: $89. Maintenance plan from $15/month.</p>
<p>Call for a free estimate.</p></body></html>`,
    "/contact": `<html><head><title>Contact | Mike's Heating & Cooling</title></head><body>
<h1>Contact us</h1><p>Phone: (301) 555-0142</p><p>Email: office@mikes-heating.example</p>
<p>Leave a message after hours and we'll call you back the next business day.</p></body></html>`,
    "/faq": `<html><head><title>FAQ</title></head><body><h1>Frequently asked questions</h1>
<h3>Do you offer emergency service?</h3><p>We handle emergencies during business hours.</p>
<h3>Do you offer financing?</h3><p>Yes, ask us about financing for new systems.</p></body></html>`,
    "/privacy-policy": `<html><head><title>Privacy Policy</title></head><body><h1>Privacy Policy</h1><p>We only use your contact details to provide service.</p></body></html>`,
    "/robots.txt": "User-agent: *\nDisallow: /admin\n",
  },
  "https://glow-studio.example": {
    "/": `<!doctype html><html><head><title>Glow Hair Studio — Annapolis</title>
<link rel="stylesheet" href="https://static.wixstatic.com/sample.css"><meta name="generator" content="Wix.com Website Builder"></head>
<body><h1>Glow Hair Studio</h1><p>Cuts, color, balayage and blowouts.</p>
<p>Women's cut $65 · Color from $95 · Blowout $45</p>
<p>To book, call us at (410) 555-0177 or DM us on Instagram.</p>
<p>Tue–Fri 10am–7pm, Sat 9am–4pm</p>
<a href="/policies">Cancellation &amp; refund policy</a></body></html>`,
    "/policies": `<html><head><title>Policies</title></head><body><h1>Cancellation &amp; refund policy</h1><p>Please give 24 hours notice for cancellations.</p></body></html>`,
  },
  "https://bean-there.example": {
    "/": `<!doctype html><html><head><title>Bean There Café</title>
<script src="https://cdn.shopify.com/s/files/sample.js"></script></head>
<body><h1>Bean There Café</h1><p>Espresso, pastries and office catering in Federal Hill.</p>
<a href="https://www.toasttab.com/bean-there-sample/v3">Order online</a>
<form action="/contact" method="post"><label>Email <input type="email" name="email"></label><textarea name="message"></textarea><button>Send</button></form>
<a href="/privacy">Privacy</a></body></html>`,
    "/privacy": `<html><head><title>Privacy</title></head><body><h1>Privacy policy</h1><p>We collect order details to fulfil orders.</p></body></html>`,
  },
};
