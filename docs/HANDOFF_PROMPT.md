# Claude Code Kickoff Prompt — Team 11 "ByteMe", UMD AI for Small Business Hack-a-thon

> **How to use this file**
> 1. **Repo owner (one person):** create an empty GitHub repo, open Claude Code in it, and paste **PART 1 + PART 2** as the first message. Claude will create the repo foundation (CLAUDE.md, SPEC.md, CONTRACTS.md, types, schema, mock data, design kit stub). Review, commit, push to `main`, connect to Vercel.
> 2. **Each teammate:** clone the repo, open Claude Code, and paste **PART 3 — your role prompt** (A, B, or C). CLAUDE.md and docs/ will give Claude all the context automatically.
> 3. Working product name is **"MainStreet AI"** — change it in SPEC.md after the team brainstorm if you pick something better.
> 4. **All three teammates must have the Superpowers plugin installed in Claude Code** before starting (`/plugin` → install `superpowers`). Every session uses its skills — see "Development workflow (Superpowers)" in Part 1.

---

## PART 1 — Full context (paste this)

You are joining a 3-person team (Team 11, "ByteMe") competing in the **University of Maryland Smith School "AI for Small Business Hack-a-thon" (Fall 2026)**. Each of the 3 teammates runs their own Claude Code session on a shared GitHub repo. Your job in this first session is to **set up the repo foundation** so all three sessions build one coherent, polished product. Read everything below carefully; it is the source of truth.

### The challenge (official brief)
Small businesses (mom & pop restaurants, coffee shops, HVAC techs, landscapers) can benefit from AI but struggle to find the right tools.
**The ask:** Design and build a prototype of a platform to help small businesses **discover, compare and adopt** AI tools — usable by **non-technical** owners to explore AI solutions, select appropriate ones, and deploy them.
Think "Angie's List for AI tools": shows available tools, their rating, cost, and how to engage with them. **Three explicit differences from Angie's List:**
1. Tools need to be **discovered by the platform** (not just a hand-made list).
2. The **rating must go beyond reviews**.
3. A small business may need to **integrate multiple AI tools** for one solution.

### Deliverables — due Sunday Nov 8, 11:59pm ET (team target: 10pm)
- **10-minute video** showing: MVP proof of concept, how we approached building it, how we'd tackle it with 16 weeks, evidence it's technically possible and valuable.
- **Link to a working prototype judges can open and test** (public, no login, no localhost).
- Finalists (9–10 teams, min $1,500 each, up to $25k total) present in person Nov 17. Winners may get paid roles building this platform through Summer 2027.
- All submissions are UMD IP → write fresh code; do not copy from any teammate's personal projects.
- Acknowledge any coaching (faculty/staff/experts) in materials.

### Judging rubric (50 points)
| Criterion | Pts | Meaning |
|---|---|---|
| Depth of research | 10 | Understanding of the type of platform and the needs of small businesses |
| Small Business Applicability | 10 | Serves a **diverse** set of small businesses, **integrates with legacy tech they already use**, leverages **US Small Business Administration (SBA)** offerings |
| Architecture & Scalability | 10 | Architecture/tech choices support more users, data, use cases |
| User Experience | 10 | A first-time, non-technical user can understand it and complete tasks — clarity, intuitiveness, accessibility |
| Demo & presentation | 10 | Polished, clear, every team member visibly contributes |

### What the judges (Dr. Balaji Padmanabhan & Dr. Tej Anand) said in the Q&A — critical
- **Video is king.** Faculty/PhD/advisory judges mostly watch only the video and each picks ~top 4 of ~10. Only the two PIs click every link — and they verify **the link matches the video**.
- **Real code expected**, not Figma/screenshots. Not everything must work; unfinished parts can be labeled "coming soon" and covered in the 16-week plan.
- **Discovery ≠ real-time crawling.** Take a broad meaning of discovery; periodic refresh (weekly/monthly) is fine. **But the platform must not be static** — architecture must show how the catalog grows.
- **Trust & safety is a top concern.** Owners aren't tech-savvy; scam tools from unknown developers can steal their data. If a search returns 50 tools, who built them? The platform must surface *validated* tools and warn about unknown ones.
- **Connect owners to humans who can implement.** Like Angie's contractors: "I found the tools, but I'd rather pay someone to set it up." Surface vetted local helpers (students, SBDC).
- **"What stops OpenAI or Anthropic from doing this overnight?"** — they want teams to answer this.
- Focus: **Main Street and rural Maryland** businesses, but the architecture should serve any small business. Breadth via architecture, depth via the 16-week plan.
- No voice interface needed for the platform itself (but voice AI tools can be in the catalog).
- Success = reduce friction: e.g. an HVAC tech whose phone rings on a job, can't answer, loses the customer — even though an AI answering tool exists. Distribution vision: via Maryland Dept. of Labor and other state agencies.
- Finalists may improve the app before Nov 17. Each team gets a **$25 OpenRouter API key** (team lead).

### Our winning thesis
> **"Every AI search gives a small business owner 50 tools and no idea which are safe. MainStreet AI gives them the 3 that are verified, work with what they already use, and come with someone to help set them up."**

Differentiators: Trust Score (rating beyond reviews), multi-tool **Starter Kit** built around the owner's existing tools, adoption plan + human help (SBDC/SCORE/vetted helpers), and a visible **discovery → verification pipeline** showing the catalog grows.

**Moat answer (for the video):** a chatbot can list tools but can't *verify* them; it doesn't have local distribution (Maryland agencies, SBDCs), a vetted local implementer network, or outcome data on which tools small businesses actually keep using — and that data compounds.

### Product spec — MVP screens
1. **Landing** — one-line promise, "Find my AI tools" button, trust messaging. Mobile-first.
2. **Intake (≤2 min)** — business type, team size, Maryland county (urban/rural), monthly budget, **current tools** (tap logos: Square, Toast, Clover, QuickBooks, Google Business Profile, Gmail/Outlook, Excel, Facebook/Instagram, "paper & phone"), and **problems in plain words** ("I miss calls when I'm on a job"). LLM maps free text → our fixed **use-case taxonomy**; deterministic keyword fallback if the LLM fails.
3. **AI Starter Kit (results)** — 2–4 complementary tools, each tied to one of their problems; total monthly cost; "works with your Square/QuickBooks" badges; estimated hours saved/week (labeled as an estimate); why each was picked.
4. **Tool detail** — what it does in plain English, pricing (dated "as of Nov 2026"), integrations, **Trust Score breakdown**, badge, setup difficulty, data/privacy notes, "How to get started" steps, **"Get help setting this up"**.
5. **Compare** — 2–3 tools side by side in plain language.
6. **Adoption plan** — 30-day week-by-week checklist; county-specific **Maryland SBDC** + **SCORE** mentor links; SBA microloan/resources where relevant; vetted helper listing.
7. **Discovery & verification admin** — pipeline: sources (Product Hunt, Square/QuickBooks/Toast app marketplaces, vendor submission form) → LLM extraction into structured profile → automated trust checks → human review queue → published. Demo: "Run discovery" on seeded candidates; one becomes **Verified**, one gets flagged **⚠ Unknown developer**.

**Trust Score (0–100), shown as a breakdown:** vendor legitimacy/identity (company, address, years operating, funding/known org), data & privacy (privacy policy, data use, SOC2/compliance claims), pricing transparency, integration with owner's existing tools (personalized), ease of setup, review sentiment (one input only). Badges: **Verified** (passed review), **Listed** (auto-discovered, not yet reviewed), **⚠ Use caution** (unknown developer / missing privacy policy / opaque pricing).

**Use-case taxonomy (starting point):** missed calls & phone answering, appointment scheduling & booking, online reviews & reputation, social media & marketing content, customer messaging & chat, quotes & estimates, invoicing & bookkeeping, inventory & ordering, staff scheduling, website & SEO, email marketing, document & admin paperwork.
**Business types:** restaurant/café, retail shop, salon/barber, HVAC/plumbing/electrical trades, landscaping, auto repair, farm/agri (rural), professional services (accounting, insurance), fitness studio, cleaning services.

**Nice-to-have (only if ahead):** Spanish toggle, browse-by-industry, vendor submission form.
**Out of scope (state this in the video as deliberate):** auth, payments, real vendor onboarding.

### Tech stack
- **Next.js (App Router) + TypeScript + Tailwind + shadcn/ui**, deployed on **Vercel** (preview deploy per PR).
- **Supabase Postgres** (+ **pgvector** for problem→tool semantic matching). Seed from JSON in `data/`.
- **OpenRouter** — called **only server-side** (route handlers). Key in env var `OPENROUTER_API_KEY`, never in client code. Use a cheap fast model; **cache** every LLM response (by input hash) in the DB; hard cap on calls; graceful fallback to rules when LLM fails or budget is hit. Total budget is $25 and judges will hit the live app.
- **Discovery worker** as a separate module run by Vercel Cron or GitHub Action (scheduled), plus a manual "Run discovery" admin button for the demo.
- Accessibility: large tap targets, high contrast, plain language (6th–8th grade reading level), works on phone + slow rural connections (light pages, no heavy assets).

### Team ownership
| Person | Owns | Folders |
|---|---|---|
| **A — Engine** | Intake, LLM classification, recommendation/Starter Kit logic + page, architecture diagram | `app/intake`, `app/kit`, `app/api/recommend`, `lib/recommend`, `lib/llm` |
| **B — Data & Trust** | Tool catalog (60–80 real tools), Trust Score model, discovery pipeline + admin, DB schema/seed, research (SBA stats, business interviews) | `data/`, `lib/trust`, `lib/discovery`, `app/admin`, `supabase/` |
| **C — Experience** | Design kit, landing, tool detail, compare, adoption plan, global polish & accessibility, video script/edit | `components/`, `app/page.tsx`, `app/tools`, `app/compare`, `app/plan` |

Shared files (`lib/types.ts`, `docs/*`, `CLAUDE.md`, root layout, `package.json`) change only after a heads-up in team chat.

### Collaboration rules
- Nobody pushes directly to `main`. Branches `a/...`, `b/...`, `c/...`; small PRs every 2–3 hours; Vercel preview link checked before merge; Claude reviews each PR against SPEC.md + CONTRACTS.md.
- Pull `main` before every new task.
- Build against `data/mock/` so nobody blocks anyone; swap to real data at integration.
- Use **only** components from `components/ui` (shadcn) and `components/brand` — this keeps the app visually consistent across three Claude sessions. No new dependencies without team OK.
- Every screen has loading, empty and error states.

### Development workflow (Superpowers plugin — mandatory for every session)
Every teammate's Claude Code has the **Superpowers** plugin. Use its skills for all work, adapted to a 48-hour hackathon:
- **`superpowers:brainstorming`** — before every new feature. SPEC.md and CONTRACTS.md already answer most product questions: treat them as the agreed answers, ask only about what they don't cover, and keep it to a few minutes. Product decisions that change SPEC.md need a team heads-up.
- **`superpowers:writing-plans`** — after brainstorming, write the plan to `docs/plans/<person>-<feature>.md` (e.g. `docs/plans/a-recommend.md`) so teammates can see what each session is doing.
- **`superpowers:subagent-driven-development`** (or **`superpowers:executing-plans`**) — to carry out the plan task by task.
- **`superpowers:test-driven-development`** — **required for core logic**: `lib/recommend`, `lib/trust`, `lib/discovery` extraction/checks, LLM fallback. For UI pages, skip TDD and verify visually in the browser instead (time is short).
- **`superpowers:using-git-worktrees`** — optional, for running parallel work inside one person's session without collisions.
- **`superpowers:systematic-debugging`** — for any bug or failing build; no guess-and-patch.
- **`superpowers:requesting-code-review`** — before opening every PR, review against SPEC.md + CONTRACTS.md. Use **`superpowers:receiving-code-review`** when acting on teammates' review comments.
- **`superpowers:verification-before-completion`** — before claiming anything is done: run build + tests and check the Vercel preview. Never say "done" without evidence.
- **`superpowers:finishing-a-development-branch`** — to wrap up each branch into a PR.
- After the **Sun 2pm feature freeze**: only systematic-debugging, verification and code review — no new brainstorming or plans.

### Timeline (ET)
- **Fri by ~11pm:** foundation merged, deployed hello-world on Vercel, design kit + mock data in, each person has a first feature branch.
- **Sat noon:** each module works standalone on mock data; catalog seeded.
- **Sat afternoon:** B (or pair) interviews 2–3 College Park small businesses (what tools they use, what eats their time, have they tried AI, do they trust it) — get a quote/clip with permission.
- **Sat 6pm:** integrated; full HVAC demo path works on the live URL.
- **Sat night:** video script; polish pass by C.
- **Sun 2pm: FEATURE FREEZE.** Cross-testing (everyone tests screens they didn't build: phone, incognito, odd inputs like nail salon / rural Garrett County farm).
- **Sun 3–6pm record, 6–9pm edit, by 10pm upload** video + doc with prototype link to the team Drive folder; verify sharing from a non-UMD account. **Do not redeploy after submission.**

### Demo persona (the video's golden path — must be flawless)
"Mike's Heating & Cooling" — HVAC, 5 employees, 2 vans, Frederick County MD, uses Square + QuickBooks + Google Business Profile, budget ~$200/month. Problems: "I miss calls when I'm on a job", "writing quotes takes me hours at night", "I don't have time to answer reviews".

### Video outline (10 min, all 3 speak)
0:00–1:30 problem + interview clips + SBA stats → 1:30–5:30 live demo of Mike's journey (intake → Starter Kit → Trust Score → compare → adoption plan → get help) → 5:30–7:00 discovery/admin + architecture diagram + scalability → 7:00–8:00 "why OpenAI can't do this overnight" → 8:00–9:30 16-week roadmap + metrics → 9:30–10:00 close + acknowledgments.
**16-week roadmap:** wk 1–4 SBDC pilot with 10–15 businesses; wk 5–8 vendor verification program + implementer onboarding; wk 9–12 Maryland agency integration, Spanish, rural/offline-friendly; wk 13–16 30/90-day retention tracking feeding back into the Trust Score.
**Success metrics:** time to Starter Kit (<3 min), % who start the adoption plan, 30-day tool retention.

---

## PART 2 — Your task in this first session (paste this right after Part 1)

Set up the repo foundation. Do not build features yet. Use the Superpowers workflow: run a **short** `superpowers:brainstorming` pass (Part 1 already answers almost everything — confirm only open points with me), then `superpowers:writing-plans` (save to `docs/plans/setup.md`), then execute it, and finish with `superpowers:verification-before-completion`. Create:

1. **Next.js + TypeScript + Tailwind + shadcn/ui** project scaffold; `.env.example` with `OPENROUTER_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; `.gitignore` covering `.env*`.
2. **`CLAUDE.md`** — concise operating rules for every future Claude session: project one-liner, stack, folder ownership table, **the Superpowers workflow section from Part 1 (which skill to use when, TDD for core logic only, plans saved in `docs/plans/`)**, "read docs/SPEC.md and docs/CONTRACTS.md before any task", "only edit files in your owned folders unless told", shared-file rule, server-only LLM calls + caching + fallback, use only `components/ui` and `components/brand`, plain-language copy rule, loading/empty/error states, branch/PR workflow, commands (dev/build/lint/seed).
3. **`docs/SPEC.md`** — the product spec, thesis, rubric mapping, judges' Q&A insights, demo persona, timeline and video outline from Part 1 (organized, not just pasted).
4. **`docs/CONTRACTS.md` + `lib/types.ts`** — TypeScript types and short docs for: `BusinessType`, `UseCase`, `IntakeInput`, `ClassifiedNeeds`, `Tool` (incl. pricing tiers, integrations, use cases, business types, vendor info, privacy info, setup steps, source, status: `discovered | listed | verified | flagged`), `TrustScore` (total + component breakdown + badge + reasons), `StarterKit` (picked tools, rationale per problem, total monthly cost, integration notes, estimated hours saved), `AdoptionPlan`, `HelpResource` (SBDC/SCORE/helper by county), `DiscoveryCandidate`. Also the API shapes: `POST /api/classify`, `POST /api/recommend`, `GET /api/tools`, `GET /api/tools/[id]`, `POST /api/discovery/run`.
5. **`supabase/schema.sql`** — tables matching the types (tools, trust_scores, use_cases, integrations, help_resources, discovery_candidates, llm_cache), pgvector extension + embedding column on tools.
6. **`data/mock/`** — ~10 realistic mock tools across several use cases (incl. one `flagged` "unknown developer" example), a mock Starter Kit for the Mike's HVAC persona, a mock adoption plan, a few help resources. Mark clearly as mock.
7. **`components/brand/`** stub — design tokens (colors, type scale, spacing) and a few base components (TrustBadge, ToolCard, SectionHeader, PageShell) with a calm, trustworthy, accessible look (high contrast, large tap targets). Person C will refine.
8. Placeholder pages for every route (`/`, `/intake`, `/kit`, `/tools/[id]`, `/compare`, `/plan`, `/admin`) rendering mock data so the app runs end-to-end immediately.
9. A short `README.md` with setup steps.

Then run the build to confirm it compiles, and give me a summary plus the exact git commands to commit and push. Ask me before making any product decision that SPEC.md doesn't already answer.

---

## PART 3 — Role prompts (each teammate pastes their own after cloning)

> Every role prompt follows the Superpowers workflow in CLAUDE.md: for each numbered item, brainstorm briefly (SPEC.md is the default answer) → write a plan in `docs/plans/` → execute with subagent-driven development (TDD for core logic) → request code review → verify → finish the branch as a PR.

### Person A — Engine
> I'm Person A (Engine) on Team ByteMe. Read CLAUDE.md, docs/SPEC.md and docs/CONTRACTS.md first. I own `app/intake`, `app/kit`, `app/api/recommend`, `app/api/classify`, `lib/recommend`, `lib/llm`. Build, in this order on branch `a/engine`:
> 1. `lib/llm`: server-only OpenRouter client with response caching (llm_cache table, keyed by input hash), timeout, call cap, and typed JSON output.
> 2. `/api/classify`: map free-text problems + business type → our use-case taxonomy using the LLM; deterministic keyword fallback.
> 3. `lib/recommend` + `/api/recommend`: pick 2–4 complementary tools (one per top need), prefer tools integrating with the owner's existing tools, respect budget, prefer higher Trust Scores, never recommend `flagged` tools as primary picks; produce rationale per pick, total monthly cost, integration notes, estimated hours saved. Use pgvector similarity where useful, rules as backbone.
> 4. Intake page (≤2 min, mobile-first, tap-to-select current tools) and Starter Kit page, using components from `components/brand` only.
> 5. Make the Mike's HVAC persona path flawless.
> Work against `data/mock/` until B's real catalog lands. Use the Superpowers workflow from CLAUDE.md for each item (TDD required for `lib/recommend` and `lib/llm` fallback). Small PRs. Tell me before touching shared files.

### Person B — Data & Trust
> I'm Person B (Data & Trust) on Team ByteMe. Read CLAUDE.md, docs/SPEC.md and docs/CONTRACTS.md first. I own `data/`, `lib/trust`, `lib/discovery`, `app/admin`, `supabase/`. Build, in this order on branch `b/data-trust`:
> 1. Real catalog: 60–80 real AI tools across the use-case taxonomy and business types (include strong Main Street picks: AI phone answering/receptionists, booking, review response, social content, quoting, bookkeeping, etc.). Fields per CONTRACTS.md, pricing dated "as of Nov 2026", integrations with Square/Toast/Clover/QuickBooks/Google Business Profile etc. Research with web sources and flag anything uncertain for me to verify. Include 2–3 realistic "unknown developer" style entries for the flagged demo.
> 2. `lib/trust`: Trust Score model (0–100) with transparent component breakdown + badge + human-readable reasons; integration-fit component personalized to the owner's current tools.
> 3. Seed script into Supabase (+ embeddings).
> 4. `lib/discovery` + `/api/discovery/run` + `app/admin`: pipeline sources → LLM extraction → automated trust checks → review queue → publish. Seed realistic candidates so the demo shows one becoming Verified and one Flagged. Design it as a scheduled job (Vercel Cron/GitHub Action) for the architecture story.
> 5. Help resources: Maryland SBDC regional centers and SCORE chapters by county, plus SBA resources (verify URLs).
> Use the Superpowers workflow from CLAUDE.md for each item (TDD required for `lib/trust` and `lib/discovery`). Small PRs. Tell me before touching shared files.

### Person C — Experience
> I'm Person C (Experience) on Team ByteMe. Read CLAUDE.md, docs/SPEC.md and docs/CONTRACTS.md first. I own `components/`, `app/page.tsx`, `app/tools`, `app/compare`, `app/plan`, and overall visual polish. Build, in this order on branch `c/experience`:
> 1. Finalize the design kit in `components/brand` (tokens, TrustBadge, ToolCard, TrustScoreBreakdown, PriceTag, IntegrationChips, Stepper, EmptyState, ErrorState, Skeletons). Calm, trustworthy, high-contrast, big tap targets, mobile-first. This is what keeps three Claude sessions visually consistent.
> 2. Landing page with the thesis line and a clear single call to action.
> 3. Tool detail page (plain-English description, pricing, integrations, Trust Score breakdown, privacy notes, how to start, "Get help setting this up").
> 4. Compare page (2–3 tools side by side, plain language).
> 5. Adoption plan page (30-day checklist, county SBDC/SCORE links, helper listing).
> 6. Accessibility + copy pass across all screens: plain language for a non-technical owner, loading/empty/error states everywhere, works on a phone and slow connection.
> Then help draft the video script per SPEC.md. Use the Superpowers workflow from CLAUDE.md for each item (UI: verify visually in the browser instead of TDD). Small PRs. Tell me before touching shared files.

---

## Parked ideas (on hold — do not build unless the team decides to)

### Auditions (simulated tool tests on the owner's own business)
Idea from the team diagram: build a **Business Brief** from the owner's website/Google profile/reviews (+ ZIP-code languages, season, owner corrections) → **scenario writer** generates 6 realistic customer calls with pass/fail rubrics → an **AI caller** runs them against the owner's line (with consent) and candidate AI tools → an **AI judge** scores transcripts and fact-checks against the Brief → owner sees report card, openings, audition scores, alerts; weekly re-test. Every score links to transcript/quote.
**Why parked:** only fits conversational tools (phone answering, chat, review replies) — not bookkeeping, inventory, scheduling, payroll; helps "compare" but not "discover/adopt"; MVP would be simulated (LLM role-playing tools), and AI-judging-AI on 6 samples is weak evidence; real calls need telephony + voice AI beyond the $25 budget; Maryland requires all-party consent to record calls; ~7–8 hrs of build time.
**If revived:** scope to the missed-calls / AI receptionist category with 3 tools, text-only, clearly labeled "Simulated audition — based on documented features", precomputed for the demo persona; live phone auditions go in the 16-week roadmap.
