# ByteMe — UMD AI for Small Business Hack-a-thon (Team 11)

Start here: **[docs/HANDOFF_PROMPT.md](docs/HANDOFF_PROMPT.md)** — full context, the Claude Code setup prompt, and role prompts for Persons A, B and C.

Feature list, scoring model and usability metrics: **[docs/FEATURE_SPEC.md](docs/FEATURE_SPEC.md)**.

Everyone needs the **Superpowers** plugin installed in Claude Code before starting.

Section 4 prototype: run `npm install`, then `npm run dev` and open `http://localhost:3000`. The interactive recommendation demo uses clearly labeled sample catalog data. See **[docs/SECTION4_HANDOFF.md](docs/SECTION4_HANDOFF.md)** for the engine contract, integration points, tests, and limitations.

Sections 2 & 3 backend (onboarding, business intelligence, problem discovery, impact estimates): six API routes under `app/api/business`, `app/api/onboarding` and `app/api/problems`. They run with **no API keys** in mock mode on fictional sample businesses; copy `.env.example` to `.env.local` to add Google Places and OpenRouter. `npm test` runs every test in `lib/`. See **[docs/PARTS_2_3_API.md](docs/PARTS_2_3_API.md)** for endpoints, examples and the Part 4 contract, and **[docs/FRONTEND_HANDOFF.md](docs/FRONTEND_HANDOFF.md)** for screens, design system and starter components.
