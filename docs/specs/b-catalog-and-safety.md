# Person B — Catalog, Safety Check and Discovery: design

Nov 7, 2026 · Owner: Person B (Rishabh) · Source of truth: [FEATURE_SPEC §1, §2.8, §4.10–4.11](../FEATURE_SPEC.md)

## Goal

Every tool an owner ever sees comes from one catalog. A tool reaches owners only after it passes the Safety Check **and** a person approves it. The catalog grows on its own through a discovery pipeline. Everything works from files in the repo, with no database, network or LLM needed at demo time.

## Decisions already made

- **Our own detailed record + a translator into ak's `CatalogTool`** (`lib/recommend/types.ts`). ak's and Kushal's code stay unchanged.
- **Files now, Supabase later.** Catalog lives in `data/catalog/*.json`. A Supabase table mirrors it later (separate task).
- **Problem types:** the 12 `USE_CASES` in `lib/recommend/types.ts`. **Industries:** Kushal's `IndustryKey` in `lib/business/types.ts`.
- **Discovery sources:** Product Hunt (real, official API, saved snapshot for the demo), vendor submission form (real), owner-pasted link (real), Square/QuickBooks/Jobber/Toast/Shopify marketplaces (saved sample lists; real feeds are a 16-week item).

## 1. The catalog record (`lib/catalog/types.ts`)

`Unknown` means "we could not confirm this". Every field set to `"unknown"` must also appear in `needsVerification`.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | slug | e.g. `jobber-ai-receptionist` |
| `name`, `vendor` | string, `{ company, website, domain }` | |
| `description` | string | Plain English, grade 8 or below |
| `category` | string | e.g. "AI receptionist" |
| `useCases` | `UseCase[]` | From the 12 |
| `industries` | `IndustryKey[]` or `["any"]` | |
| `existingProduct?` | string | Set when this is an AI feature inside a tool owners already use (e.g. "Square"). Powers FEATURE_SPEC 4.1 |
| `pricing` | object | `asOf: "Nov 2026"`, `small` / `medium` / `large`: `{ monthlyUsd: number \| "unknown", note }`, `freeTier: boolean \| "unknown"`, `contract: "monthly" \| "annual" \| "unknown"`, `cancellation: string`, `pricingUrl` |
| `worksWith` | `{ product, type: "native" \| "zapier" \| "none" }[]` | Square, Toast, Clover, QuickBooks, Google Business Profile, Google Calendar, Jobber, Shopify, Wix, Calendly… |
| `setupMinutes` | number \| "unknown" | |
| `setupMode` | `"self_serve" \| "needs_help"` | |
| `languages` | string[] | |
| `privacyCard` | 5 answers | `trainsOnYourData`, `canDeleteData`, `whereStored`, `sharesOrSells`, `securityCertification`. Each: `{ answer: "yes" \| "no" \| "unknown" \| text, plain, quote, sourceUrl }`. No quote → `"unknown"` |
| `rulesFlags` | 5 flags, each `boolean \| "unknown"` | `recordsCalls`, `announcesRecording`, `hipaaReady`, `outboundAiCalls`, `personalizedPricing` |
| `reviews?` | `{ rating, count, source }` | Only from a named public source |
| `badge` | `"verified" \| "listed" \| "blocked"` | |
| `reviewedAt?`, `reviewedBy?` | ISO date, string | Required for `verified` |
| `safetyCheck` | `SafetyReport` | See §2 |
| `lastChecked` | ISO date | |
| `sources` | URL[] | Every fact comes from one of these |
| `needsVerification` | string[] | Field paths we couldn't confirm |
| `sample?` | `true` | Fictional tools (scam demos). Always on a `.example` domain |

### Translator → ak's `CatalogTool` (`lib/catalog/toCatalogTool.ts`)

- `status` ← `badge`; `reviewedAt` ← `reviewedAt`; `demoOnly` ← `sample`.
- `monthlyPrice` ← `pricing.small.monthlyUsd`. `pricingNote` ← "As of Nov 2026: …".
- `integrations` ← `worksWith`: native → `"native"`, zapier → `"via-zapier"`, none → left out.
- **Unknown flags become the value that is safer for the owner:** `recordsCalls`, `outboundAiCalls` and `personalizedPricing` → `true`. `announcesRecording` and `hipaaReady` → `false`. `requiresContract` ← contract is `"annual"` or `"unknown"`. `dataDeletion` ← `privacyCard.canDeleteData === "yes"`.
- `privacySummary` ← the 5 plain answers joined. `setupSummary` ← setup mode + minutes.
- A Verified tool whose small price is `"unknown"` is **not** translated, so it is never recommended at a guessed price.

## 2. Safety Check (`lib/safety`)

Each check returns `{ result: "pass" | "fail" | "unknown", reason, evidence: [{ quote?, url, checkedAt }] }`.

| Check | Passes when | How |
| --- | --- | --- |
| `whoIsBehind` | Company name + address + named leader found | Fetch About/Contact; LLM fills fixed fields (needs a quote each) |
| `domainAge` | Domain > 12 months | RDAP `https://rdap.org/domain/<domain>` |
| `privacyPolicy` | Policy link found and readable | Fetch |
| `dataUse` | No training on your data by default + deletion possible | LLM answers fixed questions; must return the exact sentence |
| `dataLocation` | Location stated | Same |
| `pricingClarity` | Public pricing page + monthly cancellation | Fetch |
| `securityBasics` | HTTPS; certification if payments/health | Site check + vendor claims |
| `redFlags` | None of the auto-block conditions | Lookalike domain (edit distance vs known-brand list), no privacy policy, domain < 6 months + asks for download, Google Safe Browsing (only with a key, else `unknown`) |

**Badge:** any red flag → `blocked`. All key checks pass → `listed`. `verified` only after a person approves. Thresholds live in one file (`lib/safety/config.ts`).

**Network rules:** timeouts, robots.txt, cache everything. Reuse Kushal's `lib/shared/safeFetch.ts`, `lib/shared/cache.ts` and `lib/llm/client.ts` (call cap, rules-only fallback). Results for every seeded tool are **precomputed and saved** in the record.

## 3. Discovery pipeline (`lib/discovery`, `app/admin`)

Find → Extract → Safety Check → Review queue → Publish → Re-check.

- **Source adapters** share one interface: `findCandidates(): Promise<Candidate[]>`. Adapters: `productHunt` (live with `PRODUCT_HUNT_TOKEN`, else saved snapshot), `vendorSubmission`, `ownerPaste`, `marketplace` (saved lists). A real fetcher drops in without changing the pipeline.
- **Extract:** LLM reads the vendor site into the record schema. Anything it can't quote → `"unknown"` + `needsVerification`.
- **Admin (`/admin`):** candidates table (status, last checked), "Run discovery" button, per-tool safety report with evidence, Approve / Edit / Block.
- **Demo moment:** Run discovery → one real tool arrives as Listed → approve → ✓ Verified. One lookalike scam is auto-Blocked with its red-flag reasons.
- **Re-check:** `app/api/cron/recheck` + weekly Vercel Cron. Re-run when the pricing or privacy page changes (content hash).
- **Saving approvals:** until Supabase, approvals made on the live site are temporary and may reset at any time. Approvals that should stick are committed to `data/catalog`.

## 4. Maryland rules (`data/rules`, `lib/rules`)

The 5 rows from FEATURE_SPEC 2.8, as data: `id`, `name`, `appliesTo` (conditions on the business profile), `ownerText`, `effect` (which rules flag excludes a tool), `sourceUrl`, and the text "Not legal advice — ask your SBDC advisor". `applyRules(profile, tools) → { allowed, excluded: [{ tool, rule, reason }] }`.

## 5. What teammates call (`docs/CONTRACTS.md`)

- `getVerifiedTools(filters?)` → `CatalogTool[]`, **only Verified tools, ever**. Filters: `useCase`, `industry`, `worksWith`.
- `getTool(id)` → full `CatalogRecord` (any badge).
- `applyRules(profile, tools)`
- `checkTool(url)` → badge if known, else runs the check and adds the tool to the review queue.
- `getHelpForCounty(county)` → Maryland SBDC center + SCORE chapter.

## 6. Tests that must pass

- **Catalog safety:** with the 3 scam tools seeded, 10 different owner profiles through `getVerifiedTools` + `applyRules` never return a Blocked or Listed tool.
- **Works without AI:** with `OPENROUTER_API_KEY` unset, catalog, badges, safety reports and rules all work from saved data.
- **Data checks:** every catalog file passes the schema check, every `"unknown"` is listed in `needsVerification`, and every `sample` tool uses a `.example` domain.
- Unit tests for each safety check (pass / fail / unknown), badge logic, translator and rules matching.

## Build order (each is its own PR)

1. Record type, translator, `getVerifiedTools` / `getTool`, ~8 sample records (incl. 3 scams, 2 Listed), CONTRACTS.md
2. Safety Check engine
3. Real catalog, 60–80 tools
4. Discovery pipeline + admin
5. Maryland rules
6. Supabase mirror; then Should items (check-tool, why-not, county help)

## Open items

- Product Hunt API terms of use: confirm before relying on it. Person B creates the developer token.
- Getting the site live on Vercel (team task).
