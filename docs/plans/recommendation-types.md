# Section 4 implementation plan

Scope: a working recommendation experience on a feature branch, using a clearly marked sample catalog until the reviewed catalog and shared contracts arrive.

1. Define a small typed boundary for business profile, problems, catalog tools, eligibility reasons, score parts, and recommendation types.
2. Test the hard eligibility rules first: only verified tools, Maryland recording and pricing rules, health data requirements, and owner deal breakers.
3. Implement the documented 35/25/20/10/10 Fit Score with deterministic explanations and stable ordering.
4. Build Quick fix, Use what you have, Lowest cost, Starter Kit, and Done for you. Never invent an option when no eligible tool exists.
5. Add a sample HVAC persona and catalog labeled as demonstration data. Build a responsive results view that lets judges change the problem, budget, current tools, and setup preference, then compare choices.
6. Expose the same engine through `POST /api/recommend` with validation. Keep the pure engine independent of Next.js and external services so Persons A and B can integrate it.
7. Run tests, type checking, and production build. Review the result against the feature spec and record data limitations honestly.

Research basis: NIST AI RMF third party risk documentation and monitoring; SBA advice to start with practical small workflows; Google Places policies on review retention and attribution. The engine consumes verified catalog records and never processes or stores Google reviews.
