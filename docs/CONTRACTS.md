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

## Safety Check (`lib/safety`)

Design: [docs/specs/b-safety-check.md](specs/b-safety-check.md). Decides whether a tool may ever be shown to an owner, and shows the proof.

### `checkTool(input, deps?) → Promise<{ facts, report }>`

```ts
import { checkTool, judge, approveTool } from "@/lib/safety/index.ts";

const { facts, report } = await checkTool({ url: "https://tool.com", name: "Tool", handlesSensitiveData: false });
report.verdict;   // "blocked" | "held" | "ready"
report.redFlags;  // why it was blocked (plain English)
report.warnings;  // things to know that don't block it
report.checks;    // 8 checks, each pass / fail / unknown + reason + evidence (link, date, quote)
```

- Two layers: `collectFacts()` reads the website (and asks the AI fixed questions); `judge(facts)` decides with plain code, no internet, no AI. Server-side only.
- Never throws. A page it couldn't read becomes "couldn't tell", never a guess.
- **Learning from your data has four cases.** "Doesn't" or "only if you say yes" pass. "Only with names removed" and "you can switch it off" also pass, and add a plain warning owners must see (`report.warnings`), e.g. "Turn this setting off after you sign up." "Does, and you can't stop it" fails, so the tool is held.
- **Reasons and warnings are written for owners.** Show them as they are; don't add AI words.
- **AI answers need a verbatim quote.** Every AI answer must come with a sentence the code finds word for word on the vendor's page, or it becomes `"unknown"`. With no OpenRouter key, those answers are `"unknown"`, so the tool is `held`.

| Verdict | When | What happens |
| --- | --- | --- |
| `blocked` | Any red flag: lookalike of a known brand, no privacy policy, site under 6 months old asking for a download, on Google's unsafe list | Badge `blocked`. Never shown. |
| `held` | No red flag, but a must-pass check (`whoIsBehind`, `privacyPolicy`, `dataUse`, `securityBasics`, `redFlags`) isn't `pass` | Stays in review. **Can't be approved.** |
| `ready` | All must-pass checks pass | Badge `listed`. Warnings (`domainAge`, `dataLocation`, `pricingClarity`) are shown. |

### `approveTool(record, reviewer, date)`

The only way to make a tool `verified`. Returns `{ ok: false, reason }` unless `record.safetyCheck.verdict === "ready"`. The catalog checker also rejects any `verified`/`listed` tool whose verdict isn't `ready`.

### Saved results and the script

- `data/safety/<toolId>.json`: the saved fact sheet for each catalog tool, so the demo never needs the internet or the AI. `loadFacts(id)` in `lib/safety/saved.ts` reads one.
- `npm run safety:check -- <url> [--id <toolId>] [--name "<name>"] [--sensitive]` runs the check and prints it in plain English. `--id` saves the fact sheet (and reuses earlier AI answers for pages that haven't changed). `--sensitive` = takes payments or health info. Keys come from `.env.local`.

## Coming next (signatures fixed, not built yet)

```ts
applyRules(profile: BusinessProfile, tools: CatalogTool[])
  → { allowed: CatalogTool[]; excluded: { tool: CatalogTool; rule: string; reason: string }[] }

// checkTool is built: see "Safety Check" above. The review queue for unknown URLs comes with discovery (problem 8).

getHelpForCounty(county: string)
  → { sbdc: { name: string; url: string }; score: { name: string; url: string } } | null
```
