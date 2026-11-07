# Recommendation types: implementation handoff

This branch implements Section 4 of [FEATURE_SPEC.md](FEATURE_SPEC.md) as a runnable Next.js prototype. Run `npm install`, `npm run dev`, and open `http://localhost:3000`. Use `npm test`, `npm run typecheck`, and `npm run build` before merging.

## What is implemented

- Pure, deterministic engine in `lib/recommend/engine.ts`, with tests. It receives a `BusinessProfile`, ordered `Problem[]`, and `CatalogTool[]` and returns options per problem, excluded tools with reasons, and comparison choices.
- Hard gates before scoring: catalog status and human review date; Maryland call recording notice flag; health data terms; Maryland food pricing; outbound call consent; large customer list data handling; owner deal breakers.
- Fit Score: problem 35, current tool integration 25, budget 20, setup 10, reviews 10. Missing reviews receive a neutral 5/10 and are disclosed. Scores never override a gate.
- The five spec paths when applicable: existing tool add-on, quick fix, 2–4 tool budget-conscious kit, lowest cost, and assisted setup. An option is omitted when it cannot be supported.
- Responsive demo UI with live business controls, problem tabs, score explanations, exclusions, comparison, and sample catalog lookup.
- `POST /api/recommend` accepts `{ business, problems }`, validates input, and uses the fixed demo catalog. It always labels the response `sampleData: true`.

## Team integration points

Person B should replace `data/mock/recommendations.ts` on the server with catalog records that were actually reviewed. A verified record needs `status: "verified"` and `reviewedAt`; a badge alone is insufficient. Map B's catalog fields to `CatalogTool` or agree on a shared type. The API must never accept caller supplied `status` or `reviewedAt` as authority.

Person A should pass the confirmed business profile and evidence-backed problems into the route. The route requires the problem list; it does not invent findings from an arbitrary business name. The UI presently uses Mike's sample scenario.

Person C can reuse the option and comparison data shapes when integrating the design system. The demo page is self contained because the repo did not yet have shared UI components.

The “Check a link” control searches only the sample catalog. Unknown links are **not** queued or verified; connect it to Person B's discovery submission endpoint once that exists. The SBDC link leads to the Maryland office directory; it does not promise an advisor has agreed to implement a particular product.

## Research and judgment

The [NIST AI RMF Playbook](https://airc.nist.gov/airmf-resources/playbook/manage/) recommends documented controls and monitoring for third party AI risks. The [SBA's AI guide](https://www.sba.gov/business-guide/manage-your-business/ai-small-business) encourages practical, small starting tasks. The [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies) restrict retention and derived use of reviews; this engine consumes prepared problem statements and stores no Google review data. Maryland rules in this prototype are conservative eligibility flags, not legal determinations.

## Demo caveats

All catalog entries, prices, capabilities, and “verified” states are illustrative. No independent vendor review or current pricing verification was performed. Do not present the sample badges as live vendor endorsements in the submission video. Real catalog verification is a dependency for production use.
