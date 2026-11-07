# Frontend Handoff: Parts 2 & 3 (Onboarding → Problems)

For whoever builds the screens between the catalog/safety check (Part 1) and recommendations (Part 4).
The backend is done (`docs/PARTS_2_3_API.md`). This doc covers **what to build and how it should feel**.
It is a handoff, not a finished UI.

What's already in the repo for you:

| File | What it is |
| --- | --- |
| `lib/client/parts23.ts` | Typed `api.*` client, `ApiError` with owner-safe messages, `fmt` helpers |
| `components/parts23/primitives.tsx` | `StatusBadge`, `SourceChip`, `FactField` (inline edit), `EvidenceList` |
| `components/parts23/ImpactCalculator.tsx` | Editable inputs → server recalculation, debounced, cancellable |
| `components/parts23/ProblemCardView.tsx` | Full problem card: summary line, evidence, calculator, ranking |
| `components/parts23/parts23.module.css` | Tokens that extend `app/globals.css`, contrast-checked |

These typecheck, pass `next build`, and were rendered with real mock-mode discovery output to check them. They are a **starter**: wire them into pages, restyle freely, keep the rules in [Non-negotiables](#non-negotiables).

---

## 1. What the research says (and what we take from it)

**Owners don't distrust AI because of cost. They distrust it because they can't tell when it's right.**
US small-business surveys from 2026 agree on this. Bluehost's study of 350 owners found
knowledge gaps and "not specific to my business" were the top barriers, with only 5% naming cost as their biggest worry.
Bluevine's survey of 942 owners found 31% cite a lack of trust in AI's accuracy.
Intuit's 2026 report likewise lists privacy, accuracy and limited knowledge ahead of cost.
→ **Every claim we show must carry its proof next to it.** "Your callers hit voicemail" with the quote underneath beats a 92% score.

**The goal is calibrated trust, not maximum trust.** Google's PAIR guidebook says users shouldn't trust an AI system completely,
and explanations should help them judge when to rely on it and when to use their own judgment.
→ We show three honest states (Confirmed / Likely / Not confirmed). "Not confirmed" is a first-class state with its own section, not hidden.

**Show sources, don't hide them.** NN/g recommends attaching references to AI output, such as inline citations or a "see sources" control, so people can check it.
→ Evidence comes first in the expanded card, before the money, and each item says where it came from ("Google review", "Your website · view page").

**Reveal complexity in steps.** Progressive disclosure, from Nielsen in 1995, shows only what's needed now and moves advanced options to a secondary place. It helps learnability, efficiency and error rate.
→ Cards are one line by default. Evidence, calculator and ranking appear on "Why we think this". The onboarding form asks three questions, not twenty.

**Don't compete for attention you haven't earned.** Linear's 2026 refresh was built on that principle: smaller icons, muted inactive text, fewer borders.
Their earlier redesign also stressed keeping information dense without making it feel overwhelming.
→ One accent color, used for the primary action and the evidence rule. No decorative color, no gradients.

**Make the default path simple and put the judgment underneath.** Ramp's product design hiring describes designing for the 80/20:
encode judgment and complexity under the hood while the default stays simple for most customers.
→ Owners who never touch the calculator still get honest numbers. Owners who want to can change every input.

**Accessible color has to be designed, not checked afterwards.** Stripe rebuilt its color system so text and icons in the Dashboard reliably have legible contrast.
→ Every token below has a measured ratio. Two existing tokens fail as text; see [Color](#color).

**Show AI edits as edits.** Notion AI shows deletions and additions as a visual diff.
→ When the LLM rewords an explanation (`explanationSource: "llm"`), say so in small text. Never let it look like a human wrote it.

**Mercury** is praised by small-business reviewers mostly for simplicity ("Simple, easy to use, intuitive. No BS").
→ Plain words, few screens, no dashboard of charts.

Anti-patterns we're explicitly avoiding (from the brief): AI gradients, glassmorphism, floating cards, decorative animation, KPI walls, chatbot-first flows, jargon.

---

## 2. Non-negotiables

These come straight from backend guarantees. The UI must not undo them.

1. **A money figure never appears without its label.** Show `impact.label` ("Estimated opportunity — not proven lost revenue") next to the number, every time. Show `discovery.disclaimer` next to any total.
2. **The browser never calculates money.** Every number comes from `/api/problems/discover` or `/api/problems/impact`. No client-side arithmetic, rounding of totals, or "projected yearly" × 12.
3. **Hypotheses look different and sit separately.** Section heading "Might apply — tell us", dashed evidence rule, "Not confirmed" badge, no money total. They only go to Part 4 if the owner taps "Yes, it does" (`includeHypotheses`).
4. **Status is never color alone.** Badge = glyph + word (● Confirmed, ◐ Likely, ○ Not confirmed).
5. **Sample data is always labelled.** If `sampleData` is true or `mode.places === "mock"`, show a persistent banner: "You're looking at a sample business. Nothing here is real."
6. **Show confidence as words plus the reason** (`confidence.reason`, e.g. "Based on 3 customer reviews, 1 website finding"). Don't show `0.95`.
7. **Owner edits win.** After an edit, the field's chip changes to "You told us". Never silently overwrite an owner value with a fresh scan.
8. **Google attribution.** When showing Google review text, show the author name (`author`) as Google requires. Don't store Places content beyond the session (see [State](#5-frontend-architecture)).

---

## 3. Screens

Flow: **Find → Reading → Check → Problems → (detail) → Recommendations (Part 4)**. A thin step indicator at the top ("Step 2 of 4: Check what we found"), with no percentage bar.

### 3.1 Find your business

**Goal:** get a `placeId`, or a name + town if they're not on Google.

- One text field ("Business name") + one optional field ("Town or ZIP"). Search on submit, not on keystroke (it costs Google quota; limit 30/min).
- Results: up to 5 rows → name (bold), address, category · ★ 4.3 (87). The whole row is the button, at least 48px tall.
- Below the results, always: "Not listed? Enter it yourself" → manual form (name, category, town, state, website). This is also the fallback when search returns `[]` or `502 places_unavailable` ("Google search isn't working right now. You can enter your details instead.").
- Optional, collapsed: "Paste a few reviews from Yelp or Facebook" textarea (blank line between reviews; up to 30). This is the only way to analyze non-Google reviews.
- **Three owner questions on this screen** (they unlock Part 4): monthly budget (number, $), "Do you want someone to set it up for you?" (Yes / I'll do it myself → `techComfort`), and up to two goals (chips). Everything else is asked later only if needed.

API: `api.search(q, near)` → `api.analyze({ placeId | manual, pastedReviews, owner })`.

### 3.2 Reading your business (wait state, 1–8 s)

**Goal:** make the wait feel honest, not magical.

- A checklist of the real steps, ticking as they finish: "Google listing" → "Your website (up to 6 pages)" → "Customer reviews" → "Tools on your site". The backend runs these in parallel, so tick them together when `analyze` returns. Don't fake staggered timing. A static checklist with a spinner on the whole block is fine.
- No percentage, no "AI is thinking…", no animated orb.
- Cancel button (abort the request with `AbortController`).
- After 15 s, show: "This is taking longer than usual. Some websites are slow." Keep waiting. The server times out each fetch.

### 3.3 Check what we found (profile review)

**Goal:** the owner corrects anything wrong in under a minute, then confirms.

Layout: one column, three groups, each a plain card.

1. **Your business:** name, category, address, phone, hours, website. Each is a `FactField` with a `SourceChip`. Missing values say "We couldn't find this · Add".
2. **What customers say:** top 2 complaint themes and top praise theme, each with one quote and "from N reviews". Show `reviews.limitations` in small text (e.g. Google only gives us 5 reviews).
3. **Tools you use:** detected tools as chips with "Found on your website" + a "view where" link (`evidence[0].url`). Then `askOwnerAbout` as a checklist: "Do you use any of these? We can't see them from outside." Ticked items go to `corrections.currentTools`.

Mismatches deserve a callout, not a buried row. If Google hours and website hours differ, the discovery step produces an `inconsistent_business_info` problem. On this screen show the two values side by side and ask "Which is right?".

Warnings from `analysis.warnings` go in a single neutral notice at the top (not red). Unreachable website → "We couldn't read your website, so we skipped booking and pricing checks."

Primary action: **"Looks right"** → `api.confirm({ profile, corrections })` → `api.discover(...)`.
If `readyForRecommendations` is false, ask for exactly the missing fields (`profile.missingForRecommendations`) inline before continuing.

### 3.4 What's costing you (problem list)

**Goal:** the owner understands their top 2–3 problems and believes them.

- **Summary line** at the top, as one sentence, not tiles: "We found **2 confirmed** and **3 likely** problems. Together they may be worth about **$4,287/month** in missed business (could be $1,014–$10,393)." Then the disclaimer in small text. If the total is 0 or there are only hypotheses, drop the money sentence entirely.
- **Evidence-backed problems**, in `rank.position` order, as `ProblemCardView`. The first is expanded, the rest are collapsed.
- **"Might apply — tell us"**: hypotheses, collapsed, each with "Yes, it does" / "No". "Yes" adds the key to `includeHypotheses` and re-runs `discover`; "No" hides it for this session.
- **"Also noticed"**: problems with `useCase: null` (e.g. inconsistent hours). These are quick manual fixes, so show them as a plain to-do list, not as cards.
- Primary action at the bottom: **"Show me tools for these"** → Part 4 with `recommendationInput.request`. If `recommendationInput.ok` is false, show what's missing.
- Below the button, quietly: what's not being sent and why (`recommendationInput.omitted[].reason`).

### 3.5 Problem detail (expanded card)

Order matters. Proof first, then money, then mechanics.

1. **What we found:** `EvidenceList`, 3 items, then "Show all N signals". Verified items use a solid accent rule; unverified ones a dashed grey rule plus "not directly observed".
2. **What it might be worth:** `ImpactCalculator`. The label sits above the amount. Inputs show "Starting assumption" until edited, then "Your number". The `calculation` string is shown verbatim under the inputs, so the owner can check the arithmetic. "What this assumes" is collapsed.
3. **How we ranked this:** collapsed list of `rank.explanation`.

When the owner edits inputs, keep their `overrides` per problem (`onAssumptions`) and pass them as `assumptions` the next time you call `discover`, so totals and ranking stay in sync.

### 3.6 Handoff to Part 4

`POST /api/recommend` with `recommendationInput.request` exactly as returned (Aditya's endpoint; don't reshape it).
Keep the discovery result in state so "Back to problems" doesn't re-run the analysis.

### Edge states (design each one)

| Situation | What the owner sees |
| --- | --- |
| Mock mode | Persistent top banner (see Non-negotiables). |
| No Google match | Manual form, not an error. |
| Places API down (502) | "Google search isn't working right now", plus the manual form. |
| No website | Notice: "No website found, so we skipped booking and pricing checks." Problems still work. |
| Website blocked by robots.txt | "Your website asks tools like ours not to read it, so we skipped it." |
| No reviews | "What customers say" group shows "No reviews to read. Paste some if you have them." |
| Only hypotheses | No money sentence. Heading: "We didn't find clear problems. Do any of these sound familiar?" |
| 429 rate limited | "Too many tries. Wait {retryAfterSec} seconds." Disable the button with a countdown. |
| Offline | `ApiError.code === "network"`. Inline message, keep form state. |
| 400 invalid | Map `details` (`"owner.monthlyBudget: …"`) to fields; never show raw paths. |

---

## 4. Design system

Builds on Aditya's existing tokens in `app/globals.css` (`--ink`, `--green`, `--cream`, `--line`, `--mint`; DM Sans + Manrope). Don't introduce a second palette.

### Color

Measured WCAG contrast (normal text needs 4.5:1; UI borders and icons 3:1):

| Token | Value | Use | Contrast |
| --- | --- | --- | --- |
| `--ink` | `#203a34` | Body text | 11.72 on cream |
| `--text-2` (new) | `#5c6e67` | Secondary text | 5.18 on cream |
| `--muted` (existing) | `#687a73` | **Don't use for text on cream** | 4.35 ✗ (passes on white: 4.55) |
| `--green` | `#255d4a` | Primary button, links, evidence rule | 7.33 on cream; white on it 7.66 |
| `--orange` (existing) | `#e8a76b` | **Decoration only** | 1.98 ✗ as text |
| `--line` | `#e6e9e2` | Dividers only | 1.17 (decorative) |
| `--border-input` (new) | `#839189` | Input and secondary-button borders | 3.29 on white, 3.15 on cream |
| `--focus` (new) | `#1d6fd1` | 2px focus ring, 2px offset | 4.73 on cream |
| Confirmed | `#1f5c45` on `#e3f1e8` | Badge | 6.73 |
| Likely | `#7a4b0c` on `#fbefd9` | Badge | 6.50 |
| Not confirmed | `#4a5560` on `#eef0f2` | Badge | 6.66 |
| Danger | `#a3342a` on `#fdeceb` | Errors only | 5.96 |

Red appears only for errors the owner must fix. Problems are not errors, so problem cards never use red.

### Type

- Headings: Manrope 600, 18–24px, tight leading (1.3).
- Body: DM Sans 400, **16px minimum**, line-height 1.5. Secondary 14px. Nothing smaller than 12px (chips only).
- Money and counts use `font-variant-numeric: tabular-nums` (`.num`, `.amount`) so figures don't jitter when recalculating.
- Sentence case everywhere. No ALL CAPS labels.

### Spacing, shape, elevation

- 4px base: 4 / 8 / 12 / 16 / 24 / 32. Card padding 24, gap between cards 16, sections 32.
- Radius 8px on cards, inputs, buttons. Pills only for badges and chips.
- **No shadows.** Cards are white on cream with a 1px `--line` border. Depth comes from grouping, not elevation.
- Max content width 720px for these screens. They're reading-heavy single columns, not dashboards.

### Interaction

- Targets: WCAG 2.2 requires at least 24×24px. We use **40px** controls and **48px** list rows because owners will use phones.
- Motion: only 120ms border/opacity transitions, wrapped in `prefers-reduced-motion: no-preference`. No entrance animations, no skeleton shimmer longer than the wait.
- Recalculation: debounce 350ms, dim the amount to 60% while pending, announce via `aria-live="polite"`.
- Disclosure uses real `<button aria-expanded aria-controls>` or `<details>`, never hover.
- Keyboard: every action reachable by Tab; visible focus ring; Escape cancels inline edit.

### Words

Write at a grade 6–8 reading level, in second person.

| Say | Don't say |
| --- | --- |
| "Customers can't book online" | "Lack of digital scheduling infrastructure" |
| "We found this in 3 reviews" | "High-confidence signal cluster" |
| "Starting assumption: replace it with your number" | "Industry benchmark" (they aren't benchmarks) |
| "Might be worth about $1,949 a month" | "You're losing $1,949/month" |
| "Not confirmed" | "Low-confidence prediction" |
| "Tools" | "AI solutions", "stack", "integrations" |

---

## 5. Frontend architecture

- **One client route per step** under the existing app, e.g. `app/start/page.tsx` with `?step=find|check|problems`. Each step is a client component; the page shell can stay a server component.
- **State lives in the browser.** The API is stateless: the client holds `{ analysis, profile, corrections, discovery, assumptions, includeHypotheses }` and sends them back. Use one `useReducer` at the flow level (sketch below), passed down via props or a small context. No global store library (the team rule is no new dependencies).
- **Persistence:** `sessionStorage` only, wrapped in try/catch, cleared on "Start over". Not `localStorage`: the profile contains Google review text, which Google restricts caching.
- **Requests:** always pass an `AbortSignal`; abort on unmount and on a new search. Don't retry automatically except once on network error for `impact`.
- **Errors:** catch `ApiError`; `error.message` is already owner-safe. Map `error.details` paths to fields for 400s.

```ts
type Flow =
  | { step: "find" }
  | { step: "reading"; request: AnalyzeRequest }
  | { step: "check"; analysis: OnboardingAnalysis; corrections: ProfileCorrections }
  | { step: "problems"; analysis: OnboardingAnalysis; profile: OnboardingProfile;
      discovery: DiscoveryResult; recommendationInput: RecommendationInputResult;
      assumptions: Partial<Record<ProblemKey, Record<string, number>>>; includeHypotheses: ProblemKey[] };
```

### API integration examples

```tsx
"use client";
import { api, ApiError } from "@/lib/client/parts23.ts";

// Find → analyze
const { matches, sampleData } = await api.search(name, town, signal);
const analysis = await api.analyze(
  { placeId: matches[0].placeId, owner: { monthlyBudget: 200, techComfort: "needs_help", goals: ["more_customers"] } },
  signal,
);

// Check → confirm → discover
const { profile, readyForRecommendations } = await api.confirm({
  profile: analysis.profile,
  corrections: { business: { phone: "(301) 555-0142" }, currentTools: ["QuickBooks"] },
});
const { discovery, recommendationInput } = await api.discover({
  profile,
  reviews: analysis.reviews,
  website: analysis.website,
  assumptions,          // from ImpactCalculator onChange, per problem key
  includeHypotheses,    // keys the owner said "Yes, it does" to
});

// Problems → Part 4 (Aditya's endpoint, unchanged)
if (recommendationInput.ok) {
  const res = await fetch("/api/recommend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(recommendationInput.request),
  });
}

// Errors
try { /* … */ } catch (e) {
  if (e instanceof ApiError && e.status === 429) showCountdown(e.retryAfterSec ?? 30);
  else if (e instanceof ApiError) showInline(e.message, e.details);
}
```

```tsx
// Problem list
import { ProblemCardView } from "@/components/parts23/ProblemCardView.tsx";

const evidenced = discovery.problems.filter((p) => p.status !== "hypothesis" && p.useCase);
const maybe = discovery.problems.filter((p) => p.status === "hypothesis");

{evidenced.map((p) => (
  <ProblemCardView key={p.id} problem={p} industry={profile.business.industry.value ?? "other"}
    onAssumptions={(key, o) => dispatch({ type: "assumptions", key, overrides: o })} />
))}
<h2>Might apply — tell us</h2>
{maybe.map((p) => (
  <ProblemCardView key={p.id} problem={p} industry={profile.business.industry.value ?? "other"}
    onConfirmHypothesis={(key, yes) => dispatch({ type: yes ? "includeHypothesis" : "dismiss", key })} />
))}
```

---

## 6. Done checklist for the screens

- [ ] Every money figure has its label; the total has the disclaimer
- [ ] No arithmetic in the browser (search the code for `* 12`, `reduce(` on amounts)
- [ ] Hypotheses in their own section, never in totals, only sent to Part 4 when confirmed
- [ ] Sample-data banner whenever `sampleData` / `mode.places === "mock"`
- [ ] Every edge state in the table above has a designed message
- [ ] Keyboard-only run through all four steps
- [ ] 375px-wide phone layout checked; targets ≥ 40px
- [ ] Text contrast ≥ 4.5:1 (don't use `--muted` or `--orange` for text on cream)
- [ ] Google review authors shown; nothing in `localStorage`

## Sources

- [Bluehost: State of Small Business AI Confidence 2026](https://bluehost.com/state-of-small-business-AI-confidence-2026)
- [Bluevine 2026 Business Owner Success Survey (via ABC17)](https://abc17news.com/?p=1632351)
- [Intuit QuickBooks 2026 AI Impact Report (PDF)](https://digitalasset.intuit.com/render/content/dam/intuit/sbseg/en_us/Blog/Downloadable-assset/2026-ai-impact-report.pdf)
- [Google PAIR: Explainability + Trust (PDF)](https://pair.withgoogle.com/chapter/People%20+%20AI%20Guidebook%20-%20Explainability%20+%20Trust.pdf)
- [NN/g on annotating AI output with sources (excerpt)](https://yourexitbuddy.blogspot.com/2024/08/should-you-consider-magic-8-ball.html), original: nngroup.com/articles/ai-magic-8-ball/
- [Progressive disclosure, Nielsen 1995 (Pendo summary)](https://www.pendo.io/pendo-blog/onboarding-progressive-disclosure/) and [summary of NN/g findings](https://www.digitalhill.com/?p=21595)
- [Linear: Behind the latest design refresh](https://linear.app/blog/behind-the-latest-design-refresh) · [Linear 2026 refresh summary](https://www.plushcap.com/companies/linear/blog/summaries/2026/03)
- [Ramp: Product Designer role description](https://careers.redpoint.com/companies/ramp-2/jobs/39631703-product-designer)
- [Stripe: Designing accessible color systems](https://stripe.com/it-ca/blog/accessible-color-systems)
- [Trust & explainability patterns, incl. Notion AI diff](https://janrummel.github.io/ai-product-thinking/en/03-product-design/02-trust-explainability)
- [Mercury reviews on G2](https://g2.com/products/mercury-mercury/reviews_and_filters?page=4)
- [WCAG 2.2 SC 2.5.8 Target Size (Minimum)](https://kb.daisy.org/publishing/docs/wcag/target-size-minimum.html)
