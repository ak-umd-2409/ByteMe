# Frontend Handoff: Parts 2 & 3 (Onboarding → Problems)

A working reference UI is at **`/demo`** (`npm run dev`, then open `http://localhost:3000/demo`). It runs on two real Maryland businesses with no API keys. This doc explains the decisions behind it, so the final screens can be built (or the demo promoted) without losing them. Backend contract: `docs/PARTS_2_3_API.md`.

| File | What it is |
| --- | --- |
| `app/demo/page.tsx` + `demo.module.css` | The full flow: Find → Check → Problems → Tools (Part 4) |
| `components/parts23/ProblemCardView.tsx` | One problem as a ledger row that expands into proof → counter-evidence → math → first step |
| `components/parts23/ImpactCalculator.tsx` | The estimate as an editable equation; the server does every calculation |
| `components/parts23/charts.tsx` | `OpportunityChart` (range bars), `StrengthBars`, `ListingsMatrix` |
| `components/parts23/primitives.tsx` | `EvidenceMeter`, `SourceChip`, `FactField`, `EvidenceList`, `CounterEvidence` |
| `components/parts23/parts23.module.css` | Tokens, type scale and every component style (one file) |
| `lib/client/parts23.ts` | Typed `api.*` client, `ApiError` with owner-safe messages, `fmt` helpers |

Aditya's `app/page.tsx` and `app/globals.css` are untouched. `/demo` is a separate route.

---

## 1. What the research says, and what we did with it

**Owners don't distrust AI because of cost. They distrust it because they can't tell when it's right.** 2026 surveys of US small businesses put knowledge, relevance and accuracy ahead of cost: Bluehost found only 5% name cost as their biggest worry, Bluevine found 31% cite accuracy, and Intuit lists privacy and accuracy first. → Every finding sits next to its proof, and every proof links to where it was seen.

**Calibrated trust, not maximum trust** (Google PAIR). → Three honest evidence levels ("Strong evidence", "Some evidence", "Not confirmed") shown as a 3-bar meter plus words. Unconfirmed problems get their own section ("Worth checking") and never count toward totals. When reviews contradict a guess, the UI shows that counter-evidence instead of hiding it.

**Show sources** (NN/g: annotate AI output with references). → A "Real public data, captured Nov 7, 2026. 10 sources" control on every screen opens the full source list, each with its URL and what it was used for.

**Progressive disclosure** (Nielsen). → Problem rows are two lines plus tags when collapsed. Proof, math and ranking appear only when opened. Only the top problem starts open.

**Don't compete for attention you haven't earned** (Linear's 2026 refresh). → One accent color, no shadows, no gradients. Hierarchy comes from type weight and spacing, not boxes.

**Simple default, judgment underneath** (Ramp's 80/20 design principle). → Owners who never touch the math still see honest, labelled estimates. Owners who do tap a number and answer one plain question.

**Accessible color is designed, not checked later** (Stripe). → Every token has a measured ratio (§4).

Anti-patterns we avoided on purpose: chatbot-first flows, KPI tile walls, identical card grids, AI gradients and glass, decorative motion, jargon ("signals", "confidence score 0.95"), and caps eyebrow labels.

## 2. Non-negotiables

1. **A money figure never appears without "est."** and the label "Estimated opportunity — not proven lost revenue" nearby. Totals carry `discovery.disclaimer`.
2. **The browser never calculates money.** Every number comes from `/api/problems/discover` or `/api/problems/impact`.
3. **Unconfirmed problems are separate,** labelled "Not confirmed", left out of totals, and sent to Part 4 only if the owner taps "Yes, it does" (recorded as something the owner told us, never as found evidence).
4. **Status is never color alone:** bars plus words.
5. **Real data shows its provenance;** sample data shows a persistent notice.
6. **Summaries are never styled as quotes.** Exact excerpts get quotation marks. Summaries are prefixed "Summary:".
7. **Owner edits win** and are labelled "You told us".
8. **Counter-evidence is shown,** not hidden, wherever `counterEvidence` is present.

## 3. Screens (as built in `/demo`)

The step label sits top right ("Step 3 of 4: What may be costing you") above a thin progress rule. There's no percentage.

**1. Find.** Headline: "See what may be costing your business customers." Name and town fields with a "Find my business" button. Results are full-width rows. "Try a real Maryland business" offers two chips. Below that, "Three quick questions": budget, whether they want setup help, and up to two goals. Nothing else is asked up front.

**2. Check ("Is this right?").**
- The business name as the page title, the address, and the provenance control.
- Four editable facts (phone, website, type, hours), each with a source chip. If listings disagree on hours, an amber prompt asks "Which is right?" with each version as a chip.
- An "about" strip of linked facts: founded, owner, license, fees.
- **Where you're listed:** a matrix with listings as rows and hours, address, phone and service claims as columns. ✓ means it matches the most common value; ≠ means it differs (amber); "Not shown" is neutral. Headlines of the mismatches sit below.
- **What customers say:** praise themes as bars with counts, plus complaints if any.
- **Tools you use:** tools we could confirm, each saying where we saw it, and a chip list of tools that can't be seen from outside.
- Primary action: "Looks right. Find problems".

**3. Problems.**
- **Headline from `overview.headline`,** for example "We found 1 free fix and 1 problem a tool could help with."
- **Where the money may be:** one row per evidence-backed problem with an estimate. A dot marks the estimate on a bar showing the likely range, on one shared axis. Values are labelled at the end of each row; hover or focus shows the range. The total sits top right with "est. per month, not proven".
- **What's working:** strength bars, so a business with great reviews hears that first.
- **Found with evidence:** a ledger of `ProblemCardView` rows.
- **Worth checking:** unconfirmed problems. Rows that reviews contradict carry a "Reviews suggest otherwise" tag and sort last.
- **Next:** "See tools for these N problems", plus a "Not included, and why" disclosure.

**Problem row (collapsed):** headline, one-line why it matters, the evidence meter, an effort tag ("Free · about an hour" or "Needs a tool"), and the monthly estimate (grey for unconfirmed).
**Problem row (open):**
1. "What we found": the reason and linked evidence. Listing evidence shows the value, then "Shown on: BBB, Yelp…".
2. "What customers say against this", when present.
3. "Does this happen at your business?", for guesses only.
4. "What it may be worth": the equation.
5. "First step".
6. "How we ranked this", collapsed.

**The equation** is the one bold element. It reads `[6 missed / week] × [25% would hire you] × [$300 avg job] × [4.33 weeks / month] = [$1,949 per month]`. Each editable number is a button; tapping it opens one plain question ("Out of 10 people who can't reach you, how many would have hired you?") with "Use my number". The constant has a dashed border and can't be edited. The result block is dark. Edited terms turn green and the caption counts "2 of 3 numbers are yours".

**4. Tools.** Part 4 output: one section per problem, option rows (tag, tool names, why, $/mo), and safety-check exclusions collapsed.

### Edge states

| Situation | What the owner sees |
| --- | --- |
| Website blocks robots | Amber notice; facts come only from search-engine text, and say so |
| No complaints in reviews | "No repeated complaints found." Nothing is invented |
| Only guesses | Headline "No clear problems found yet"; no money chart |
| Listings agree | "5 listings checked. They agree." |
| Places API down / 429 / offline | Inline message from `ApiError.message`; form state kept |

## 4. Design system

**Type:** Public Sans (bundled in `/public/fonts`, OFL; the face of the US Web Design System, civic and plain-spoken, right for "Main Street"). One family. Display 28–38px/700, h2 21px/650, h3 17px/650, body 16px, small 14px, tiny 13px. Tabular figures for every number. Sentence case throughout.

**Color** (measured WCAG contrast):

| Token | Value | Use | Contrast |
| --- | --- | --- | --- |
| `--ink` | `#17302a` | Text | 12.97 on paper |
| `--ink-2` | `#4d5f58` | Secondary text | 6.26 on paper, 6.79 on white |
| `--ink-3` | `#6a7a73` | Captions, axis (white surfaces only) | 4.52 on white |
| `--paper` | `#f5f6f3` | Page background (cool, not cream) | |
| `--accent` | `#255d4a` | Primary button, evidence rule, chart dot (Aditya's brand green) | 7.66 on white |
| `--accent-soft` | `#e6efe9` | "Free" tag, owner-edited term | accent text 6.52 |
| `--amber` | `#8a5a0b` | "Worth checking", differences, counter-evidence rule | 5.18 on its tint |
| `--edge` | `#839189` | Input and control borders | 3.29 on white |
| `--hair` | `#dde2dc` | Dividers only | decorative |

**Shape and space:** radii of 6 / 10 / 14 (controls / rows / panels). Panels are white with a 1px hairline and no shadows. 24px panel padding (18px on phones). 760px reading column, left-aligned. 44px controls and 40px chips (WCAG 2.5.8 asks for 24px).

**Charts** follow one-hue-for-magnitude: a single series, values labelled directly, a recessive axis, and a hover/focus tooltip. The range bar is supplemental (1.63:1); the same range is always available as text.

**Motion:** the progress rule and the row chevron only, both disabled under `prefers-reduced-motion`.

## 5. Data the UI reads

Everything is deterministic and comes from the API. No paragraphs are generated in the browser.

| UI element | Field |
| --- | --- |
| Problems headline | `discovery.overview.headline` |
| Row line 1 / 2 | `display.headline` / `display.whyItMatters` |
| Meter | `status` (`confirmed` 3 bars, `likely` 2, `hypothesis` 1) |
| Effort tag | `display.effort.label`, with `kind === "free"` styled green |
| Proof | `evidence[]`: `quote` (exact), `summary` (labelled), `observation`, `attribution`, `links[]`, `reference.url` |
| Against | `counterEvidence.label`, `.examples[]` |
| Equation | `impact.terms[]` (`short`, `value`, `unit`, `source`, `question`, `min`, `max`), `impact.monthly` |
| First step | `display.nextStep` |
| Strengths | `overview.strengths` / `reviews.praise` |
| Listings matrix | `analysis.listings.fields`, `.listings[].services`, `.issues` |
| Provenance | `analysis.snapshot.capturedAt`, `.sources[]`, `.about[]` |

## 6. API integration

```ts
import { api, ApiError } from "@/lib/client/parts23.ts";

const { matches } = await api.search("Frederick Heating");
const analysis = await api.analyze({ placeId: matches[0].placeId, owner: { monthlyBudget: 200, goals: ["more_customers"] } });
const { profile } = await api.confirm({ profile: analysis.profile, corrections: { business: { hours: ["Mon–Fri 7 AM–7 PM"] } } });
const { discovery, recommendationInput } = await api.discover({
  profile,
  reviews: analysis.reviews,
  website: analysis.website,
  listings: analysis.listings, // enables the listings findings
  assumptions,                 // per problem: the owner's numbers from the equation
});
if (recommendationInput.ok) await fetch("/api/recommend", { method: "POST", body: JSON.stringify(recommendationInput.request) });
```

## 7. Done checklist

- [ ] Every $ has "est." and its label; the total carries the disclaimer
- [ ] No arithmetic in the browser
- [ ] Guesses are separate, out of totals, and show counter-evidence when present
- [ ] Provenance visible for real data; sample notice for mock
- [ ] Summaries never in quotation marks
- [ ] Keyboard-only pass; 390px phone pass; contrast per §4

## Sources

- [Bluehost: State of Small Business AI Confidence 2026](https://bluehost.com/state-of-small-business-AI-confidence-2026)
- [Bluevine 2026 Business Owner Success Survey (via ABC17)](https://abc17news.com/?p=1632351)
- [Intuit QuickBooks 2026 AI Impact Report (PDF)](https://digitalasset.intuit.com/render/content/dam/intuit/sbseg/en_us/Blog/Downloadable-assset/2026-ai-impact-report.pdf)
- [Google PAIR: Explainability + Trust (PDF)](https://pair.withgoogle.com/chapter/People%20+%20AI%20Guidebook%20-%20Explainability%20+%20Trust.pdf)
- [NN/g on annotating AI output with sources (excerpt)](https://yourexitbuddy.blogspot.com/2024/08/should-you-consider-magic-8-ball.html)
- [Progressive disclosure, Nielsen 1995 (Pendo summary)](https://www.pendo.io/pendo-blog/onboarding-progressive-disclosure/)
- [Linear: Behind the latest design refresh](https://linear.app/blog/behind-the-latest-design-refresh)
- [Ramp: Product Designer role (design for the 80/20)](https://careers.redpoint.com/companies/ramp-2/jobs/39631703-product-designer)
- [Stripe: Designing accessible color systems](https://stripe.com/it-ca/blog/accessible-color-systems)
- [WCAG 2.2 SC 2.5.8 Target Size (Minimum)](https://kb.daisy.org/publishing/docs/wcag/target-size-minimum.html)
