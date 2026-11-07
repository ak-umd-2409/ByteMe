# Real business snapshots

The demo runs on a **real Maryland business**, captured from public pages so it works without API keys or network access.

| Business | Captured | File |
| --- | --- | --- |
| Dave's Cooling & Heating, Frederick MD (HVAC, est. 2006) | 2026-11-07 | `daves-cooling-heating.ts` |
| Frederick Heating & Air Conditioning, Jefferson MD (HVAC, est. 1994) | 2026-11-07 | `frederick-heating-ac.ts` |

## Rules

1. **Nothing invented.** Every value comes from a public page listed in the snapshot's `sources`, with its URL.
2. **Respect robots.txt.** The business website and Yelp block automated readers, so they were not crawled. For those, only the text a search engine shows for the page is used, marked `capturedVia: "search_index"`.
3. **Reviews are linked, not copied.** Each review keeps a link to its page, the reviewer's first name and last initial, a plain-language `summary` (always displayed as a summary, never as a quote), and **at most one short exact excerpt per source page** (≤ 15 words, in `text`).
4. **No Google data.** Google reviews and the Google Business Profile need `GOOGLE_PLACES_API_KEY`. With a key, search for the business by name to run the same workflow live.
5. **Dated.** Public listings change. Re-capture before showing a snapshot to the business, and say when it was captured.

## What the snapshots show, honestly

### Dave's Cooling & Heating

- Strong reputation: 4.7★ from 350 reviews on Birdeye, many praising same-day visits and fair prices.
- Listings disagree: BBB, Birdeye and one Yelp listing say open 24/7; a second Yelp listing and Yahoo Local say Mon–Fri 7–5, Sat 8–12. The website names a Union Bridge address; directories name Frederick. Birdeye shows a different phone number.
- Yahoo Local (Yelp reviews) shows 3.5★ from 13 reviews.
- The newest reviews we could read without Google are ~4 years old.

### Frederick Heating & Air Conditioning

- The website was readable (home, about, contact read page by page; services and promotions from search-engine text). Scripts weren't captured, so script-loaded tools can't be detected.
- All 14 reviews we could read are positive (Angi ×2 listings, BBB, Best Pros in Town, plus testimonials the business chose for its own site, labelled as such). No complaints were found, and none are shown.
- Listings disagree on services: one Angi listing says emergency service and a 10% senior discount; the other Angi listing and HomeAdvisor say no emergency service, and the second Angi listing says no senior discount, while the website advertises a senior & military discount. The business has two separate Angi listings.
- No online booking: the only call to action is a free-estimate request; no scheduling link was found on the pages read.
- Google reviews are linked from the website but not included (they need a Google Places API key).

If you are the business owner and something here is wrong, it will be corrected or removed.
