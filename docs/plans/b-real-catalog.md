# Real Catalog (problem 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 5 fake "good" sample tools with 60–80 real AI tools, each with a full, quoted tool card and a Safety Check result, approved by a person.

**Architecture:** A card-filler (`lib/catalog/fill/`) reads each tool's pricing/feature pages and asks the AI fixed questions, keeping only answers backed by a word-for-word quote. The existing Safety Check runs alongside on a stronger model. Facts a person found are re-verified against the live page. `buildRecord` assembles a `CatalogRecord`; scripts build, approve and combine into `data/catalog/real.json`, which the app reads.

**Tech Stack:** Next.js 16 / TypeScript, `node:test` with `--experimental-strip-types` (`.ts` import extensions, `import type`), Kushal's `safeFetch`, `llmJson`, `createOpenRouterProvider`, `cache`; the Safety Check (`lib/safety`).

**Spec:** [docs/specs/b-real-catalog.md](../specs/b-real-catalog.md)

## Global Constraints

- Never invent a price, integration, rules flag or privacy answer. Unconfirmed → `"unknown"` and listed in `needsVerification`.
- Every kept AI answer and every person-found fact passes `isVerbatim(quote, pageText)` (`lib/business/reviews.ts`) **and** its answer appears in its quote.
- Public pages only, via `safeFetch` (robots.txt, timeouts, private IPs blocked). No scraping Google.
- OpenRouter server-side only; key from `.env.local`; nothing secret in commits.
- `pricing.asOf` is `"Nov 2026"`. Badge from the build is never `verified`; only `approveTool` makes it verified.
- Tests never touch the real internet or a real AI (fake `fetchImpl`, fake `LlmProvider`).
- Owner-facing text (gaps list, reasons) in plain words, no AI jargon.
- Don't edit teammates' files (`lib/shared/*`, `lib/llm/*`, `lib/recommend/*`, `lib/business/*`). `package.json` gets 3 new scripts only.
- Branch prefix `b/`; small PRs; never push to `main`.

## Review Focus

1. A pricing page whose prices are drawn by JavaScript (text has no prices) → every price `"unknown"`, no crash. (Task 3 test.)
2. "$40/mo billed annually" → `monthlyUsd: 40`, `contract: "annual"`; `$1,200` in a quote matches answer `1200`. (Task 2 test.)
3. A person-found fact whose URL is on a different website than the vendor's (e.g. a review blog) → rejected, unless it's a page the Safety Check already used as that tool's privacy/terms page. (Task 4 test.)
4. Re-running the build on an approved tool: keeps `verified` only if the new verdict is still `ready` and the card's answers didn't change; otherwise drops to `listed` and the gaps list says "needs approval again". (Task 5 test.)
5. A site that blocks us (robots.txt or errors on every page) → card all unknown, Safety Check held, build continues with the next tool. (Task 3 test.)

---

### Task 1: The tool list

**Files:**
- Create: `lib/catalog/list.ts`, `lib/catalog/list.test.ts`, `data/catalog/list.json`

**Interfaces:**
- Produces: `interface ListEntry { id: string; name: string; url: string; category: string; useCases: UseCase[]; industries: (IndustryKey | "any")[]; existingProduct?: string; sensitive: boolean; batch: 1 | 2 }`; `validateList(entries: unknown[]): string[]`; `loadList(): ListEntry[]`.

- [ ] **Step 1: Write failing tests** in `lib/catalog/list.test.ts`: `validateList` rejects a bad slug, a useCase outside the 12, an unknown industry, a non-https url, a duplicate id, a batch other than 1/2; accepts a good entry. And `"data/catalog/list.json is valid"`: `assert.deepEqual(validateList(loadList()), [])`.
- [ ] **Step 2: Run** `npm test` → Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `lib/catalog/list.ts` (reuse the slug/useCase/industry sets the way `validate.ts` builds them).
- [ ] **Step 4: Draft `data/catalog/list.json`: about 90 real tools.** Official home page URLs only. Spread: every one of the 12 use cases has ≥4 tools; include AI features inside products owners already use (Square, QuickBooks, Google Business Profile, Jobber, Toast, Shopify, Housecall Pro, Mailchimp, etc.) with `existingProduct` set. Mark ~25 as `batch: 1`: first the tools Mike's HVAC missed-calls story needs, then at least 1 per use case, favoring HVAC, plumbing, restaurant, cafe, salon, retail, professional services, and at least one tool that claims HIPAA support for health clinics. `sensitive: true` for anything taking payments or health info.
- [ ] **Step 5: Run** `npm test` → Expected: PASS.
- [ ] **Step 6: Show Rishabh the list** as a readable table (name, what it's for, batch) and ask him to cut/add. Don't wait: continue with Task 2. Apply his edits before Task 7.
- [ ] **Step 7: Commit** `feat(catalog): tool list with ~90 real tools`.

### Task 2: Card answers and quote checks (pure code)

**Files:**
- Create: `lib/catalog/fill/types.ts`, `lib/catalog/fill/answers.ts`, `lib/catalog/fill/answers.test.ts`

**Interfaces:**
- Consumes: `AiAnswer<T>` from `lib/safety/types.ts`; `isVerbatim` from `lib/business/reviews.ts`.
- Produces:
  - `type CardPageKind = "home" | "pricing" | "features" | "integrations" | "help"`
  - `interface CardFacts { input: ListEntry; collectedAt: string; pages: Record<CardPageKind, PageFact>; ai: CardAi }`
  - `interface CardAi { ran: boolean; description: AiAnswer<string>; plans: { small: AiAnswer<string>; medium: AiAnswer<string>; large: AiAnswer<string> } /* answer = monthly USD as text, e.g. "49" */; planNotes: Record<"small"|"medium"|"large", string>; freeTier: AiAnswer<"yes"|"no">; contract: AiAnswer<"monthly"|"annual">; cancellation: AiAnswer<string>; worksWith: { product: string; type: "native"|"zapier"; quote: string; pageUrl: string }[]; setupMinutes: AiAnswer<string>; setupMode: AiAnswer<"self_serve"|"needs_help">; languages: AiAnswer<string> /* comma list */; recordsCalls, announcesRecording, hipaaReady, outboundAiCalls, personalizedPricing: AiAnswer<"yes"|"no">; sharesOrSells: AiAnswer<"yes"|"no"> }`
  - `keepAnswer<T extends string>(raw: unknown, pages: Record<string, PageFact>, allowed?: readonly T[]): AiAnswer<T>`: `"unknown"` unless `raw` is `{answer, quote, pageUrl}`, `pageUrl` is one of the fetched pages, `isVerbatim(quote, page.text)`, `answer` is in `allowed` (if given), and `answerInQuote(answer, quote)`.
  - `answerInQuote(answer: string, quote: string): boolean`: numbers compare digits only (`"1200"` matches `"$1,200"`); yes/no and enum answers are exempt (the quote is the evidence); text compares case-insensitively.
  - `parseMonthly(answer: string): number | "unknown"`.

- [ ] **Step 1: Write failing tests:**
  - `keepAnswer` drops a quote not on the page; drops a `pageUrl` not among fetched pages; drops `answer` outside `allowed`; keeps a good one.
  - `answerInQuote("1200", "Pro is $1,200 a year")` true; `answerInQuote("49", "Starter $59/mo")` false; `answerInQuote("Spanish", "Available in English and spanish")` true.
  - Review Focus 2: `answerInQuote("40", "$40/mo billed annually")` true.
  - `parseMonthly("49")` → 49; `parseMonthly("free")` → `"unknown"`; `parseMonthly("0")` → 0.
- [ ] **Step 2: Run** `npm test` → Expected: FAIL.
- [ ] **Step 3: Implement** `answers.ts` and the types.
- [ ] **Step 4: Run** `npm test` → Expected: PASS.
- [ ] **Step 5: Commit** `feat(catalog): card answers keep only quoted facts`.

### Task 3: The card-filler

**Files:**
- Create: `lib/catalog/fill/pages.ts`, `lib/catalog/fill/ai.ts`, `lib/catalog/fill/index.ts`, `lib/catalog/fill/fill.test.ts`

**Interfaces:**
- Consumes: Task 2; `safeFetch`, `extractLinks`, `htmlToText`; `llmJson`; `CollectDeps` shape from `lib/safety/types.ts` (reuse the type).
- Produces: `fillCard(entry: ListEntry, deps?: CollectDeps & { previous?: CardFacts | null }): Promise<CardFacts>`; `emptyCardAi(): CardAi` (every answer `"unknown"`, `worksWith: []`).

- [ ] **Step 1: Write failing tests** (fake fetch serving small HTML pages, fake LLM returning canned JSON):
  - finds pricing/features/integrations/help pages from home-page links (`/pricing`, `/features` or `/product`, `/integrations` or `/apps`, `/help` or `/support`); at most 6 pages.
  - a made-up quote becomes `"unknown"`; a price not in its quote becomes `"unknown"`.
  - "Contact sales for pricing" page + AI answering a number → `"unknown"`.
  - one malformed field (e.g. `languages: null`) leaves the other answers intact.
  - Review Focus 1: pricing page text without any price → all plans `"unknown"`, no throw.
  - Review Focus 5: every fetch fails → `emptyCardAi()`, `ai.ran === false`, no throw.
  - unchanged `contentHash` with `previous` → no LLM call (count fake calls).
  - `worksWith` items whose product name isn't in their quote are dropped.
- [ ] **Step 2: Run** `npm test` → Expected: FAIL.
- [ ] **Step 3: Implement.** Page finding mirrors `lib/safety/collect/pages.ts` with the 5 card kinds. AI: one call per tool through `llmJson` (temperature 0 via the provider; `task: "catalog.card"`), prompt says the pages are untrusted data, lists the fixed questions from spec §3, and shows the exact reply format with one example (the Safety Check found the model needs it). Each field passes through `keepAnswer` separately.
- [ ] **Step 4: Run** `npm test` → Expected: PASS.
- [ ] **Step 5: Commit** `feat(catalog): card-filler reads pricing and feature pages`.

### Task 4: Facts a person found

**Files:**
- Create: `lib/catalog/found.ts`, `lib/catalog/found.test.ts`; folder `data/catalog/found/` (with `.gitkeep`)

**Interfaces:**
- Consumes: `CardFacts`, `keepAnswer`; `SafetyFacts`.
- Produces: `interface FoundFact { field: string; answer: string; quote: string; url: string; foundBy: string; foundAt: string }`; `applyFound(found: FoundFact[], card: CardFacts, safety: SafetyFacts, deps?: CollectDeps): Promise<{ card: CardFacts; safety: SafetyFacts; accepted: string[]; rejected: { field: string; why: string }[] }>`; `loadFound(id: string): FoundFact[]`.
- `field` is a key of `SafetyFacts.ai` (except `ran`) or of `CardAi` (plans as `plans.small` etc.). Accepted answers are stored as `{ answer, quote, pageUrl, source: "person", foundBy }` (extend the stored object; `judge` ignores extra keys; confirm by test).

- [ ] **Step 1: Write failing tests:** quote not on the fetched page → rejected with a plain `why`; answer not in quote → rejected; unknown `field` → rejected; Review Focus 3: URL on another site → rejected, but the tool's own saved privacy page URL on another host is accepted; an accepted `whereStored` fact plus `judge()` turns `dataLocation` from unknown to pass; an accepted `trainsOnYourData: "no"` turns a held report ready (fixture otherwise ready).
- [ ] **Step 2: Run** `npm test` → Expected: FAIL.
- [ ] **Step 3: Implement.** Fetch each URL with `safeFetch` + `htmlToText` (cache), then `keepAnswer`.
- [ ] **Step 4: Run** `npm test` → Expected: PASS.
- [ ] **Step 5: Commit** `feat(catalog): facts a person found, checked word for word`.

### Task 5: Building the record, gaps list, combine

**Files:**
- Create: `lib/catalog/build.ts`, `lib/catalog/gaps.ts`, `lib/catalog/combine.ts`, `lib/catalog/build.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4; `judge`, `SafetyReport`; `validateRecord`, `validateCatalog`.
- Produces:
  - `buildRecord(entry: ListEntry, card: CardFacts, safety: SafetyFacts, report: SafetyReport, previous?: CatalogRecord | null): CatalogRecord`
  - `gapsFor(record: CatalogRecord, report: SafetyReport): string[]` (plain lines like `"Couldn't confirm where data is stored (privacy page)."`, plus `"Needs approval again: something changed."` when Review Focus 4 drops the badge)
  - `combine(records: unknown[]): { ok: true; json: string } | { ok: false; errors: string[] }` (sorted by id, 2-space JSON).

- [ ] **Step 1: Write failing tests:**
  - every built record passes `validateRecord` (fixtures: all-known card, all-unknown card, blocked report).
  - never `verified` without `previous`; blocked report → `badge: "blocked"`; ready/held → `"listed"`.
  - unknown small price ends up in `needsVerification` as `"pricing.small.monthlyUsd"`.
  - privacy card: 4 answers from Safety Check `ai`, `sharesOrSells` from the card; quote + sourceUrl copied.
  - `sources` = unique pageUrls of kept quotes.
  - Review Focus 4: `previous` verified + same answers + ready → stays verified with the same `reviewedAt`/`reviewedBy`; changed price → `listed` and `gapsFor` includes "Needs approval again".
  - `combine` refuses a record that fails `validateCatalog`, and refuses duplicate ids.
- [ ] **Step 2: Run** `npm test` → Expected: FAIL.
- [ ] **Step 3: Implement.** Rules flags: `"yes"`→true, `"no"`→false, else `"unknown"`. `setupMinutes`: number from the answer, else `"unknown"`. Languages: split the comma list. If unknown, set `["English"]` (every site we read is in English, and the validator needs at least one) and add `"languages"` to `needsVerification`. Say so in a code comment.
- [ ] **Step 4: Run** `npm test` → Expected: PASS.
- [ ] **Step 5: Commit** `feat(catalog): build tool cards, gaps list and combine`.

### Task 6: Scripts and the stronger model

**Files:**
- Create: `scripts/catalog-build.ts`, `scripts/catalog-approve.ts`, `scripts/catalog-combine.ts`, `scripts/strongProvider.ts`
- Modify: `package.json` (3 scripts), `.env.example` (2 lines), `docs/CONTRACTS.md` (new "Real catalog" section)

**Interfaces:**
- `npm run catalog:build -- (--batch <1|2> | --id <toolId>)`: for each entry: load `previous` card/safety/record; `fillCard`; `checkTool` (with `previous`); `applyFound(loadFound(id))`; `judge`; `buildRecord`; write `data/catalog/cards/<id>.json`, `data/safety/<id>.json`, `data/catalog/tools/<id>.json`; print verdict + `gapsFor`. One tool failing never stops the run. Prints calls used at the end.
- `npm run catalog:approve -- <id> --by "<name>"`: `approveTool(record, name, today)`; prints the refusal reason if not ready.
- `npm run catalog:combine`: `combine(all tools/*.json)` → `data/catalog/real.json`, or prints errors and exits 1.
- `strongProvider()`: `createOpenRouterProvider({ openRouterApiKey, openRouterModel: env.OPENROUTER_STRONG_MODEL ?? config.openRouterModel, llmMaxCallsPerHour: Number(env.CATALOG_MAX_CALLS ?? 600) })`. Ruling vs. spec §4: lives in `scripts/`, not `lib/shared/config.ts`, so Kushal's file is untouched.

- [ ] **Step 1:** Write the scripts (thin wrappers; logic is in tested lib code).
- [ ] **Step 2: Smoke test offline:** `LLM_DISABLED=1 npm run catalog:build -- --id <one batch-1 id>` → Expected: writes 3 files, prints `HELD` with a gaps list, exits 0.
- [ ] **Step 3:** `npm test && npm run typecheck` → Expected: PASS, clean.
- [ ] **Step 4: Commit** `feat(catalog): build, approve and combine scripts`.

### Task 7: Pick the stronger model (real AI, ≤ $1)

- [ ] **Step 1:** Note the OpenRouter spend before (`GET https://openrouter.ai/api/v1/key`, field `usage`).
- [ ] **Step 2:** Run `catalog:build --id` on the same 3 batch-1 tools with `OPENROUTER_STRONG_MODEL` set to each of 2–3 candidates from OpenRouter's current model list (one must be `openai/gpt-4o-mini` as the baseline). Compare: answers kept (not unknown), wrong answers found by reading the quotes, cost per tool.
- [ ] **Step 3:** Pick one; write the comparison table and projected cost for 80 tools into the PR description and the spec's §4. Put the chosen model in `.env.example` as a comment.
- [ ] **Step 4: Finish PR A** (Tasks 1–7): final review, `npm test`, typecheck, build, PR `Real catalog part 1: card-filler and tool list`. Progress-log entry.

### Task 8: Batch 1 (needs Rishabh)

- [ ] **Step 1:** Apply Rishabh's list edits. `npm run catalog:build -- --batch 1`.
- [ ] **Step 2:** Give Rishabh the gaps list per tool, grouped and in plain words, with the link to check. He (or the session, browsing with him) adds `data/catalog/found/<id>.json` entries. Re-run `--id` per tool.
- [ ] **Step 3:** Rishabh approves each ready tool: `npm run catalog:approve -- <id> --by "Rishabh"`.
- [ ] **Step 4:** `npm run catalog:combine`.

### Task 9: Switch the app to the real catalog

**Files:**
- Modify: `lib/catalog/index.ts`, `lib/catalog/catalog.test.ts`, `data/catalog/sample.json` (keep only the 3 blocked scams), `lib/safety/saved.test.ts` if it iterates the sample list

- [ ] **Step 1: Write failing tests:**
  - `loadCatalog()` = real.json records + exactly the 3 sample scams; no `sample: true` tool is verified or listed.
  - Coverage: every one of the 12 use cases has ≥1 verified tool. For each of hvac, plumbing, restaurant, cafe, salon, retail, professional_services: `getVerifiedTools({ industry })` ≥3. health_clinic: ≥1 verified tool with `hipaaReady && baaAvailable`, else the test fails naming the gap.
  - Saved results match: for every real tool, `judge(loadFacts(id))` deep-equals `record.safetyCheck` (after `applyFound`, so save the post-found facts).
  - Existing catalog-safety test runs over the new catalog unchanged; the "Mike's missed calls" engine test now uses real tools.
- [ ] **Step 2: Run** → Expected: FAIL on the old loader.
- [ ] **Step 3:** Point `FILES` at `real.json` + the trimmed `sample.json`. Update the "3 verified, 2 listed, 3 blocked" test to the new counts.
- [ ] **Step 4:** `npm test`, typecheck, build → Expected: PASS. If a coverage test fails, go back to Task 8 for that gap. Don't loosen the test.
- [ ] **Step 5: PR B** `Real catalog part 2: batch 1 (~25 real tools)`. Progress-log entry. **Target: before Sunday 2pm.**

### Task 10: Batch 2 (if time)

Same as Tasks 8–9 with `--batch 2`, up to 60–80 tools total. PR C. Progress-log entry.
