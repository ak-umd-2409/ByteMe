# MainStreet AI: project audit and plan

Nov 7, 2026 · main @ `565ff46` (after PR #20) · live: https://byte-me-mu.vercel.app

How this was checked: every module read; 469 automated tests run; the live site and its APIs called directly from a browser; local production builds walked through headlessly at desktop and phone sizes. "Works" below means **tested**, not "the code exists".

---

## 1. The headline findings

1. **Production runs with no Google Places key and no AI key.** The live API reports `places: "public_snapshot", llm: "off"`. Owners can't look up their own business: only 2 saved Maryland HVAC businesses exist.
2. **Search silently substitutes saved data.** On the live site, searching "pizza Frederick MD" returns the two HVAC businesses, because the saved-data search matches the town. This is exactly "silently substituting mock data". **Critical.**
3. **Every recommended tool is fictional.** The catalog that recommendations come from is `data/catalog/sample.json`: 8 made-up tools on `.example` domains. "Ways to fix it" shows them with a **✓ Verified** stamp and no "sample" label (the label only appears on the detail page). The landing page's "3 tools checked and approved" and its Ringwise preview are also these sample tools. The real catalog (89 real tools listed, the card-filler built and trialled at about $0.002 per tool) hasn't been built, approved and combined yet. **Critical.**
4. **Step 8, "how to implement it", is mostly missing.** Owners get a one-line "first step" per problem and links to SBDC and SCORE. There is no setup plan they can follow or take away (spec §5.1, 5.2, 5.5).
5. **The review queue and storage aren't configured in production.** `/admin` is locked (no `ADMIN_TOKEN`), decisions have nowhere to be saved (no Upstash), and the weekly job has no `CRON_SECRET`.
6. **The AI layer is well built but not live.** It uses OpenRouter, JSON mode, schema validation, fallbacks and an hourly call cap. But its cache lives in server memory (lost on every cold start), and nothing tracks dollars spent against the $25.
7. **Two old prototypes are still public.** `/classic` (the first home page) and `/demo` show the older, busier flow, including dollar figures built only on industry defaults. A judge who finds them sees two competing products.

---

## 2. Feature-by-feature status

✅ works and tested · 🟡 partly works · 🧪 mock or sample data · ⛔ missing · 🔑 needs a key or service

| Area | Status | What's true today |
| --- | --- | --- |
| Business search | 🔑🟡 | Google Places (New) Text Search is implemented and cached for 10 min. Without a key: 2 saved businesses, plus the false-match bug above. |
| Business details | 🔑🟡 | Place Details: name, address, phone, hours, website, rating, up to 5 Google reviews. Implemented; not live. |
| "Not listed? Enter it yourself" | ✅ | Name, town and website; Maryland only. |
| Website analysis | ✅ | Up to 6 public pages, robots.txt respected, private addresses blocked. Finds contact options, booking, hours, policies and services. AI extraction is optional. Works on Vercel (it has network access). |
| Technology detection | ✅ | Signature matching on HTML (Squarespace, Square, Jobber…), with the evidence URL. |
| Reviews | 🟡 | Google gives at most 5. Owners can paste more. Themes are found by rules, with optional AI. The 2 saved businesses have 14–23 attributed public reviews. |
| Listings consistency (hours, phone, address across sites) | 🟡🧪 | Full only for the 2 saved businesses (BBB, Yelp and Angi captured by hand). A live business compares Google with its website only. |
| Problem discovery | ✅ | 9 problem types from deterministic signals. Confirmed / likely / guess, counter-evidence, overlaps folded together, every item sourced. |
| Money impact | ✅ / 🟡 | Owner journey: shown only from the owner's own numbers, with the math and assumptions. **`/classic` and `/demo` still show default-only dollar figures.** |
| Owner journey (find → check → questions → results) | ✅ | Guided flow, one question at a time, 27 tests. |
| Maryland rules | ✅ | 5 sourced rules. Shown only where they change a decision (call recording, tool detail). |
| Location / SBDC office | ✅ / 🟡 | All 24 Maryland jurisdictions map to an SBDC region. Census figures exist for Frederick County only (not shown to owners). |
| Tool catalog | 🧪⛔ | **8 fictional sample tools.** 89 real tools are listed; the card-filler and Safety Check are implemented and were trialled on 3 real tools; no real cards are approved yet. |
| Safety Check | ✅🔑 | Who's behind it, domain age (RDAP), privacy policy, data use (AI answers with word-for-word quotes), pricing, red flags, optional Safe Browsing. The AI part needs `OPENROUTER_API_KEY`. |
| Discovery and review queue | ✅🔑 | Implemented (PR #20). Production needs `ADMIN_TOKEN`, Upstash and `CRON_SECRET`. |
| Recommendation engine (Aditya, Part 4) | ✅ | Deterministic Fit Score; Verified tools only; Starter Kit, lowest cost, use what you have, done for you. Reads the live catalog. |
| Screens 5–7 (Rishabh) | ✅ / 🧪 | Ways to fix it, tool detail and Compare work. **They show sample tools as Verified** (see §1.3). |
| Official product links | 🟡 | On the tool detail page only, and for sample tools they point to `.example` domains. |
| "We connect it for you" vs "you set it up" | ⛔ | Never stated. **Truth: MainStreet AI connects to no tool.** The owner adopts every tool themselves; "works with Square" describes the vendor's own integration. |
| Implementation plan (step 8) | ⛔ | Only a "first step" line and help links. |
| AI usage (OpenRouter) | ✅🔑 | Website extraction, review themes and problem wording in the owner flow; card-filler and Safety Check offline. JSON mode plus schema validation, rule-based fallback. **Cache is in memory; no spend tracking.** |
| Caching and rate limits | 🟡 | In memory, per server instance (fine for a demo; resets on cold start). |
| Errors and logging | ✅ | One error shape, plain messages, structured logs, no secrets logged. |
| Tests | ✅ | 469 unit and integration tests. No browser test in CI (walkthroughs run by hand). |
| Deployment | 🔑 | Vercel production from `main`. Missing environment variables: see §5. Preview links are behind Vercel login (only Aditya can change that). |

---

## 3. UX review (first-time owner)

What already works after PRs #11 and #19:
- One clear job per screen.
- Questions one at a time, each saying why it's asked.
- Results with proof one tap away.
- Assumptions said out loud.

This follows the patterns that make Stripe's and Mercury's onboarding feel short (ask only what can't be looked up, say why) and Linear's restraint (one primary action, everything else quiet).

What still breaks trust or the flow:

| # | Problem | Fix |
| --- | --- | --- |
| U1 | Search returns unrelated businesses when Google isn't connected | Name-only matching for saved data; say plainly when live search is off |
| U2 | Fictional tools look real ("✓ Verified", landing stats, landing preview) | A "Sample" stamp everywhere a sample tool appears; landing counts only real tools; a switch to hide samples once real tools are approved |
| U3 | Recommendations don't say who does the setup, or where to buy | On every option: "You set this up · official site ↗", how it connects to your tools (built in / via Zapier), setup time |
| U4 | The journey ends at a list of tools; nothing to act on | **"Your plan"**: a short, printable checklist with free fixes first, then the chosen tool's setup steps, then who helps (the county's SBDC office) |
| U5 | Two old prototypes compete with the real product | Remove `/classic` and `/demo` (with the team's OK), or label them "old prototype" and hide them from search engines |
| U6 | When live AI or Google fails, the owner isn't told what's missing | A small "what we couldn't check" line on the check screen (e.g. "Google reviews unavailable") |

---

## 4. Prioritized TODO

### Critical (a working, honest prototype)

| # | Task | Who | Needs |
| --- | --- | --- | --- |
| C1 | Fix saved-data search matching; tell owners when live search is off | Kushal (Claude) | — |
| C2 | Label sample tools everywhere; landing counts only real tools; `CATALOG_SAMPLES=hide` switch | Kushal (Claude) + Rishabh to review | — |
| C3 | Add the keys and services on Vercel (§5) | **You / Aditya** | Google Cloud billing, OpenRouter key, Upstash |
| C4 | Build, approve and combine the real catalog (batch 1: 25 tools) | **Rishabh** (scripts exist) or the `/admin` queue once C3 is done | OpenRouter key; about $0.05 |
| C5 | "Your plan": the step-by-step setup guidance (step 8) | Kushal (Claude) | — |
| C6 | Full live test on a real Maryland business once C3 is done | Kushal (Claude) | C3 |

### High (hackathon quality)

| # | Task |
| --- | --- |
| H1 | Recommendations: official link, "you set this up", connection type, honest "no checked tool yet" state |
| H2 | AI: a cache that survives restarts (Upstash), a dollar spend tracker with a hard stop (default $20 of the $25), and the measured model as the default |
| H3 | Retire or label `/classic` and `/demo` (team decision) |
| H4 | "What we couldn't check" line when Google, website or AI is unavailable |
| H5 | Edge-case tests: no website, unreachable website, no reviews, no problems found, no verified tool, AI failure |

### Medium (if time permits)

- M1: AI-written personalised plan wording, with the deterministic plan as the fallback.
- M2: Listings check for live businesses beyond Google and the website (needs permitted sources; Yelp Fusion has its own terms).
- M3: Census figures for more counties.
- M4: Browser end-to-end test in CI.
- M5: Spanish toggle.

---

## 5. Keys, services and costs

| Service | What it powers | Env var(s) | Cost for a hackathon demo |
| --- | --- | --- | --- |
| **Google Places API (New)** | Real business search and details (up to 5 reviews) | `GOOGLE_PLACES_API_KEY` | Needs a Google Cloud project with billing on. Our search requests rating fields (Text Search Enterprise tier: 1,000 free calls a month, then about $35 per 1,000). Details with reviews is the Enterprise + Atmosphere tier (1,000 free a month). Results are cached 10–30 min. **Expected: $0** under a few hundred lookups. |
| **SerpApi** (optional) | Google review text when the Google project has no billing and Places sends ratings only | `SERPAPI_KEY` | Free plan: 250 searches a month, one per business looked up. Only called when Google sent no reviews; results cached 30 min and labelled "Google (via SerpApi)". If the searches run out, the check carries on without reviews. **Expected: $0.** |
| **OpenRouter** | AI extraction and wording (owner flow), card-filler and Safety Check (catalog) | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_STRONG_MODEL` | Measured by Rishabh: about $0.002 per tool card with `anthropic/claude-haiku-5.5`, so about $0.20 for 80 tools. Owner analysis is about 3 calls and roughly 15k tokens, about $0.003 per business. **Expected: under $2 of the $25.** |
| **Upstash Redis** (Vercel Marketplace) | Review queue, decisions, AI cache and spend tracking | `KV_REST_API_URL`, `KV_REST_API_TOKEN` (added automatically) | Free plan |
| Reviewer code | Locks `/admin` | `ADMIN_TOKEN` | Free |
| Weekly job | Discovery and re-checks | `CRON_SECRET` | Free (Vercel Cron) |
| Google Safe Browsing (optional) | Extra red-flag check | `GOOGLE_SAFE_BROWSING_API_KEY` | Free |
| Journey token signing (optional) | Tamper-proof session token | `JOURNEY_SECRET` | Free |

**No direct tool integrations exist or are planned for the demo.** Connecting to Square, QuickBooks or Google Business Profile on an owner's behalf would need OAuth apps and the owner's permission. We say so in the product instead of implying it.

---

## 6. Stages

1. **Stage 1 (no keys needed):** C1, C2, C5, H1, and the H4 groundwork, with tests.
2. **Stage 2:** H2 (AI cache, spend tracker, model default) and H5 tests.
3. **Stage 3 (after you add the keys):** C6, a live end-to-end run on a real Maryland business via the Vercel deployment, with fixes from what it finds. Then C4 with Rishabh.
4. **Stage 4:** H3 after the team decides, then the medium items.

---

## 7. Progress

| Stage | Status | PR |
| --- | --- | --- |
| 1: honest search, sample labels, clear fixes, "Your plan" | Done, tested | #21 |
| 2: AI cache that survives restarts, dollar cap, live-services panel, "what we couldn't check", edge-case tests | Done, tested | #22 |
| 3: live end-to-end on a real Maryland business | Waiting for keys (§5) | — |
| Part 5 (setup and handoff): 30-day plan, ready-to-use words, send to SBDC advisor, email, free money and help | Done, tested (§8) | #23 |
| Homepage, onboarding entry and Business Advisor (research-backed) | Done, tested (§9) | #28 |

**AI model choice.**
- **Owner flow:** stays on `openai/gpt-4o-mini`. It's a non-reasoning model, its JSON is reliable within the 900-token replies these tasks use, and it costs $0.15/$0.60 per million tokens.
- **Catalog and Safety Check:** use `anthropic/claude-haiku-5.5` (`OPENROUTER_STRONG_MODEL`). Rishabh measured it at about $0.002 per tool; it needs the larger reply limits the catalog code already sets.
- **Spending:** every call's actual cost (OpenRouter's `usage.cost`) is added up. AI stops at `LLM_BUDGET_USD` (default $20). Answers are saved for a week in Upstash, so the same page is never paid for twice.

---

## 8. Part 5: setup and handoff (FEATURE_SPEC §5)

| # | Feature | Status | Where |
| --- | --- | --- | --- |
| 5.1 | 30-day setup plan | Done. Free fixes in week 1, then one tool at a time, each checked two weeks after setup; whatever doesn't fit goes under "After day 30". | `lib/plan/plan.ts` (`schedule`), `app/plan/parts.tsx` (`Weeks`) |
| 5.2 | Pre-written words | Done. Phone greeting, after-hours message, answers to common questions and 3 review replies, each with a Copy button. Built only from facts we hold; anything only the owner knows is a [blank]. The greeting announces recording only when a chosen tool records calls (Maryland two-party consent). | `lib/plan/content.ts` |
| 5.3 | Get help | Done. SBDC office for the county plus SCORE. The "vetted helper" listing isn't built: there are no vetted helpers to list yet. | `lib/plan/plan.ts` |
| 5.4 | Send my plan to my SBDC advisor | Done. A read-only link at `/plan/<id>`, saved in Upstash for 30 days and hidden from search engines. Without Upstash, the link carries the plan after "#" (never sent to a server log) and opens at `/plan/view`. Either way the server rebuilds the plan from the signed journey context, so an edited link can't show a different plan or an unreviewed tool. The advisor view adds "Worth talking through": sample tools, prices that aren't public, call recording, open decisions and problems we couldn't confirm. | `lib/api/plan.ts`, `lib/plan/share.ts`, `app/plan/` |
| 5.5 | Print / email my plan | Done. Print or save as PDF; "Email the plan to myself" opens the mail app with a short text version (and the saved link, when there is one). | `lib/plan/plan.ts` (`planText`) |
| 5.6 | Spanish toggle | Not started. Needs every screen's text in one place first; best done with Rishabh since most of it is his screens. | — |
| 5.7 | Free money and help | Done, with 4 links (SBDC classes, SBA Lender Match, Maryland funding programs, Frederick County OED). Each was found on an official page or document, and says where. Other counties get the statewide links only until someone checks theirs. | `data/resources/maryland.json` |
| 5.8 | Day-7 / day-30 check-ins | Not started (16-week plan). Needs a way to reach the owner later (email sign-up), which we don't collect. | — |

**Tested:** 8 new unit tests (`lib/plan/part5.test.ts`: weeks, links per county, ready words, saved and "#" links, storage failure, edited links). A browser run on desktop and phone covered the whole flow from search to plan: copy, email links, a saved link through a local stand-in for Upstash, the advisor opening it, a missing link, the "#" fallback and a broken link.

**Not yet tested live:** saved links on Vercel need Upstash (the same `KV_REST_API_URL` / `KV_REST_API_TOKEN` as the review queue). Until it's added, the site uses the long "#" links.

---

## 9. Homepage, onboarding and Business Advisor

Research behind it: `docs/RESEARCH.md`. Advisor design: `docs/ADVISOR.md`.

| Piece | Status | Real or illustrative |
| --- | --- | --- |
| Homepage at `/` | Done. Hero with the business-name box, problem section, how it helps, how it works, trust, examples, advisor and final call to action | Preview is a **real** result built from the saved Frederick Heating public data. Quotes and figures are real, verified and linked. The HVAC example is a real finding; the other four are labelled **illustrative**. Every tool shown is a real checked tool with its catalog price. |
| Onboarding entry | Done. The homepage name box opens `/start` and searches straight away; "see a real example" opens the saved business; `/start` opens on "Find your business" | Live search needs `GOOGLE_PLACES_API_KEY`; without it, the saved Maryland businesses are offered and labelled |
| Questions | Unchanged: up to 4, one at a time, skippable, accurate count. The goals question stays because it breaks ties when ranking problems | — |
| Business Advisor | Done: `/advisor`, the side panel in the journey, `POST /api/advisor` | With `OPENROUTER_API_KEY` the AI writes each answer from the full business brief and the checked catalog, and the server checks tools, prices and names. With no key, rules-based answers from the same data |

## 10. UX redesign (feat/ux-redesign)

Full audit and research: the "MainStreet AI: UX audit and redesign direction" doc. What changed:

- **Brand and frame.** New logo (shopfront awning with the advisor's spark) and wordmark in `app/ui/Site.tsx`. One cream, translucent header with a hairline border on every page, replacing the sage bar. Minimal nav: Checked tools, Advisor, Get started. Inside the guided flow the header shows only "Start over", so nothing pulls the owner out mid-task. One footer.
- **Homepage** (`app/home`): 1,615 → about 740 words; 6,287 → 4,500 px on desktop, 12,022 → 7,300 px on a phone. Hero with one sentence, the name box and a trust row above the fold, next to a real result. Three research cards pair a survey figure with one owner's words and our answer. Three steps. Interactive industry tabs (HVAC real; the rest labelled illustrative; real checked tools only). Advisor section with a real answer. A four-number trust strip.
- **One visual language.** One button shape (pill; solid burgundy for the next step, outlined for the rest), no offset shadows, cards on one cream surface with a hairline edge, no sage header bands, softer badges, calmer inputs, a fade instead of a slide between screens.
- **Fewer things at once.** Check screen names the common source once instead of on every row. Results show problems first; the optional "something else" box and the answers/assumptions list are collapsed. Plan shows one ready-made text at a time (all of them print) and the top two help links before "more". Advisor shows four starter questions, not eight. Shorter live-search notice. Catalog shows "Checked Nov 8, 2026" and "Price on request".
- **Ask the advisor, everywhere.** The floating pill (cream, ink border, ✳, serif) is on the homepage, catalog, tool pages, plans and every journey screen except loading. It knows the business when the owner has results in this tab, says who it's advising in the panel header, lifts above sticky action bars, and returns focus to the pill when closed.

Coordination: `app/start/ToolScreens.tsx` is Rishabh's. It's restyled only through the shared CSS, plus three small fixes: the 120-minute ranking placeholder is no longer shown as a setup estimate (all 18 real tools have unknown setup time), the "Fit 66.7 of 100" score is replaced by the plain reason, and a cancellation term of "unknown" is no longer printed. No changes to `lib/recommend`, `lib/catalog`, `globals.css` or `/classic`.
