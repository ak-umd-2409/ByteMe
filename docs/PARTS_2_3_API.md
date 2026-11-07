# Parts 2 & 3 API: Business Onboarding and Problem Discovery

Backend for **Part 2 (Business Onboarding & Business Intelligence)** and **Part 3 (Problem Discovery & Financial Impact)**.
It feeds **Part 4 (Recommendations, `POST /api/recommend`)** without any change to Part 4 code.

```
search ─► details ─► analyze ─► (owner reviews draft) ─► confirm ─► discover ─► /api/recommend (Part 4)
                                                                        │
                                                       owner edits a number ─► impact
```

- [Run it](#run-it)
- [Rules this backend follows](#rules-this-backend-follows)
- [Endpoints](#endpoints)
- [Part 4 integration contract](#part-4-integration-contract)
- [How problems are found, scored and ranked](#how-problems-are-found-scored-and-ranked)
- [How money is estimated](#how-money-is-estimated)
- [Mock mode vs live mode](#mock-mode-vs-live-mode)
- [Code map](#code-map)

All example responses below were produced by running the real handlers in mock mode (no keys), trimmed for length.

## Run it

```bash
npm install
cp .env.example .env.local   # optional — every key is optional
npm run dev                  # http://localhost:3000
npm test                     # all lib/**/*.test.ts (72 tests)
npm run typecheck
```

With no keys set, everything works on four fictional Maryland businesses
(`mock-mikes-heating`, `mock-glow-studio`, `mock-bean-there`, `mock-garrett-farm`).
Responses say so: `"sampleData": true`, `mode.places: "mock"`, and a warning string.

## Rules this backend follows

| Rule | How it's enforced |
| --- | --- |
| Never invent evidence | Every *verified* signal links to an exact review quote (`reference.reviewId`), a page URL, or a profile field. LLM quotes are dropped unless they appear verbatim in the source review or page (`isVerbatim`). |
| Not enough evidence → hypothesis | A problem with no verified signal is `status: "hypothesis"`, confidence ≤ 0.3, `needsOwnerConfirmation: true`, ranked last, left out of money totals and out of Part 4 until the owner confirms it. |
| LLM never makes money figures | All arithmetic is in `lib/problems/impact.ts`. LLM rewording is rejected if it contains any number not already in the facts (`introducesNewNumbers`). |
| Don't fake tool detection | Tools are reported only when a product-specific signature is found (script domain, link domain, generator tag, header). Tools that can't be seen from outside go in `askOwnerAbout`. |
| Works without an LLM | LLM is optional everywhere. If it's off, malformed, invalid or over budget, the rules-based result is returned unchanged. |
| Owner is the final word | Every profile field is a `Fact` with `source`, `confidence` and `evidence`. Corrections become `source: "owner"`. |

## Endpoints

All errors share one shape:

```json
{ "error": { "code": "invalid_request", "message": "Some fields are missing or invalid.", "details": ["placeId: has an invalid format"] } }
```

| Code | Status | When |
| --- | --- | --- |
| `invalid_json` | 400 | Body is not JSON |
| `invalid_request` | 400 | Schema validation failed (unknown fields are rejected); `details` lists paths |
| `invalid_assumptions` | 400 | An impact override is out of range |
| `not_found` | 404 | Unknown `placeId` |
| `too_large` | 413 | Body over 200 KB |
| `not_estimated` | 422 | Problem type has no money model (e.g. review management) |
| `rate_limited` | 429 | Too many requests; see `retry-after` header |
| `places_unavailable` | 502 | Google Places failed; the app keeps working with manual entry |
| `internal_error` | 500 | Unexpected; logged server-side |

Rate limits (per client IP, in-memory, per server process):
lookup endpoints 30/min · analyze & discover 8/min · confirm & impact 120/min.

---

### `GET /api/business/search?q=&near=`

Find candidate businesses. `q` 2–120 chars, `near` optional (town or ZIP).

```json
{
  "query": "mike's heating",
  "matches": [
    { "placeId": "mock-mikes-heating", "name": "Mike's Heating & Cooling",
      "address": "118 Market St, Frederick, MD 21701, USA", "category": "HVAC contractor",
      "rating": 4.3, "reviewCount": 87, "provider": "mock" }
  ],
  "mode": { "places": "mock", "llm": "off" },
  "sampleData": true
}
```

No match → `200` with `"matches": []`. The UI should offer manual entry.

### `GET /api/business/details?placeId=`

Raw public listing (`PlaceDetails`). Usually you can skip this and call `analyze` directly.

### `POST /api/onboarding/analyze`

Builds the draft profile: listing + website scan + review themes + tech detection. Takes 1–8 s live (website fetches); show progress.

```json
{
  "placeId": "mock-mikes-heating",
  "websiteUrl": "https://override.example",        // optional, otherwise from listing
  "pastedReviews": "★★☆☆☆ Nobody picks up...\n\n...", // optional, up to 30 reviews, blank-line separated
  "manual": { "name": "...", "category": "...", "address": { "city": "Laurel", "stateCode": "MD" } }, // when no placeId
  "owner": { "monthlyBudget": 200, "techComfort": "self_serve", "goals": ["more_customers"] }
}
```

Either `placeId` or `manual.name` is required.

`owner` fields (all optional): `teamSize`, `monthlyBudget` (0–100000), `goals` (`more_customers | save_time | better_reviews | get_paid_faster`),
`techComfort` (`self_serve | needs_help`), `constraints` (`no_recording | no_contract | spanish_required | offline_required`),
`currentTools` (names), `handlesHealthData`, `handlesLargeCustomerList`, `hasOutboundCallConsent`, `biggestTimeSink` (free text), `reportedProblems` (problem keys).

Response `{ profile, reviews, website, technology, warnings, mode }`. Key parts:

```json
{
  "profile": {
    "business": {
      "name":     { "value": "Mike's Heating & Cooling", "source": "mock_places", "confidence": "high", "evidence": "Sample Google listing (mock)", "editable": true },
      "industry": { "value": "hvac", "source": "mock_places", "confidence": "high", "evidence": "Google category: HVAC contractor", "editable": true },
      "hours":    { "value": ["Monday: 7:00 AM – 5:00 PM", "..."], "source": "mock_places", "confidence": "high", "evidence": "...", "editable": true }
    },
    "owner": { "monthlyBudget": { "value": 200, "source": "owner", "...": "..." } },
    "missingForRecommendations": []
  },
  "reviews": {
    "complaints": [{
      "key": "no_callback", "label": "No call back", "polarity": "complaint", "mentions": 2,
      "evidence": [{ "reviewId": "mock-mikes-r1", "quote": "Nobody called me back until Monday, so we hired someone else.", "source": "mock", "rating": 2, "author": "Sample reviewer A" }],
      "detectedBy": ["rules"]
    }],
    "praise": [], "method": "rules", "limitations": ["..."]
  },
  "website": {
    "booking": { "onlineBooking": false, "evidence": null, "provider": null },
    "phoneOnlyCallsToAction": [{ "value": "Call to schedule", "evidence": { "url": "https://mikes-heating.example/", "snippet": "Call to schedule: (301) 555-0142" }, "method": "pattern" }],
    "prices": [{ "value": { "amount": 89, "text": "$89" }, "evidence": { "url": "https://mikes-heating.example/services", "snippet": "Diagnostic visit: $89. ..." }, "method": "pattern" }]
  },
  "technology": {
    "detected": [{ "id": "square", "name": "Square", "category": "pos_payments", "confidence": "verified",
                   "evidence": [{ "url": "https://mikes-heating.example/", "matched": "https://squareup.com/pay-invoice/sample", "kind": "link" }] }],
    "askOwnerAbout": ["Jobber", "Housecall Pro", "ServiceTitan", "QuickBooks", "Google Calendar", "Gmail or Outlook", "Excel or Google Sheets"]
  },
  "warnings": ["Mock mode: this is a fictional sample business, not live Google data."],
  "mode": { "places": "mock", "llm": "off" }
}
```

`Fact.source` values: `google_places | mock_places | website | tech_signature | review_analysis | owner | default | derived`.
`missingForRecommendations` lists what Part 4 still needs (budget, state, name; tech comfort is optional; if unknown, Part 4 gets `needsHelp: false` and `assumed` says so).

Website scanning: home page plus up to `WEBSITE_MAX_PAGES - 1` same-origin pages (booking, contact, services, pricing, FAQ, policies first).
It respects robots.txt, refuses private/loopback/metadata addresses on every redirect, caps size at 1.5 MB per page, and times out.
An unreachable site comes back as `reachable: false` with a plain-English `problem` and a warning, not an error.

### `POST /api/onboarding/confirm`

The owner reviews the draft, fixes what's wrong, and confirms it.

```json
{
  "profile": { "...": "profile from analyze, unchanged" },
  "corrections": {
    "business": { "phone": "(301) 555-0142", "hours": ["Mon–Fri 7am–6pm"] },
    "owner": { "monthlyBudget": 250, "techComfort": "needs_help", "constraints": ["no_recording"] },
    "currentTools": ["Square", "QuickBooks"]
  },
  "confirm": true
}
```

```json
{
  "profile": { "business": { "phone": { "value": "(301) 555-0142", "source": "owner", "confidence": "high", "evidence": "You corrected this", "editable": true } },
               "confirmedAt": "2026-11-07T12:00:00.000Z" },
  "readyForRecommendations": true
}
```

The server is stateless: the client holds the profile and sends it back. The profile is fully re-validated each time.

### `POST /api/problems/discover`

```json
{
  "profile": { "...": "confirmed profile" },
  "reviews": { "...": "reviews from analyze" },
  "website": { "...": "website from analyze, or null" },
  "assumptions": { "missed_inquiries": { "missed_per_week": 8, "average_job_value": 300 } },
  "includeHypotheses": ["no_customer_follow_up"],
  "polish": true
}
```

`assumptions` = the owner's numbers, per problem key. `includeHypotheses` = hypotheses the owner said "yes, this happens", which sends them on to Part 4.
`polish` (default true) lets the LLM reword explanations when it's on; numbers can't change.

Response `{ discovery, recommendationInput }`. One problem card (trimmed):

```json
{
  "id": "problem-missed_inquiries",
  "key": "missed_inquiries",
  "title": "Customer calls and messages go unanswered",
  "explanation": "Some people who contact Mike's Heating & Cooling don't reach anyone and don't get a call back, so they may hire someone else.",
  "category": { "key": "customer_communication", "label": "Customer communication" },
  "useCase": "missed-calls",
  "status": "confirmed",
  "confidence": { "level": "high", "score": 0.95, "reason": "Based on 3 customer reviews, 1 website finding." },
  "evidence": [
    { "id": "sig-1", "source": "sample_review", "observation": "A customer review mentions: no call back.",
      "quote": "Nobody called me back until Monday, so we hired someone else.",
      "reference": { "reviewId": "mock-mikes-r1" }, "weight": 0.6, "verified": true }
  ],
  "signalCount": 5,
  "verifiedSignalCount": 4,
  "independentSources": ["sample_review", "website"],
  "impact": {
    "kind": "revenue_opportunity",
    "label": "Estimated opportunity — not proven lost revenue",
    "inputs": [
      { "key": "weekly_inquiries", "label": "Customer calls, messages and requests per week", "value": 40, "unit": "per_week", "source": "default", "min": 0, "max": 5000, "note": "Starting assumption — replace it with your own number." },
      { "key": "missed_share", "label": "Share of them that go unanswered", "value": 0.15, "unit": "percent", "source": "default", "low": 0.08, "high": 0.25 },
      { "key": "conversion_rate", "label": "Share of missed customers who would have hired you", "value": 0.25, "unit": "percent", "source": "default", "low": 0.15, "high": 0.35 },
      { "key": "average_job_value", "label": "Average job or order value", "value": 300, "unit": "usd", "source": "default" },
      { "key": "missed_per_week", "label": "Missed inquiries per week", "value": 6, "unit": "per_week", "source": "derived" }
    ],
    "assumptions": ["A month has 4.33 weeks on average.", "Customers who don't reach you hire someone else instead of trying again.", "..."],
    "formula": "missed inquiries per week × share who would have hired you × average job value × 4.33 weeks",
    "calculation": "6 missed inquiries/week × 25% would have hired you × $300 average job × 4.33 weeks = $1,949/month",
    "monthly": { "expected": 1949, "low": 624, "high": 4547 },
    "confidence": "low",
    "ownerInputShare": 0
  },
  "rank": {
    "position": 1, "score": 95.99,
    "breakdown": { "evidence": 30, "confidence": 23.75, "impact": 22.24, "relevance": 20 },
    "explanation": ["Evidence: 4 direct signals → 30/30", "Confidence: high → 23.75/25", "Estimated impact: $1,949/month → 22.24/25", "Relevance: common for hvac businesses, matches your goals → 20/20"]
  },
  "needsOwnerConfirmation": false,
  "explanationSource": "template"
}
```

A hypothesis:

```json
{ "key": "no_customer_follow_up", "title": "Past customers aren't followed up", "status": "hypothesis",
  "confidence": { "level": "low", "score": 0.1, "reason": "Not confirmed: based only on 1 industry pattern. Tell us if this applies to you." },
  "needsOwnerConfirmation": true,
  "evidence": [{ "source": "industry_pattern", "observation": "This is common for hvac businesses, but we haven't seen direct evidence of it for you yet.", "verified": false }] }
```

Summary (confirmed + likely only, one problem per use case so overlapping problems aren't double-counted):

```json
{ "confirmed": 2, "likely": 3, "hypotheses": 2,
  "estimatedMonthlyOpportunity": { "expected": 4287, "low": 1014, "high": 10393 },
  "estimatedMonthlyTimeValue": { "expected": 325, "low": 65, "high": 909 } }
```

Plus `limitations[]` and a `disclaimer` string. **Show the disclaimer next to any total.**

### `POST /api/problems/impact`

Recalculate one estimate when the owner edits a number. Pure, fast, no LLM.

```json
{ "problemKey": "missed_inquiries", "industry": "hvac",
  "overrides": { "missed_per_week": 8, "conversion_rate": 0.25, "average_job_value": 300 } }
```

```json
{ "problemKey": "missed_inquiries",
  "impact": { "calculation": "8 missed inquiries/week × 25% would have hired you × $300 average job × 4.33 weeks = $2,598/month",
              "monthly": { "expected": 2598, "low": 2598, "high": 2598 }, "confidence": "high", "ownerInputShare": 1, "...": "..." } }
```

Out of range → `400 invalid_assumptions` with `"details": ["conversion_rate: must be between 0 and 1"]`.
Use each input's `min`/`max` to constrain the form. Percent values are 0–1.

## Part 4 integration contract

`discover` returns `recommendationInput`. When `ok`, `recommendationInput.request` is exactly the body `POST /api/recommend` expects
(`lib/recommend/types.ts`: `{ business: BusinessProfile, problems: Problem[] }`). No Part 4 code was changed.

```json
{
  "ok": true,
  "request": {
    "business": { "name": "Mike's Heating & Cooling", "industry": "HVAC", "state": "MD", "county": "Frederick",
                  "monthlyBudget": 200, "currentTools": ["Google Business Profile", "Square"], "needsHelp": false,
                  "handlesHealthData": false, "handlesLargeCustomerList": false, "hasOutboundCallConsent": false, "dealBreakers": [] },
    "problems": [
      { "id": "problem-missed_inquiries", "useCase": "missed-calls", "title": "Customer calls and messages go unanswered",
        "evidence": "“Nobody called me back until Monday, so we hired someone else.” (sample review); ... (website)" },
      { "id": "problem-no_online_booking", "useCase": "booking", "title": "Customers can't book online", "evidence": "..." },
      { "id": "problem-slow_quotes", "useCase": "quotes", "title": "Quotes and estimates take too long", "evidence": "..." }
    ]
  },
  "omitted": [
    { "key": "slow_responses", "reason": "Covered by the higher-ranked “missed_inquiries” recommendation (same kind of tool)." },
    { "key": "inconsistent_business_info", "reason": "No AI tool category fits; this is a quick manual fix." },
    { "key": "no_customer_follow_up", "reason": "Not confirmed yet — confirm it to get recommendations." }
  ],
  "assumed": []
}
```

When required inputs are missing: `{ "ok": false, "missing": ["owner.monthlyBudget"] }`. Ask the owner, call `confirm`, then `discover` again.

Mapping rules (`lib/problems/toRecommendation.ts`):

| Part 3 | Part 4 |
| --- | --- |
| problems, ranked | `problems[]` in rank order, **one per `useCase`** (Part 4 shows one option set per problem), max 8 |
| `missed_inquiries`, `slow_responses` | `missed-calls` |
| `no_online_booking`, `scheduling_inefficiency` | `booking` |
| `slow_quotes` | `quotes` |
| `poor_review_management` | `reviews` |
| `no_customer_follow_up` | `marketing` |
| `repetitive_admin` | `bookkeeping` |
| `inconsistent_business_info` | not sent (no tool fits) |
| hypotheses | not sent unless listed in `includeHypotheses` |
| `evidence[]` | `evidence` string, quotes first, ≤ 500 chars |
| `address.stateCode` / `county` | `state` / `county` (" County" stripped) |
| `techComfort === "needs_help"` | `needsHelp: true` (if unknown: `false`, noted in `assumed`) |
| `constraints` | `dealBreakers`: `no_recording`→`no-recording`, `no_contract`→`no-contract`, `spanish_required`→`spanish`, `offline_required`→`offline` |
| detected + owner tools | `currentTools` (integration-relevant only, catalog names) |
| `handlesHealthData` | owner answer, else industry default (true for health-type industries, marked `derived`), else false |

The contract is covered by tests that build the request from real discovery output and run Aditya's `recommend()` on it (`lib/problems/problems.test.ts`).

## How problems are found, scored and ranked

1. **Signals** (`lib/problems/signals.ts`): each signal is one observation pointing at one problem, with a weight from 0 to 1.
   - Review themes → problems (e.g. `missed_calls` → `missed_inquiries` 0.6). Verified, with the quote.
   - Website: no booking found, "call to schedule", after-hours "we'll call you back", no contact form, hours or phone different from Google. Verified, with URL and snippet.
   - Google listing: closes before evening in an after-hours industry, or a low rating. **Not verified**, because these are inferences.
   - Owner answers: problems they ticked (0.9), "what eats your week" text (0.7), tools they confirmed they don't use.
   - Industry pattern (0.2, **never verified**), only where nothing else covers that problem.
2. **Status**: `confirmed` = at least 2 verified signals from at least 2 kinds of source, or at least 3 review mentions. `likely` = at least 1 verified signal. `hypothesis` = no verified signal.
3. **Confidence** = 1 − ∏(1 − weight) over verified signals ("noisy OR"), capped at 0.95. Hypotheses are capped at 0.3.
4. **Rank score (0–100)** = evidence (30, by verified signal count) + confidence (25 × score) + impact (25, log-scaled to $5,000/mo) + relevance (20: typical for the industry, matches owner goals).
   Hypotheses always rank after evidence-backed problems. `rank.explanation` lists each part in plain English for the UI.

## How money is estimated

`lib/problems/impact.ts`. Every estimate shows its inputs, each labelled `owner`, `default` or `derived`, plus its assumptions, formula and the actual arithmetic.

| Model | Formula (per month) | Kind |
| --- | --- | --- |
| `missed_inquiries` | missed/week × hire rate × job value × 4.33 | opportunity |
| `slow_responses` | slow replies/week × extra loss rate × job value × 4.33 | opportunity |
| `no_online_booking` | inquiries/week × share preferring online × extra conversion × job value × 4.33 | opportunity |
| `follow_up` | past customers/month × return-rate lift × job value | opportunity |
| `time_cost_*` (quotes, scheduling, admin) | hours/week saved × value of an hour × 4.33 | time value |

- Defaults per industry live in `lib/business/industry.ts`. They are **placeholders to replace with the owner's own numbers, not research figures**. The UI should say "starting assumption".
- The low/high range only varies rates (shares and percentages). Volumes and prices stay as entered.
- Confidence comes from the owner's share of the inputs: ≥ 75% high, ≥ 34% medium, otherwise low.
- Labels are always "Estimated opportunity — not proven lost revenue" or "Estimated value of time — not money already lost".

## Mock mode vs live mode

| | No keys (mock) | `GOOGLE_PLACES_API_KEY` | `OPENROUTER_API_KEY` |
| --- | --- | --- | --- |
| Search/details | 4 fictional businesses | Google Places (New), text search + details | — |
| Reviews | sample reviews | up to 5 Google reviews (Google's limit) + pasted | LLM classifies; quotes verified |
| Website | `*.example` sample sites served in-process | real sites, SSRF-safe | LLM extracts; evidence must be on a page |
| Explanations | templates | templates | LLM rewording, numbers locked |

**Not yet verified:** the Google Places and OpenRouter code paths are tested against recorded-shape fake responses, not live APIs, because no keys were available while building. Before the demo, set the keys locally and run a real search → analyze.

Google limits to know: the Places API returns at most 5 reviews and no owner replies, so "owner doesn't reply to reviews" can't be detected from Google. We only cache Places content for 10–30 minutes.

## Code map

```
lib/shared/      config, logger (redacts), cache, validate (schemas), rateLimit, safeFetch (SSRF + robots)
lib/llm/         optional OpenRouter client: JSON-only, schema-validated, budgeted, cached
lib/business/    Part 2: places, reviews, website, html, techDetect, industry, profile, onboarding
lib/problems/    Part 3: catalog, signals, discover (status/confidence/rank), impact, toRecommendation (Part 4 adapter)
lib/api/         schemas (request validation), handlers (framework-free), next (rate limit, JSON, errors)
app/api/         thin Next.js routes
data/mock/onboarding.ts   fictional businesses + websites for mock mode
```

## Real businesses, listings and UI-ready fields (v2)

**Real public snapshots** (`data/real/`, `lib/business/snapshot.ts`). With no Google key, search returns two real Maryland HVAC businesses captured from public pages on 2026-11-07: Dave's Cooling & Heating (Frederick) and Frederick Heating & Air Conditioning (Jefferson). Every fact has a source URL and capture method (`page_fetch` or `search_index`). Reviews keep a link, the reviewer's first name and last initial, at most one short exact excerpt per source page, and otherwise a summary that is always labelled as one. Nothing is invented: no complaints were found for Frederick Heating, so none appear. Responses carry `mode.places: "public_snapshot"` and `analysis.snapshot = { capturedAt, note, sources[], about[] }`. Show the sources.

**Listings check** (`analysis.listings`, `lib/business/listings.ts`). This compares the business across its website and directories: hours, address, phone, duplicate listings, rating gaps, and yes/no **service claims** (emergency service, senior discount, free estimates). It is deterministic, and every issue names the listings that disagree. A listing that says nothing is never counted as disagreeing. Pass it back to `discover` as `listings`. Mismatches become `inconsistent_business_info` evidence with links to each listing.

**New fields on each problem card**
- `display`: `headline`, `whyItMatters` (one line), `nextStep` (one line), `effort` (`free` or `tool` plus a label), and `evidenceStrength` (level 1–3, a label, and counts by source). For listing problems, `whyItMatters` and `nextStep` are built from the mismatches actually found (for example, "Show the same services on every listing, then merge duplicate listings").
- `counterEvidence`: reviews that argue *against* the problem (for example, "6 reviews say you respond quickly" next to "calls go unanswered"), with up to 3 linked examples. Unconfirmed problems that customers contradict rank last.
- `impact.terms`: the estimate as ordered equation terms, each with `short`, `value`, `unit`, `source` (`owner`/`default`/`derived`/`constant`), a plain-language `question` to ask the owner, and `min`/`max`. Editing a term = sending it as an override to `/api/problems/impact`.

**`discovery.overview`**: `headline` ("We found 1 free fix and 1 problem a tool could help with"), counts (`quickWins`, `needTool`, `toCheck`), `topProblemKey`, and `strengths` (most-praised review themes with counts).

The Part 4 contract is unchanged. Both real businesses produce a valid `/api/recommend` request (`lib/business/realSnapshots.test.ts`).

## Spec checklist status (Parts 2 & 3)

| # | Feature | Where |
| --- | --- | --- |
| 2.1 | Business lookup | `/api/business/search`, `/api/business/details` (Google Places, or real public snapshots with no key) |
| 2.2 | Review scan | `analysis.reviews` |
| 2.3 | Paste more reviews | `analyze` → `pastedReviews`; "Paste more reviews" on the home page |
| 2.4 | Website scan | `analysis.website` |
| 2.5 | Tools you use | `analysis.technology` (pre-checks the home page tool toggles) |
| 2.6 | Policy scan | `website.policies.{privacy,refund,terms}.facts`: each fact quotes the exact sentence (`lib/business/policies.ts`) |
| 2.7 | Data sensitivity | `profile.dataSensitivity` (level + reasons) |
| 2.8 | Rules that apply to you | `analysis.rules`, updated in `discover.rules` (`lib/rules/maryland.ts`, rules as data with sources, checked 2026-11-07, not legal advice) |
| 2.9 | Location context | `analysis.location`: county, rural (Maryland's 18 rural counties), Maryland SBDC region and contact |
| 2.10 | Languages nearby | `analysis.location.languages` (Census QuickFacts; Frederick County loaded, other counties say "not available yet") |
| 2.11 | Internet check | `analysis.location.internet` (county broadband share from Census; favors phone-friendly tools in rural or low-broadband areas) |
| — | Questions we still ask | `confirm` with `owner` corrections: team size, goals, deal-breakers, "what eats your week", 35,000+ customers |
| 3.1–3.2 | Evidence cards, ranked | `discover.discovery.problems` |
| 3.3 | Pays for itself in X days | `POST /api/problems/payback` `{ industry, items: [{ problemKey, monthlyCost }], assumptions? }` → `results[]` with `days`, `label`, `math` |
| 3.4 | Problems you didn't know about | Listings check (hours, address, phone, services, duplicates) |
| 3.5 | Add a problem | "Anything else?" → `confirm` with `owner.reportedProblems` (recorded as owner-reported, never as found evidence) |
