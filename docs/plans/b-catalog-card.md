# Catalog Card (PR 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give teammates a real catalog format today: the `CatalogRecord` type, a data checker, a translator into ak's `CatalogTool`, `getVerifiedTools` / `getTool`, 8 sample records, and `docs/CONTRACTS.md`.

**Architecture:** Records live as JSON in `data/catalog/`, loaded through one TypeScript file using JSON import attributes. `lib/catalog` holds the type, the checker, the translator and the two public functions. ak's `lib/recommend` and Kushal's `lib/problems` are not modified.

**Tech Stack:** TypeScript (Node 24 `--experimental-strip-types`, so `.ts` import extensions and `import type`), `node:test` + `node:assert/strict` via `npm test`, Next.js 16 build. No new dependencies.

**Spec:** [docs/specs/b-catalog-and-safety.md](../specs/b-catalog-and-safety.md) §1, §5, §6.

## Global Constraints

- `UseCase` and `USE_CASES` come from `lib/recommend/types.ts`. `IndustryKey` comes from `lib/business/types.ts`. Never redefine them.
- `getVerifiedTools` returns **only** `badge === "verified"` records that have `reviewedAt`. Listed and Blocked never.
- `"unknown"` means "could not confirm". Every field holding `"unknown"` must appear in `needsVerification`.
- Every `sample: true` record uses a `.example` domain (vendor website and every source URL).
- Pricing `asOf` is exactly `"Nov 2026"`.
- Unknown rules flags translate to the safer value: `recordsCalls`, `outboundAiCalls`, `personalizedPricing` → `true`; `announcesRecording`, `hipaaReady` → `false`.
- No edits outside `lib/catalog`, `data/catalog`, `docs/CONTRACTS.md`, `docs/plans`.

## Review Focus

1. `getTool("does-not-exist")` returns `null` and does not throw (Task 3 test).
2. A record with `badge: "verified"` but no `reviewedAt` is never returned by `getVerifiedTools` (Task 3 test).
3. `worksWith` filter is case-insensitive: `"quickbooks"` matches `"QuickBooks"` (Task 3 test).
4. Two records with the same `id` make the data check fail (Task 3 test).
5. Mutating a returned tool doesn't change what the next call returns (Task 3 test).

---

### Task 1: Record type and data checker

**Files:**
- Create: `lib/catalog/types.ts`, `lib/catalog/validate.ts`
- Test: `lib/catalog/validate.test.ts`

**Interfaces:**
- Produces, in `types.ts`:
  - `type Unknown = "unknown"`
  - `type Badge = "verified" | "listed" | "blocked"`
  - `type CheckResult = "pass" | "fail" | "unknown"`
  - `interface Evidence { quote?: string; url: string; checkedAt: string }`
  - `interface SafetyCheckItem { result: CheckResult; reason: string; evidence: Evidence[] }`
  - `type SafetyCheckName = "whoIsBehind" | "domainAge" | "privacyPolicy" | "dataUse" | "dataLocation" | "pricingClarity" | "securityBasics" | "redFlags"`
  - `interface SafetyReport { ranAt: string; checks: Record<SafetyCheckName, SafetyCheckItem>; redFlags: string[] }`
  - `interface PriceTier { monthlyUsd: number | Unknown; note: string }`
  - `interface Pricing { asOf: "Nov 2026"; small: PriceTier; medium: PriceTier; large: PriceTier; freeTier: boolean | Unknown; contract: "monthly" | "annual" | Unknown; cancellation: string; pricingUrl: string }`
  - `interface WorksWith { product: string; type: "native" | "zapier" | "none" }`
  - `type PrivacyKey = "trainsOnYourData" | "canDeleteData" | "whereStored" | "sharesOrSells" | "securityCertification"`
  - `interface PrivacyAnswer { answer: string; plain: string; quote: string | null; sourceUrl: string | null }` (`answer` is `"yes" | "no" | "unknown"` or short text such as `"United States"`)
  - `type RulesFlagKey = "recordsCalls" | "announcesRecording" | "hipaaReady" | "outboundAiCalls" | "personalizedPricing"`
  - `interface CatalogRecord` with exactly the fields in spec §1: `id, name, vendor: { company: string; website: string; domain: string }, description, category, useCases: UseCase[], industries: (IndustryKey | "any")[], existingProduct?: string, pricing: Pricing, worksWith: WorksWith[], setupMinutes: number | Unknown, setupMode: "self_serve" | "needs_help", languages: string[], privacyCard: Record<PrivacyKey, PrivacyAnswer>, rulesFlags: Record<RulesFlagKey, boolean | Unknown>, reviews?: { rating: number; count: number; source: string }, badge: Badge, reviewedAt?: string, reviewedBy?: string, safetyCheck: SafetyReport, lastChecked: string, sources: string[], needsVerification: string[], sample?: true`
- Produces, in `validate.ts`: `validateRecord(record: unknown): string[]` (empty array = valid; each string names the field path and problem) and `validateCatalog(records: unknown[]): string[]` (runs `validateRecord` on each, prefixing errors with the id, plus a duplicate-id check).

- [ ] **Step 1: Write the failing tests** in `validate.test.ts`, built from a `validRecord()` helper (a complete verified record):
  - `validateRecord(validRecord())` → `[]`
  - a `useCases` entry not in `USE_CASES` → an error mentioning `useCases`
  - `pricing.small.monthlyUsd = "unknown"` while `needsVerification` lacks `"pricing.small.monthlyUsd"` → an error mentioning `pricing.small.monthlyUsd`; adding the path → `[]`
  - `privacyCard.trainsOnYourData.answer = "no"` with `quote: null` → an error (a non-unknown answer needs a quote and a sourceUrl)
  - `badge: "verified"` without `reviewedAt` → an error mentioning `reviewedAt`
  - `sample: true` with `vendor.website = "https://real.com"` → an error mentioning `.example`
  - `pricing.asOf = "Oct 2026"` → an error
  - `validateCatalog([a, a])` → an error mentioning `duplicate`
- [ ] **Step 2:** `npm test` → the new tests FAIL (module not found).
- [ ] **Step 3: Implement** `types.ts` and `validate.ts`. Hand-written checks, no libraries. Find `"unknown"` values by walking the record and collecting dotted paths. Ignore `safetyCheck` (its `"unknown"` results are normal) and `privacyCard.*.answer`, which are allowed to be `"unknown"` and are checked by the quote rule instead.
- [ ] **Step 4:** `npm test` → all pass. `npm run typecheck` → clean.
- [ ] **Step 5: Commit** `feat(catalog): add catalog record type and data checker`.

### Task 2: Translator to ak's CatalogTool

**Files:**
- Create: `lib/catalog/toCatalogTool.ts`
- Test: `lib/catalog/toCatalogTool.test.ts`

**Interfaces:**
- Consumes: `CatalogRecord` (Task 1), `CatalogTool` from `lib/recommend/types.ts`.
- Produces: `toCatalogTool(record: CatalogRecord): CatalogTool | null`. Returns `null` when `pricing.small.monthlyUsd === "unknown"`.

Mapping (spec §1 "Translator"): `status` ← `badge`; `reviewedAt`; `demoOnly` ← `sample === true`; `website` ← `vendor.website`; `monthlyPrice` ← `pricing.small.monthlyUsd`; `pricingNote` ← `"As of Nov 2026: " + pricing.small.note`; `integrations` ← native → `"native"`, zapier → `"via-zapier"`, none dropped; `setupMinutes` ← number, or `120` when unknown (a conservative estimate); `reviewRating` / `reviewCount` ← `reviews`; `flags`: unknowns per Global Constraints, `requiresContract` ← contract `"annual"` or `"unknown"`, `dataDeletion` ← `privacyCard.canDeleteData.answer === "yes"`, `baaAvailable` ← `hipaaReady === true`; `privacySummary` ← the five `plain` answers joined with `" "`; `setupSummary` ← `"Set it up yourself in about N minutes."` or `"Best with a helper — about N minutes."`.

- [ ] **Step 1: Write the failing tests:**
  - full record → `status`, `monthlyPrice`, `pricingNote` starts with `"As of Nov 2026: "`, `integrations` equals `{ Square: "native", QuickBooks: "via-zapier" }` from a worksWith that also has a `none` entry
  - all five rules flags `"unknown"` → `recordsCalls: true, outboundAICalls: true, personalizesPrices: true, announcesRecording: false, hipaaReady: false`
  - `contract: "unknown"` → `requiresContract: true`; `"monthly"` → `false`
  - `pricing.small.monthlyUsd: "unknown"` → `null`
  - `sample: true` → `demoOnly: true`
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3: Implement** `toCatalogTool`.
- [ ] **Step 4:** `npm test` + `npm run typecheck` → pass.
- [ ] **Step 5: Commit** `feat(catalog): translate catalog records into recommend engine tools`.

### Task 3: Sample data, loader, getVerifiedTools / getTool

**Files:**
- Create: `data/catalog/sample.json` (array of 8 records), `lib/catalog/index.ts`
- Test: `lib/catalog/catalog.test.ts`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces, in `index.ts`:
  - `loadCatalog(): CatalogRecord[]`: all records from every JSON file in `data/catalog`, imported as `import sample from "../../data/catalog/sample.json" with { type: "json" }` (one import line per file).
  - `interface ToolFilters { useCase?: UseCase; industry?: IndustryKey; worksWith?: string }`
  - `getVerifiedTools(filters?: ToolFilters, records?: CatalogRecord[]): CatalogTool[]`: `badge === "verified"` and `reviewedAt` set, filters applied (industry matches `"any"` too; worksWith is case-insensitive and ignores `type: "none"`), translated, `null`s dropped, deep copies. `records` defaults to `loadCatalog()` and exists so tests can inject records.
  - `getTool(id: string, records?: CatalogRecord[]): CatalogRecord | null`: deep copy, any badge.

**Sample records** (all `sample: true`, all on `.example` domains, all fictional; names clearly invented):
- 3 verified, one each for Mike's demo problems: `missed-calls` (AI receptionist, works with Square native, records calls + announces recording), `quotes` (quoting tool, QuickBooks native), `reviews` (review replies, Google Business Profile native). Prices under $100 small tier. Each has `reviewedAt: "2026-11-07"`.
- 2 listed: one `booking`, one `customer-messaging`. Safety checks pass, no `reviewedAt`.
- 3 blocked scams, each with `redFlags` filled and `safetyCheck.checks.redFlags.result: "fail"`:
  - a lookalike-brand AI receptionist (`squarre-voice.example`), reason "Name and website imitate Square"
  - a brand-new domain asking for a download (`fastbooks-ai-download.example`), reason "Website is under 6 months old and asks you to download software"
  - a tool with no privacy policy (`replybot-pro.example`), reason "No privacy policy found"

- [ ] **Step 1: Write the failing tests:**
  - `validateCatalog(loadCatalog())` → `[]`
  - `loadCatalog().length === 8`; exactly 3 verified, 2 listed, 3 blocked
  - `getVerifiedTools()` → 3 tools, every `status === "verified"`
  - `getVerifiedTools({ useCase: "missed-calls" })` → 1 tool; `{ worksWith: "quickbooks" }` → includes the quotes tool; `{ useCase: "inventory" }` → `[]`
  - injected record `badge: "verified"` without `reviewedAt` → not returned
  - `getTool("does-not-exist")` → `null`; `getTool(<a blocked id>)?.badge === "blocked"`
  - mutate `getVerifiedTools()[0].name`, call again → original name
  - **catalog safety:** for 10 business profiles (industry × useCase combinations), `getVerifiedTools` never returns an id whose record badge is `listed` or `blocked`
  - feeding `getVerifiedTools()` into ak's `recommend()` with `demoBusiness` and a `missed-calls` problem returns at least one option (proves the translator output works in the engine)
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3: Write** `sample.json` and implement `index.ts`.
- [ ] **Step 4:** `npm test`, `npm run typecheck`, `npm run build` → all pass. The build matters here: it proves the JSON import works in Next.js, not just in Node. If the build rejects the import attribute, switch `data/catalog/sample.json` to `data/catalog/sample.ts` exporting the array (`satisfies CatalogRecord[]`) and note it in CONTRACTS.md.
- [ ] **Step 5: Commit** `feat(catalog): add sample catalog and getVerifiedTools/getTool`.

### Task 4: CONTRACTS.md

**Files:**
- Create: `docs/CONTRACTS.md`

- [ ] **Step 1:** Document, in short plain sections: `getVerifiedTools(filters?)` (only Verified, ever; filter fields; returns ak's `CatalogTool`), `getTool(id)` (full record, any badge, `null` if missing), the `CatalogRecord` field list (point to `lib/catalog/types.ts`), the translator's safer-value rule, where catalog files live, and "coming next" stubs for `applyRules`, `checkTool`, `getHelpForCounty` with their signatures from spec §5. Note that switching `/api/recommend` from `demoCatalog` to `getVerifiedTools()` is a one-line change in ak's route.
- [ ] **Step 2:** `npm test && npm run typecheck && npm run build` → all pass.
- [ ] **Step 3: Commit** `docs: add CONTRACTS.md for catalog functions`.
