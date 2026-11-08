# Tool discovery, review and the catalog (Part 1)

Nov 8, 2026 · Code: `lib/discovery`, `lib/api/discovery.ts`, `app/api/discovery/*`, `app/admin`, `app/tools`, `app/submit`

This covers spec §1 (`docs/FEATURE_SPEC.md`): **find → extract → Safety Check → a person reviews → publish → re-check.** An owner can never be shown a tool a person hasn't approved.

## What each step does

| Spec | Step | Where |
| --- | --- | --- |
| 1.1 | **Find**: new tools come from 3 places. (1) Our **watch list** of 89 real tools (`data/catalog/list.json`), 5 more per run, batch 1 first. (2) **Owners** pasting a link into "Saw an AI tool in an ad?". (3) **Vendors** applying on `/submit`. Duplicates are matched by website and dropped. A web address that imitates a brand (e.g. `squaree-ai.com`) is **blocked on the spot**. | `submit()`, `runDiscovery()` in `lib/discovery/discovery.ts` |
| 1.2–1.3 | **Extract + Safety Check**: the same pipeline as `npm run catalog:build`. It reads the tool's public pages (robots.txt respected), the AI answers fixed questions with word-for-word quotes, and plain code judges the result. Up to 3 tools per run (5 on the weekly run), owners' links first. A site we can't reach is "failed" and retried; it is never judged on nothing. | `lib/discovery/pipeline.ts` |
| 1.4 | **Human review**: `/admin` shows tools waiting for a person, with every check. **Approve only works when the Safety Check says "ready"** (the existing `approveTool` guard) and a problem type is set. Block needs no reason, but the reason, if given, is what owners see. | `decide()`, `app/admin/AdminQueue.tsx` |
| 1.5 | **Publish**: decisions are laid over the built-in catalog by id. `/api/recommend`, the owner journey and `/tools` all read this live catalog, so an approved tool can be recommended right away and a blocked one disappears. | `liveCatalog()`, `loadLiveCatalog()` |
| 1.6 | **Re-check**: every real (not sample) tool whose last check is over 90 days old is checked again on the next run. A Verified tool stays Verified only if it's still "ready" and nothing an owner sees changed (`buildRecord`'s rule). | `runDiscovery()` step 6 |

**Badges** (spec §1): only ✓ Verified tools are ever recommended. Listed tools appear only on `/tools`, labelled "Not yet reviewed". Blocked tools appear only under "Why we hid these" on `/tools`, on their own `/tools/<id>` page ("We'd never recommend …"), and when an owner checks their link.

## Pages

- **`/tools`**: browse the catalog, with search and filters for problem, business type, "works with", price and Verified only. Includes "Why we hid N tools" and "Apply to be listed".
- **`/tools/<id>`**: the full tool card (Rishabh's tool detail screen without Compare). Unreviewed tools carry a banner; blocked tools show their red flags.
- **`/submit`**: vendor application with name, website, problems it solves, and whether it takes payments or health info. No contact details are collected.
- **Landing page**: "Check this tool" now calls `/api/discovery/submit`, so a new link joins the queue. The top bar links to Browse tools.
- **`/admin`**: the real review queue. Asks for the reviewer code, has "Run discovery now", Approve/Block that are saved, the last run, "In line for the Safety Check", Blocked, and Approved recently.

## API

| Method | Path | Who | Body → reply |
| --- | --- | --- | --- |
| POST | `/api/discovery/submit` | anyone (rate limited) | `{ url, name?, useCases?, sensitive?, source?: "owner_check" \| "vendor_submission" }` → `{ kind: "queued" \| "in_catalog" \| "already_queued" \| "blocked", message, toolId, … }` |
| GET | `/api/discovery/queue` | reviewer | → `{ storage, counts, candidates, records, runs, builtInWaiting }` |
| POST | `/api/discovery/run` | reviewer | `{ limit?: 1–10 }` → `{ summary, queue }` |
| GET | `/api/discovery/run` | Vercel's schedule only | weekly, `vercel.json` → Sundays 13:17 UTC |
| POST | `/api/discovery/decide` | reviewer | `{ id, action: "approve" \| "block", reviewer, reason?, useCases? }` → `{ message, queue }`, or 409 with the reason it isn't allowed |

Reviewers send `x-admin-token`. The schedule sends `Authorization: Bearer $CRON_SECRET`.

## Setup on Vercel (Aditya: 3 settings, about 5 minutes)

1. **Storage:** in the Vercel project, open Storage (or the Marketplace), add **Upstash for Redis** (free plan) and connect it to the project. Vercel adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically. Without it, decisions live in memory and reset when the server restarts; `/admin` says so.
2. **`ADMIN_TOKEN`:** Settings → Environment Variables. Any long random string, shared only with reviewers. Without it, `/admin` stays locked in production.
3. **`CRON_SECRET`:** same place, another long random string. Vercel sends it to the weekly job.
4. **(Optional) `OPENROUTER_API_KEY`:** the Safety Check's AI questions. Without it, answers that need the AI become "couldn't confirm", so tools are held for a person, never passed.

Then redeploy.

## Honest limits

- **App marketplace scanning isn't built.** Square, QuickBooks, Jobber and Shopify have no public listing API, and scraping is against our guardrails. Their AI features are on the watch list instead, and vendors from those stores can apply.
- **Facts a person found** (`data/catalog/found`) are applied by the offline `catalog:build` script, not by the web run. A newly discovered tool starts without them.
- **One record holds the whole queue.** That's fine for hundreds of tools. Two reviewers deciding in the same second could overwrite each other; at that scale, move to one key per tool.
