# Person B — Real catalog (60–80 tools): design

Nov 7, 2026 · Owner: Person B (Rishabh) · Builds on [b-catalog-and-safety.md](b-catalog-and-safety.md) (tool card) and [b-safety-check.md](b-safety-check.md) (Safety Check) · Code: `lib/catalog`, `scripts/`, `data/catalog`

## What it is for

Today the catalog holds 8 made-up tools. Owners need **real AI tools they can actually buy**, each with a full tool card: what it does, real prices dated Nov 2026, what it works with, the 5 privacy answers with quotes, the rules flags, and a Safety Check result.

**Success means:**
- An owner of any of our main business types gets real recommendations.
- Every fact on a card comes from the vendor's own page, quoted word for word, or says "unknown". Nothing is invented: not by the AI, and not by a person.
- Only tools a person approved reach owners, and only after the Safety Check says `ready`.
- The demo works with no internet and no AI. Everything is saved.

## Decisions (agreed with Rishabh, Nov 7)

1. **Held tools: stronger model, then a person.** The Safety Check and card-filler run on a stronger AI model than the rest of the app. Whatever is still unknown or held, a person fills by finding the sentence on the vendor's site. Code checks that sentence is really there.
2. **The list: Claude drafts about 90 tools, Rishabh edits** down to the 60–80 we keep.
3. **Cards are filled by a card-filler program**, not by hand. It uses the same honesty rule as the Safety Check: every answer needs a word-for-word quote. Problem 8 (discovery) reuses it for new tools.

## 1. Flow

```
data/catalog/list.json            the tool list (Claude drafts, Rishabh edits)
   │  npm run catalog:build -- --batch 1   (or --id <toolId>)
   ▼
for each tool:
   fillCard()      → CardFacts     reads pricing / features / integrations pages; AI answers fixed questions with quotes
   checkTool()     → SafetyFacts   the existing Safety Check, on the stronger model
   applyFound()    → both          adds facts a person found (data/catalog/found/<id>.json), each re-checked word for word
   judge()         → SafetyReport  plain code, no internet, no AI
   buildRecord()   → CatalogRecord the tool card; every unknown listed in needsVerification
   ▼
data/catalog/tools/<id>.json  +  data/safety/<id>.json  +  data/catalog/cards/<id>.json
   │  printed gaps list: "Rosie: couldn't confirm where data is stored (privacy page)."
   ▼
person fills gaps → re-run → verdict ready → npm run catalog:approve -- <id> --by "Rishabh"
   ▼
npm run catalog:combine  → data/catalog/real.json  (what the app reads)
```

## 2. The tool list (`data/catalog/list.json`)

One entry per tool. These are our own choices about the tool, not vendor facts, so they need no quote:

| Field | Meaning |
| --- | --- |
| `id` | lowercase slug, e.g. `rosie` |
| `name`, `url` | product name and home page |
| `useCases` | which of the 12 problem types it solves |
| `industries` | business types it suits, or `["any"]` |
| `existingProduct?` | set when it's an AI feature inside a tool owners already use (e.g. `"Square"`) |
| `sensitive` | takes payments or health info (passed to the Safety Check) |
| `batch` | `1` or `2` |
| `category` | short label, e.g. "AI receptionist" |

The draft includes standalone AI tools and AI features inside products owners already have (Square, QuickBooks, Google Business Profile, Jobber, Toast, Shopify and so on).

## 3. The card-filler (`lib/catalog/fill/`)

Same shape as the Safety Check collector:
- **Pages:** the home page plus pricing, features or product, integrations or apps, and help/setup pages found from its links, at most 6. Uses Kushal's `safeFetch` (public pages only, robots.txt, timeouts) and `cache`.
- **AI questions** through Kushal's `llmJson` (temperature 0, call cap, cache keyed on page text). The prompt says the page is untrusted data. Each answer is `{ answer, quote, pageUrl }`:
  - `description` (one plain sentence; quote required)
  - prices for up to 3 plans, mapped to `small` / `medium` / `large` with the plan name in the note; `freeTier`, `contract` (monthly / annual), `cancellation`
  - `worksWith`: products named on the page, each `native` or `zapier`
  - `setupMinutes` (only if the page states a time), `setupMode`, `languages`
  - rules flags: `recordsCalls`, `announcesRecording`, `hipaaReady`, `outboundAiCalls`, `personalizedPricing`
  - `sharesOrSells` (from the privacy page; the other 4 privacy answers already come from the Safety Check)
- **Quote check:** every answer's quote must pass the Safety Check's `isVerbatim`, and the answer must appear in its quote (numbers for prices). Otherwise the answer is `"unknown"`.
- **"Contact us for pricing"** → price `"unknown"`. The translator already refuses to recommend a tool with no confirmed small-plan price.
- **Never throws.** Output: `CardFacts`, saved as `data/catalog/cards/<id>.json`, with each page's `contentHash` so unchanged pages are never asked again.
- **Reviews** (`rating`, `count`) are left out unless a person adds them from a named public source.

## 4. The stronger model and the budget

- New setting `OPENROUTER_STRONG_MODEL` in `lib/shared/config.ts`, used only by the card-filler and the Safety Check when run from the catalog scripts. Everything else keeps the cheap default.
- The first build step tries 2–3 candidate models on the same 3 real tools and picks one by accuracy and cost. The choice and the measured cost go in the PR.
- **Estimate (not measured):** about $5–10 for all 80 tools. Hard limits: a call cap per run (`CATALOG_MAX_CALLS`, default 600), plus the cache, so a re-run of unchanged pages costs nothing. The script prints calls used at the end.

## 5. Facts a person found (`data/catalog/found/<id>.json`)

For gaps the AI couldn't fill:

```json
[{ "field": "whereStored", "answer": "United States", "quote": "All data is stored in AWS data centers in the United States.", "url": "https://tool.com/security", "foundBy": "Rishabh", "foundAt": "2026-11-08" }]
```

- `field` is any AI answer in `SafetyFacts.ai` or `CardFacts`.
- At build time the code fetches `url` (safeFetch, cached) and checks the quote is on that page, word for word, and that the answer appears in it. If either check fails, the fact is rejected and the gaps list says why. **A person can't type in a made-up answer either.**
- Accepted facts replace that `"unknown"` and are marked `source: "person"`, so the evidence shows who found it.

## 6. Building the record

`buildRecord(listEntry, cardFacts, safetyFacts, report)` → `CatalogRecord`:
- List fields copied; card answers copied; privacy card from the Safety Check answers plus `sharesOrSells`.
- `pricing.asOf = "Nov 2026"`. Badge: `blocked` if blocked, otherwise `listed`. Never `verified` here.
- Every `"unknown"` path goes into `needsVerification`, so the existing checker passes.
- `sources`: every page URL that a kept answer quoted.

## 7. Approval

`npm run catalog:approve -- <id> --by "<name>"` calls the existing `approveTool(record, reviewer, today)`. It refuses anything not `ready` and prints why. Approved records are saved with `badge: "verified"`, `reviewedAt` and `reviewedBy`.

## 8. What the app reads

- `npm run catalog:combine` writes `data/catalog/real.json` from `data/catalog/tools/*.json`, sorted by id, and refuses to write if `validateCatalog` finds any error.
- `lib/catalog/index.ts` reads `real.json` plus the **3 fake scam tools** only (they prove scams get blocked in tests and the demo). The 5 fake "good" sample tools are dropped once batch 1 lands, so owners only ever see real tools.
- `getVerifiedTools()` and `getTool()` don't change. Teammates' code doesn't change.

## 9. Batches

- **Batch 1 (about 25 tools, its own PR):** the tools our demo stories need (Mike's HVAC missed calls first), plus at least one per problem type. Done means the batch-1 tests below pass. Target: before Sunday's 2pm feature freeze.
- **Batch 2:** the rest, up to 60–80. Its own PR, same tests, if time allows.

## 10. Tests (must pass)

- Card-filler, with saved pages and a fake AI (no real internet or AI in tests): a made-up quote becomes unknown; a price not in its quote becomes unknown; "contact sales" → unknown price; one malformed AI answer doesn't throw away the rest.
- Found facts: a quote not on the page is rejected; an answer not in its quote is rejected; an accepted fact turns a held check into pass.
- `buildRecord`: every output passes `validateRecord`; never produces `verified`.
- Combine refuses an invalid catalog.
- **Catalog safety (existing test, now on the real catalog):** across 10 owner profiles, no blocked, listed or unapproved tool is ever returned.
- **Coverage (batch 1):** every one of the 12 problem types has at least 1 verified tool. HVAC, plumbing, restaurant, cafe, salon, retail and professional services each get at least 3 recommendations for a typical profile. Health clinic gets at least 1 HIPAA-ready tool, or the test names the gap.
- **Saved results match:** for every real tool, `judge(saved facts)` equals the saved report.

## 11. Not in this problem

- Re-checking prices and policies on a schedule, and finding new tools: problem 8.
- Real tool logos (a separate task from the wireframes).
- Supabase: problem 11.

## 12. Guardrails (from the original brief)

Official pages only, no scraping Google, public pages only, respect robots.txt · cache every lookup and AI call · OpenRouter server-side only · never invent a price, integration or privacy answer: if unconfirmed, it's `unknown` and in `needsVerification` · store nothing sensitive · no keys in code or commits.
