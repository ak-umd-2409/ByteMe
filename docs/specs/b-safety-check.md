# Person B — Safety Check engine: design

Nov 7, 2026 · Owner: Person B (Rishabh) · Builds on [b-catalog-and-safety.md §2](b-catalog-and-safety.md) · Code: `lib/safety`

## What it is for

The Safety Check is the "Trust" in MainStreet AI. Given one AI tool's website, it decides whether the tool may ever be shown to a small-business owner, and shows the proof. It does **not** look for new tools; finding tools is discovery (problem 8). Every tool, wherever it comes from, goes through this one check.

**Success means:**
- No scam, lookalike, or tool with an unclear data policy can reach an owner.
- Every pass or fail has a plain-English reason and evidence (a link, a date, and where relevant an exact quote).
- The demo never depends on the internet or the AI. Saved results always work.

## Decisions (agreed with Rishabh, Nov 7)

1. **Two layers.** A *collector* gathers facts from the web. A *judge* decides from those facts with plain code, no internet, no AI. The collector runs when tools are added (problem 7) and live on a pasted link (problem 8). Saved fact sheets are the fallback.
2. **AI reads the text, carefully.** The AI (OpenRouter) answers fixed questions about the About/Contact and Privacy pages. The code, not the AI, decides pass or fail. Every AI answer must come with a quote that the code finds word for word on the page, or it becomes "couldn't tell". With no key, those answers are "couldn't tell".
3. **Must-pass core, the rest are warnings.** Core: `whoIsBehind`, `privacyPolicy`, `dataUse`, `securityBasics`, `redFlags`. Warnings: `domainAge`, `dataLocation`, `pricingClarity`.

## 1. Flow

```
checkTool({ url, name, handlesSensitiveData? })
  └─ collectFacts()  → SafetyFacts      (internet + AI; lib/safety/collect.ts)
  └─ judge(facts)    → SafetyReport     (pure; lib/safety/judge.ts)
```

Results:

| Verdict | When | What happens |
| --- | --- | --- |
| `blocked` | Any red flag | Badge `blocked`. Never shown. Reasons listed. |
| `held` | No red flag, but a core check is `fail` or `unknown` | Stays in the review queue. **Cannot be approved.** |
| `ready` | All core checks `pass` | Badge `listed`. Warnings shown. Becomes `verified` only when a person approves. |

## 2. The fact sheet (`SafetyFacts`, `lib/safety/types.ts`)

Everything the collector found, and nothing else. Saved as `data/safety/<toolId>.json`.

- `input`: `{ url, name, handlesSensitiveData }` (`handlesSensitiveData` = takes payments or health info).
- `collectedAt` (ISO date).
- `pages`: for each page kind (`home`, `about`, `contact`, `privacy`, `pricing`, `terms`): `{ url, finalUrl, status, fetchedAt, contentHash, text } | null` (null = not found; an error code if the fetch failed).
- `domain`: `{ name, registeredAt: ISO date | null, source: "rdap" }`.
- `https`: boolean (final home URL is https).
- `downloadPrompt`: boolean (home page links to `.exe`, `.dmg`, `.msi`, `.apk`, `.pkg`).
- `ai`: the answers, each `{ answer, quote, pageUrl } | "unknown"`:
  - `companyName`, `address`, `leaderName` (from About/Contact)
  - `trainsOnYourData`: `"yes" | "no" | "opt-in"`, `canDeleteData`: `"yes" | "no"`, `whereStored`: text, `securityCertification`: text (from Privacy)
- `riskySentences`: sentences on the Privacy page that mention training, improving models or machine learning (found by keywords, no AI).
- `safeBrowsing`: `"clean" | "listed" | "not_run"`.

## 3. The collector (`lib/safety/collect.ts`)

- **Pages:** fetch the home page with Kushal's `safeFetch` (public hosts only, timeouts, robots.txt). Find About/Contact/Privacy/Pricing/Terms from its links (reuse `extractLinks` and `classifyPage`). If none is found, try the usual paths (`/about`, `/privacy`, `/pricing`, …). At most 6 pages. Text comes from `htmlToText`.
- **Domain age:** RDAP `https://rdap.org/domain/<domain>`, registration event date.
- **AI questions:** two calls per tool (About/Contact, then Privacy) through Kushal's `llmJson` (temperature 0, call cap, schema check, cache keyed on the page text). The prompt says the page is untrusted data and asks for JSON with a quote for each answer.
- **Quote check:** every AI quote must pass `isVerbatim(quote, pageText)`, or that answer becomes `"unknown"`.
- **Read once:** each page's `contentHash` is stored. When a fact sheet is re-collected and a page's hash hasn't changed, its old AI answers are reused, with no AI call.
- **Safe Browsing:** only when `GOOGLE_SAFE_BROWSING_API_KEY` is set, else `"not_run"`.
- **Never throws.** Any failure becomes a null page or an `"unknown"` answer, never a guess.

## 4. The judge (`lib/safety/judge.ts`, rules in `lib/safety/config.ts`)

All numbers and word lists live in `config.ts`.

| Check | Core? | pass | fail | unknown |
| --- | --- | --- | --- | --- |
| `whoIsBehind` | core | company name, address and leader all quoted | About and Contact read, AI ran, and no company name was found | pages missing or AI didn't run |
| `privacyPolicy` | core | Privacy page found with at least 150 words | no Privacy page anywhere (also a red flag) | fetch error |
| `dataUse` | core | trains = `no` or `opt-in` **and** delete = `yes` | trains = `yes`, or delete = `no` | anything else, **or** AI said trains = `no` while `riskySentences` is not empty (a person must read it) |
| `securityBasics` | core | https | http only | home page not reached |
| `redFlags` | core | none found | any red flag below | never (an unchecked part like Safe Browsing is noted in the reason, not a failure) |
| `domainAge` | warning | over 12 months | 12 months or less | RDAP failed |
| `dataLocation` | warning | storage location quoted | — | not stated |
| `pricingClarity` | warning | Pricing page shows a `$` price and monthly wording | no Pricing page, or "contact sales" only | fetch error |

`securityBasics` for `handlesSensitiveData` tools: a missing certification (PCI, SOC 2, HIPAA) is a warning in the reason, not a failure.

**Red flags (any one → `blocked`):**
- **Lookalike name:** the domain's main word is within 2 letters of a known brand (`data/safety/brands.json`: QuickBooks, Square, Shopify, Jobber, Toast, Clover, Wix, Calendly, Google, Microsoft, OpenAI, …) but is not that brand's official domain.
- **No privacy policy** anywhere on the site.
- **Brand-new site asking for a download:** domain under 6 months old and `downloadPrompt`.
- **On Google's unsafe-site list** (Safe Browsing `"listed"`).

The report (existing `SafetyReport` type) gains two fields: `verdict: "blocked" | "held" | "ready"` and `warnings: string[]`.

## 5. Approval guard

`approveTool(record, reviewer, date)` (in `lib/safety/approve.ts`) is the only way to make a tool `verified`. It refuses unless `safetyCheck.verdict === "ready"`. The catalog checker (`lib/catalog/validate.ts`) also rejects any `verified` or `listed` record whose verdict isn't `ready`, and any `blocked` record whose verdict isn't `blocked`.

## 6. Saved data and scripts

- `data/safety/<toolId>.json`: one fact sheet per catalog tool.
- `npm run safety:check -- <url> [--id <toolId>] [--sensitive]`: collects, judges, saves the fact sheet and prints the report in plain English. Used in problem 7 to fill the real catalog.
- The 8 sample tools get hand-written fact sheets (their sites are fictional `.example` domains). Their `safetyCheck` in `data/catalog/sample.json` must equal `judge(facts)`; a test enforces this.

## 7. Tests

- **Judge (main effort, no network):** about 30 made-up fact sheets. They cover every check with pass, fail and unknown, plus: lookalike scam, new site with a download, "we may use your data to improve our models", AI quote not on the page, AI says "no training" but a risky sentence exists, missing Privacy page, http-only site.
- **Collector (fake web + fake AI, from `lib/testing/fakes.ts`):** finds the right pages, uses fallback paths, drops made-up quotes, gives `"unknown"` with no key, reuses answers when the page hash is unchanged, never throws on timeouts or 404s.
- **Approval guard:** `held` or `blocked` tools can never become `verified`.
- **Saved data:** every sample tool's saved report equals `judge(facts)`; every fact sheet passes its schema.
- **Real-world check (by hand, with a key):** run `safety:check` on 3 real tools (one big, one small, one with a weak privacy policy). Rishabh and Claude read the results and agree they make sense. Not part of the automated tests.

## Out of scope (later problems)

- Finding tools, the admin screen, the review queue UI, and weekly re-checks (problem 8).
- Filling 60–80 real tools (problem 7).
- Saving to Supabase (problem 11).
