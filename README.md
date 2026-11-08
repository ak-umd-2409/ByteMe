# ByteMe — UMD AI for Small Business Hack-a-thon (Team 11)

**Live demo:** https://byte-me-mu.vercel.app (no login). Every merge to `main` updates it; every PR gets its own preview link from Vercel.

Start here: **[docs/HANDOFF_PROMPT.md](docs/HANDOFF_PROMPT.md)** — full context, the Claude Code setup prompt, and role prompts for Persons A, B and C.

Feature list, scoring model and usability metrics: **[docs/FEATURE_SPEC.md](docs/FEATURE_SPEC.md)**.

**Homepage and Business Advisor:** `/` is the research-backed homepage (type a business name to start), `/start` is the guided journey, and `/advisor` is the Business Advisor (also in a side panel after results). Both work with no API keys; with `OPENROUTER_API_KEY` the advisor's answers are written by AI from the business's own results and checked against the catalog. See **[docs/RESEARCH.md](docs/RESEARCH.md)** for the verified pain-point research and **[docs/ADVISOR.md](docs/ADVISOR.md)** for how the advisor works.

Everyone needs the **Superpowers** plugin installed in Claude Code before starting.

Section 4 prototype: run `npm install`, then `npm run dev` and open `http://localhost:3000`. The interactive recommendation demo uses clearly labeled sample catalog data. See **[docs/SECTION4_HANDOFF.md](docs/SECTION4_HANDOFF.md)** for the engine contract, integration points, tests, and limitations.

Sections 2 & 3 backend (onboarding, business intelligence, problem discovery, impact estimates): six API routes under `app/api/business`, `app/api/onboarding` and `app/api/problems`. They run with **no API keys** in mock mode on fictional sample businesses; copy `.env.example` to `.env.local` to add Google Places and OpenRouter. `npm test` runs every test in `lib/`. See **[docs/PARTS_2_3_API.md](docs/PARTS_2_3_API.md)** for endpoints, examples and the Part 4 contract, and **[docs/FRONTEND_HANDOFF.md](docs/FRONTEND_HANDOFF.md)** for screens, design system and starter components. **New: the simple owner journey** (find → what we learned → a few skippable questions → top 2–3 problems with evidence → Part 4) is two endpoints, `/api/journey/start` and `/api/journey/answer`. The owner-facing screens, built from the approved wireframes, are at **`/start`**. Tool discovery, the review queue (`/admin`) and the catalog (`/tools`) are in **[docs/DISCOVERY.md](docs/DISCOVERY.md)**. See **[docs/JOURNEY_API.md](docs/JOURNEY_API.md)**. A clickable demo of the whole flow (sample businesses, real API) is at `http://localhost:3000/demo` after `npm run dev`.

Earlier note: the home page (`/`) used to run the Parts 2 & 3 backend directly: pick one of two real Maryland HVAC businesses (captured from public listings, websites and reviews on Nov 7, 2026) to see evidence-backed problems, their estimated value with the math shown, and recommendations for those problems. Before a business is picked, the original sample (Mike) is shown. The full step-by-step flow is at `/demo`.
