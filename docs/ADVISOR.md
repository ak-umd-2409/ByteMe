# MainStreet Business Advisor

An AI adoption advisor for one specific small business, not a general chatbot. It answers from two things only: the owner's own results from onboarding, and the catalog of tools a person has checked. Code: `lib/advisor/`, API `POST /api/advisor`, UI `app/advisor/`.

## Where owners meet it

- `/advisor`: full page with starter questions. If the owner ran the check in this browser tab, it answers about their business (results kept in `sessionStorage` only, cleared when the tab closes).
- Inside the guided journey: an **Ask the advisor** button on the results, tools and plan screens opens a side panel with the owner's results attached.
- The homepage shows a real answer and links starter questions to `/advisor?q=…`.

## How an answer is built

**With an AI key (`OPENROUTER_API_KEY`), the AI writes the answer.** The server gives the model:

- the owner's question and the last 6 turns of the conversation;
- the **business brief** (`brief.ts`), built from the owner's journey: name, kind, location, website, hours, everything we read (reviews, website, listings, software we saw), what customers say (review themes with counts), every problem with its evidence and first step, what the owner told us, what we assumed, budget, software they use, and their free SBDC office;
- the **checked catalog**: every Verified, real tool that fits this kind of business (price or "not public", what it works with, setup, privacy, recording and HIPAA flags);
- for budget questions, a suggested plan that fits the budget.

The model replies in JSON: the answer, tool ids, up to 3 free steps, "when you don't need AI", and follow-up questions (`think.ts`). Then the server checks it:

1. Tool ids must be real, Verified tools that fit this business; anything else is dropped.
2. Tool cards, prices and links are built from the catalog, never from the model's text.
3. The text may not name a product or company we didn't give it, quote a dollar amount or percentage that isn't in the facts, or include a link (`word.ts` `outsideFacts`).
4. A budget answer must fit the budget at catalog prices.

If any check fails, if the AI is slow or over the spending cap, or if there's no key, the owner gets the **rules answer** instead:

1. **Understand the question** (`understand.ts`, plain rules): kind (explain, budget, existing software, "do I need AI", topic, general, off-topic), topics, a budget like "$100 a month", the industry, and software names.
2. **Owner context** (`pack.ts` `contextFrom`): rebuilt on the server from the journey context (signed when `JOURNEY_SECRET` is set). Problems with a free fix are kept apart, so it never sells a tool for them.
3. **Answer pack** (`pack.ts`): Verified, non-sample tools that fit the business, ranked: already in software you use → connects to it → fits your industry → within budget → public price → cheaper → self-serve.
4. **Rules answer** (`compose.ts`): free first steps, tool cards, a budget plan that never goes over, "when you don't need AI", next steps (including the free SBDC office) and follow-ups. If no checked tool exists, it says so.

The reply always says which one the owner got: "Written by AI from these facts…" or "Written from our rules…".

## Guardrails

**Known limit:** the checks catch invented tools, prices, product and company names, percentages and links. They can't prove every sentence the AI writes about the business itself; the instructions forbid inventing business facts, the model runs at temperature 0, and every fact it's given comes from public sources or the owner.

- Recommends checked catalog tools only; listed, blocked and sample tools never appear.
- Prices come from the catalog; unknown prices are said to be unknown.
- Maryland call-recording consent and HIPAA caveats are kept in every answer they apply to. Not legal or financial advice.
- Off-topic questions are steered back to the business.
- Only business facts (all from public sources or the owner's own answers), the catalog and the last 6 turns go to the model. Nothing is stored on our servers; AI answers are cached for 7 days (in Upstash when configured) under a hash of the question and facts.

## Model and cost

- Model: `openai/gpt-4o-mini` via the existing `OPENROUTER_MODEL`, listed on OpenRouter at $0.15 per million input tokens and $0.60 per million output.
- Measured for Frederick Heating: about 2,900 tokens in (brief plus catalog plus instructions) and up to 900 out, about **$0.0007–0.001** per answer, so 1,000 questions cost under $1.
- Same question and same business returns the saved answer at no cost. `LLM_BUDGET_USD` (default $20) stops all AI calls when reached; the advisor then answers with rules.
- Rate limit: the "analyze" limit (8 requests a minute per visitor).

## Works without keys

Yes. With no `OPENROUTER_API_KEY` every answer comes from the rules and the catalog, and the reply says so. The tests (`lib/advisor/advisor.test.ts`) cover the questions from the brief, the guardrails and the AI-wording check.
