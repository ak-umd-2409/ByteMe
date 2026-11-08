# The owner journey: API contract

**For:** the frontend teammate.
**Status:** backend, plus a page at **`/start`** built from the approved wireframes v1 (`docs/specs/b-wireframes.md`, screens 1–4). The home page (`/`) and the existing endpoints are unchanged.

The goal is that an owner types their business name, answers a few relevant questions, and leaves understanding what is holding the business back and how MainStreet AI helps. They should never feel they are filling in a questionnaire.

```
1 Find            GET  /api/business/search?q=…                (unchanged)
2 Understand      POST /api/journey/start   { placeId }        → what we learned + a few questions
3 Confirm         (render the questions; every one can be skipped)
4 Opportunities   POST /api/journey/answer  { context, answers } → top 2–3 problems, follow-ups
5 Solutions       POST /api/recommend       result.recommendation.request   (Part 4, unchanged)
```

The typed client is in `lib/client/parts23.ts` as `journey.start`, `journey.answer` and `journey.visible`.

---

## 1. What changed, and why

### The current journey (live at byte-me-mu.vercel.app, walked through as a first-time owner)

| Step | What the owner sees or is asked |
|---|---|
| Find | Search box, a "paste reviews" box, sample chips |
| Profile | Budget slider, tool toggles, setup preference |
| Context panels | Where you are, Free local help (SBDC), Languages nearby, Internet (broadband), Your policies |
| Rules panel | 5 laws (call recording, AI calls, MODPA, grocery pricing, HIPAA) |
| "A bit about you" | Team size, "Keep data on 35,000+ customers?", 4 goals, 4 deal-breakers, "What eats most of your week?", "Anything else?" |
| Problems | 6 cards for a typical business (4 of them unverified guesses), each with a rank breakdown, evidence strength, counter-evidence, a dollar calculator and a first step |
| Recommendations | Tabs per problem |

That is about **11 inputs and 9 information panels before the first recommendation**.

### What was unnecessary

| Item | Problem | Now |
|---|---|---|
| Team size | Nothing in problem discovery or recommendation uses it | Not asked |
| Goals (4 chips) | Only nudges the ranking | Kept as one optional "What matters most? (up to 2)" question, because it's on the approved screen 2. It breaks ties between problems |
| "35,000+ customers?" | A privacy-law threshold almost no small business meets | Not asked (assumed no, as before) |
| Outbound-call consent | Only relevant to outbound calling tools, which are already filtered out by default | Not asked |
| 4 deal-breakers up front | Call recording matters only when a phone tool is possible; the rest are rare | Recording is asked only when relevant; the rest sit in one optional question |
| Broadband, languages, SBDC, location | Context, not decisions | Not in the journey (still at `/api/onboarding/analyze` if wanted) |
| Policy excerpts, rules panel | Legal detail an owner can't act on | A rule is shown only inside the question it affects (for example the Maryland recording law under the call-recording question) |
| Dollar figures from industry defaults | Every estimate had 0% owner input. For example "$1,949/mo from missed calls" for a business whose reviews say they respond quickly | **No dollar figure until the owner gives the numbers it rests on** |
| 4 unverified "problems" shown as cards | Reads as a diagnosis when it's a guess | One "Do any of these happen?" question; unanswered ones are listed as "not checked" |
| Overlapping cards | "Can't book online" and "scheduling takes too long" are the same kind of problem | Folded into one opportunity (`alsoCovers`) |
| Rank weights, evidence-strength levels, confidence | Internal | Not exposed |
| A "5★" rating computed from 14 testimonials | Looks like a published rating but isn't | A rating is shown only when Google or a review site publishes it |

### Information prioritisation (what each item is for)

| Information | Essential? | Finds a problem? | Shapes a solution? | Owner sees it? |
|---|---|---|---|---|
| Name, address, phone, website, hours | ✓ | hours/phone conflicts | — | ✓ business card |
| Reviews (themes, quotes) | ✓ | ✓ | — | ✓ one sentence + evidence |
| Website scan (booking, contact form) | ✓ | ✓ | — | ✓ one sentence + evidence |
| Listings check | ✓ | ✓ | — | ✓ one sentence + evidence |
| Detected tools | ✓ | — | ✓ integrations | ✓ one sentence, pre-ticked |
| Budget, setup help | ✓ | — | ✓ | asked |
| Problems public info can't see | ✓ | ✓ | ✓ | asked (one multi-select) |
| Call recording OK? | when a phone tool is possible | — | ✓ | asked, conditionally |
| Health data | health businesses only | — | ✓ (HIPAA) | asked, conditionally |
| Job value, weekly volume, hours | only for estimates | — | — | optional follow-ups |
| Deal-breakers, "anything else" | no | sometimes | sometimes | optional |
| What matters most (goals) | no | ranking only | — | asked, up to 2 |
| Team size, 35k customers | no | — | — | not asked |
| Location, broadband, languages, SBDC, policies, rules list | no | — | rarely | internal / optional elsewhere |

---

## 2. `POST /api/journey/start`

Request:

```json
{ "placeId": "public-frederick-heating-ac", "pastedReviews": "optional, ≤ 20,000 chars" }
```

`placeId` comes from `/api/business/search`. This call uses the **analyze** rate limit (8/min), because it can scan a website.

Response (real output, trimmed):

```json
{
  "context": "j1.…",                                   // opaque; send it back with /answer
  "business": {
    "name": "Frederick Heating & Air Conditioning",
    "subtitle": "HVAC · Jefferson, MD",
    "address": "4801 Broad Run Rd., Jefferson, MD 21755",
    "phone": "(240) 674-0814",
    "website": "https://www.frederickheatingandac.com/",
    "hours": "Mon–Fri 7 AM–7 PM · Sat–Sun closed",      // null when listings disagree and the owner hasn't said
    "rating": null                                      // only a published rating, never our average
  },
  "learned": [
    { "id": "reviews", "kind": "reviews",
      "text": "We read 14 reviews and testimonials (Angi, BBB and Best Pros in Town). Customers mostly praise the quality of the work and quick responses. The newest one we found is from Apr 2023.",
      "sources": [{ "label": "Angi", "url": "https://angi.com/…" }] },
    { "id": "website", "kind": "website",
      "text": "Your website (frederickheatingandac.com) has no online booking; customers reach you by phone or the contact form.",
      "sources": [{ "label": "Your website", "url": "https://www.frederickheatingandac.com/" }] },
    { "id": "listings", "kind": "listings", "text": "We compared your details on 5 sites: 3 things don't match.", "sources": [ … ] },
    { "id": "tools", "kind": "tools", "text": "We spotted Squarespace and Google Business Profile in use.", "sources": [ … ] }
  ],
  "headline": "We found 2 things worth a look in public information. 4 quick questions will sharpen this. You can skip any of them.",
  "questions": [ …see below… ],
  "customersSay": {                                     // screen 3 "What customers say"
    "reviewCount": 23,
    "themes": [{ "key": "price_concerns", "label": "Price concerns", "polarity": "complaint", "countLabel": "from 1 of 23 reviews",
                 "example": { "text": "They charged us $360 to replace a $30 pressure switch", "isQuote": true, "who": "Kelly E.", "where": "Facebook (via Birdeye)", "url": "https://…" } },
               { "key": "praise_quality", "label": "Quality work", "polarity": "praise", "countLabel": "from 10 of 23 reviews", "example": null }],
    "note": null
  },
  "toolsFound": [{ "name": "Squarespace", "url": "https://www.frederickheatingandac.com/" }],
  "sources": { "count": 10, "list": [{ "label": "…", "url": "…" }] },
  "mode": { "places": "public_snapshot", "sampleData": false, "capturedAt": "2026-11-07" }
}
```

`business.facts` is the "Is this right?" list: `{ id, label, value, source, editable }`. `source` is "From Google", "Your website", "Public listings" or "You told us". `value: null` means "We couldn't find this". Disputed hours are left out of the list, because the `listing.hours` question settles them.

**Not listed?** Send `{ "manual": { "name": "Corner Bakery", "town": "Frederick", "website": "https://…" } }` instead of `placeId`. Maryland only for now.

### Questions

Every question has the same shape:

```ts
{
  id: string;
  kind: "single" | "multi" | "number" | "text";
  text: string;                 // the question
  why: string;                  // one line under it: why we ask
  options?: { value, label, hint? }[];
  default: Answer;              // pre-filled (e.g. tools we already saw) or null
  ifSkipped: string;            // what we'll assume; show on "Skip"
  optional: boolean;            // true → fine behind "More preferences"
  maxSelect?: number;           // multi: most options allowed (goals: 2)
  showIf?: { questionId, includesAny: string[] };   // use journey.visible(q, answers)
  unit?, min?, max?, placeholder?;                  // number questions
  affects: ("problems" | "recommendations" | "estimate" | "next_step")[];
  source?: { label, url };      // when the "why" rests on a law or a finding
}
```

Which questions appear depends on the business. The full set:

| id | When | Answer |
|---|---|---|
| `problems` | Problems public info can't see (max 4, one per kind, none already evidenced). Options can carry a `hint` with counter-evidence, e.g. "6 reviews say you respond quickly" | `string[]` of problem keys, or `["none"]` |
| `listing.hours` / `listing.phone` / `listing.address` | Only when listings disagree (one field at most). Option hints say which sites show each value | `"v0"`, `"v1"`, … or `"other"` |
| `call_recording` | Maryland business where a phone tool is possible. Has `showIf` when it depends on the owner ticking missed calls | `"ok"` or `"no"` |
| `tools` | When a relevant tool might connect to something we couldn't detect. `default` pre-ticks what we saw | `string[]` or `["none"]` |
| `budget` | Always | `"up_to_50"`, `"up_to_100"`, `"up_to_200"` or `"over_200"` |
| `setup` | Always | `"self"` or `"help"` |
| `goals` | Always (screen 2 "What matters most?") | up to 2 of `more_customers`, `save_time`, `better_reviews`, `get_paid_faster` |
| `health_data` | Health businesses only | `"yes"` or `"no"` |
| `deal_breakers` (optional) | Always | `string[]` from `no_contract`, `spanish_required`, `offline_required` |
| `anything_else` (optional) | Always | free text, ≤ 300 chars |

Frederick Heating gets 4 core questions plus 1 conditional one. Dave's Cooling (whose listings disagree on hours) gets 5 core questions.

---

## 3. `POST /api/journey/answer`

Request:

```json
{ "context": "j1.…", "answers": { "problems": ["missed_inquiries"], "budget": "up_to_100" } }
```

- Call it as often as you like; it uses the **compute** rate limit. Answers are **remembered**: send only what changed, using the `context` from the latest response.
- `null` clears an answer (the owner skipped it after all).
- `answers: {}` is valid. The owner can skip everything and still gets results from public evidence.
- An invalid answer doesn't fail the call. It comes back in `ignored: [{ questionId, reason }]`.
- **Per-problem answers:** `"problem.<key>": "yes" | "no"` for any option of the `problems` question. This is the "Might apply. Tell us." card, and it doesn't touch the others. A "yes" to `missed_inquiries` also makes `call_recording` visible.
- **Corrections:** `"edit.name" | "edit.address" | "edit.phone" | "edit.website" | "edit.hours": "text"` (≤ 200 chars). The fact then shows "You told us".

Response (real output, Frederick, owner ticked missed calls and gave two numbers):

```json
{
  "context": "j1.…",
  "business": { … same card, updated with corrections such as the right hours … },
  "headline": "3 things to focus on at Frederick Heating & Air Conditioning, most important first.",
  "opportunities": [
    {
      "id": "problem-missed_inquiries",
      "problemKey": "missed_inquiries",
      "rank": 2,
      "headline": "Customer calls and messages go unanswered",
      "whyItMatters": "Every unanswered call can be a job that goes to a competitor.",
      "status": "confirmed",                     // confirmed | likely | unverified
      "statusLabel": "You confirmed this",       // or "Seen in 4 public listings", "Likely · seen on your website"
      "basis": "you",                            // you | public | you_and_public
      "evidence": [{ "title": null, "text": "You said this happens: “Calls or messages go unanswered when we're busy”",
                     "isQuote": false, "sourceLabel": "You told us", "url": null, "links": [], "observed": true }],
      "moreEvidence": 0,
      "counterEvidence": "6 reviews say you respond quickly",
      "fix": { "kind": "tool", "label": "Needs a tool", "nextStep": "Make sure every call is answered or called back fast" },
      "useCase": "missed-calls",
      "impact": {
        "monthly": { "expected": 1732, "low": 1039, "high": 2425 },
        "kind": "revenue_opportunity",
        "label": "Money you may be missing each month (estimate)",
        "math": "4 missed inquiries/week × 25% would have hired you × $400 average job × 4.33 weeks = $1,732/month",
        "yourNumbers": [{ "label": "Average job or order value", "value": 400, "unit": "usd" },
                        { "label": "Missed inquiries per week", "value": 4, "unit": "per_week" }],
        "assumed": [{ "label": "Share of missed customers who would have hired you", "value": 0.25, "unit": "percent" }]
      },
      "impactNote": null,
      "impactNeeds": [],
      "alsoCovers": []
    }
  ],
  "alsoNoticed": [{ "problemKey": "…", "headline": "…", "statusLabel": "…" }],
  "toCheck":     [{ "problemKey": "slow_quotes", "headline": "Quotes and estimates take too long", "statusLabel": "Not checked yet" }],
  "followUps":   [{ "id": "impact.weekly_inquiries", "kind": "number", "text": "About how many calls, messages and requests do you get in a week?", … }],
  "youToldUs":   [{ "questionId": "budget", "label": "Monthly budget", "value": "Up to $100 a month" }],
  "assumptions": [{ "questionId": "setup", "text": "You'll set tools up yourself." }],
  "recommendation": { "ready": true, "request": { "business": { … }, "problems": [ … ] }, "focus": ["missed_inquiries", "no_online_booking"] },
  "localHelp": { "name": "Maryland SBDC · Northern Region", "county": "Frederick", "url": "https://www.marylandsbdc.org/locations/northern-region", "phone": "410-386-8390" },
  "budget": { "value": 100, "assumed": true },     // assumed = the owner skipped the budget question
  "ignored": []
}
```

### Rules the backend guarantees

- **At most 3 opportunities**, most important first, **one per kind of problem** (overlaps are folded into `alsoCovers`).
- An opportunity is either backed by public evidence or confirmed by the owner. Unchecked guesses go only in `toCheck`, and they are never sent to Part 4.
- **Every evidence item has a source.** Public findings carry `url` and `links` (for listing mismatches, every listing involved). Owner answers say "You told us". Industry patterns are never shown as evidence.
- A listing mismatch is one item, with a `title` ("Your hours are different on different sites") and a `text` that names both sides.
- **`impact` is null until the owner has given the numbers it needs** (`impactNeeds` lists the follow-up ids). When it appears, `math` shows the arithmetic, `yourNumbers` shows what they told us, and `assumed` names every industry assumption still in it. Free fixes and reviews never get a dollar figure; `impactNote` says why.
- `followUps` holds at most 4 optional number questions, only for the top opportunities. A shared number like typical job value is asked once and used everywhere. Answering one moves its estimate into `impact`.
- `recommendation.request` is exactly the body `/api/recommend` accepts. It includes only the focused opportunities that need a tool, and every skipped preference shows up in `assumptions`.
- Picking the right listing value turns `fix.nextStep` into an exact list, e.g. "Change BBB, Yelp (listing 1), Birdeye and your website to show “Mon–Fri 7 AM–5 PM · Sat 8 AM–12 PM”. Then show the same address and phone number on every listing, and merge duplicate listings."
- Choosing, wording, ranking and money figures are deterministic code: the same context and answers give the same output. If an LLM key is configured, it is used only where it already was, to read reviews and websites during `/start`.

### Errors

Same shape as every other endpoint: `{ "error": { "code", "message", "details?" } }`.

| Status | code | When |
|---|---|---|
| 400 | `invalid_request` | Missing or invalid fields |
| 400 | `invalid_context` | The context is damaged, edited, or signed with another key. Restart from search. |
| 404 | `not_found` | Unknown `placeId` |
| 413 / 429 / 502 | as before | Too large, rate limited, Places unavailable |

### The `context` token

The token is `j1.` + base64url(deflated JSON), about 5–6 KB for the real businesses. It holds the analysis and the answers so far, so the server stays stateless (Vercel-friendly). On the way back in it is re-validated with the same schemas as the public endpoints. Set `JOURNEY_SECRET` to also sign it with HMAC, so a hand-edited token is rejected. Treat it as opaque. Keep it in component state (or `sessionStorage` if you want refresh to survive) and replace it with the one from each response.

---

## 4. The screens (home page `/` and `/start`, wireframes v1 and v2)

`app/start/` (`page.tsx`, `Journey.tsx`, `start.module.css`) follows the approved style board: tokens, Tiro Bangla and Spectral (self-hosted in `public/fonts`, OFL), hard-shadow buttons, soft fields, stamp badges, two-part cards, and the step line. The styles are scoped, so the home page is untouched. Screen by screen:

1. **Landing:** the stamp, the promise, and "Find my AI tools". "Saw an AI tool in an ad?" looks the domain up in `lib/catalog` and says Verified, Not yet reviewed, Blocked, or "not in our list yet".
2. **Find your business:** name and town → `/api/business/search` (on tap), up to 3 rows, and "Not listed? Enter it yourself" (→ `manual`). The 3 quick questions are budget, setup help and what matters most (up to 2). There's an optional paste-reviews box. "Read my business" → loading checklist → `/start`.
3. **Check what we found:** `business.facts` with source chips and Edit (→ `edit.*`), the amber "Which is right?" box (→ `listing.*`), `customersSay` and `toolsFound`, and the tools chips (→ `tools`). "Where we looked" lists every source. "Looks right" → `/answer`.
4. **What's costing you:**
   - One summary sentence. A total appears only from estimates built on the owner's numbers, with "not proven lost revenue" under it.
   - Up to 3 cards: badge, headline, money line or the numbers that unlock it, "Why we think this" (proof first, counter-evidence, then the math and its named assumption), and the first step.
   - "Might apply. Tell us." cards (→ `problem.<key>`), plus the call-recording question when relevant.
   - "Also noticed", "Something else slowing you down?", "Anything a tool must have?", and "What you told us" with every assumption.
5. **Ways to fix it · Tool detail · Compare** (`ToolScreens.tsx`, by Rishabh): `/api/recommend` runs on the safety-checked catalog (`data/catalog`). The journey supplies the request plus two things for these screens:
   - `budget.assumed`: the screens say "the budget we assumed" instead of "your budget" when the owner skipped the question.
   - `localHelp`: the SBDC office for the business's county, used in "Get help setting this up" and the "No checked tool yet" card.

   The "Tools you use" chips come from the same catalog's `worksWith`, so a ticked tool lines up with "Works with …" on the tool cards.
6. **Admin queue** (`/admin`), linked as "For reviewers" on the landing page.

**Differences from the wireframes, on purpose:**
- **No starting-guess dollar amounts.** The fields start empty and say "Only you know these. We won't guess them." This follows the rule of no financial impact without the owner's input.
- **No "Team" row.** Team size isn't used anywhere.

---

## 5. Not changed

- `/api/business/*`, `/api/onboarding/*`, `/api/problems/*` and `/api/recommend` return what they did before, so the current home page is unaffected.
- One small fix: when a rating is averaged from reviews we read (not published by a platform), its label now says so instead of "reviews you pasted".
