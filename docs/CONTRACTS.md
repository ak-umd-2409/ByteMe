# Contracts — how to use the catalog (Person B)

Design: [docs/specs/b-catalog-and-safety.md](specs/b-catalog-and-safety.md). Code: `lib/catalog`.

**The one rule:** owners only ever see tools that came from `getVerifiedTools()`. Listed and Blocked tools never come out of it.

## Available now

### `getVerifiedTools(filters?) → CatalogTool[]`

```ts
import { getVerifiedTools } from "@/lib/catalog/index.ts";

getVerifiedTools();                                   // every Verified tool
getVerifiedTools({ useCase: "missed-calls" });        // one of the 12 USE_CASES
getVerifiedTools({ industry: "hvac" });               // Kushal's IndustryKey; tools marked "any" always match
getVerifiedTools({ worksWith: "QuickBooks" });        // case-insensitive; Zapier counts, "none" doesn't
```

- Returns ak's `CatalogTool` (`lib/recommend/types.ts`), so it plugs straight into `recommend(business, problems, getVerifiedTools())`.
- Only tools with `badge: "verified"` **and** a `reviewedAt` date.
- A tool with an unconfirmed price is left out, so nobody is shown a guessed price.
- Returns fresh copies; changing them doesn't affect the catalog.

### `getTool(id) → CatalogRecord | null`

The full record for any tool, any badge. Use it for the tool detail page (privacy card, safety report, sources) and the "Why we hid these" list. Returns `null` for an unknown id.

### The full record: `CatalogRecord` (`lib/catalog/types.ts`)

Problems it solves · industries · price at small/medium/large (as of Nov 2026) · free plan · contract · works with (native / Zapier / none) · setup time · self-serve or needs help · languages · `privacyCard` (5 answers, each with the quoted sentence + link) · `rulesFlags` (records calls, announces recording, HIPAA-ready, outbound AI calls, personalized pricing) · `badge` · `safetyCheck` (8 checks, each pass/fail/unknown + reason + evidence) · `lastChecked` · `sources` · `needsVerification` · `sample`.

`"unknown"` means "we couldn't confirm it". Show it as "Not confirmed", never as a guess.

### How unknowns reach the recommendation engine

When a rules flag is unknown, the translator assumes the answer that protects the owner. "Records calls?", "Makes outbound AI calls?" and "Personalizes prices?" become **yes**. "Announces recording?" and "HIPAA-ready?" become **no**. An unknown contract counts as "requires a contract".

### Where the data lives

`data/catalog/*.json`, loaded by `lib/catalog/index.ts`, with no database, network or AI needed. Every file is checked by `validateCatalog()` in the tests.

**Right now the catalog is 8 fictional sample tools** (`sample: true`, all on `.example` domains): 3 Verified (missed calls, quotes, reviews), 2 Listed, 3 Blocked scams. The real 60–80 tools replace them next.

## Switching the recommend route to the real catalog (ak)

In `app/api/recommend/route.ts`, replace `demoCatalog` with `getVerifiedTools()`. That's the only change. We'll do it together at the "plug everything together" step.

## Coming next (signatures fixed, not built yet)

```ts
applyRules(profile: BusinessProfile, tools: CatalogTool[])
  → { allowed: CatalogTool[]; excluded: { tool: CatalogTool; rule: string; reason: string }[] }

checkTool(url: string)
  → Promise<{ known: boolean; badge: Badge; record: CatalogRecord }>   // unknown URLs join the review queue

getHelpForCounty(county: string)
  → { sbdc: { name: string; url: string }; score: { name: string; url: string } } | null
```
