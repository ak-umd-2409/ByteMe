# Part 5 handoff — setup and adoption

Part 5 lives in the current guided owner journey at `/start`. After selecting a business, answering the questions, and reviewing the recommended fixes, choose **Make my plan**. The screen builds a plan from the confirmed business profile, owner answers, selected fixes, and reviewed catalog records. It works with the repository's no-key demo data.

## What to show in the hackathon demo

1. Start at `/start` and choose the Frederick Heating & Air Conditioning sample.
2. Confirm the profile, answer a few questions, and review the problems and ways to fix them.
3. Open **Make my plan**. Change a tool to **Decide later** to show that the 30-day plan responds to the owner's choice.
4. Walk through the eight milestones from day 1 to day 30. Check one item and refresh to show that progress is saved on this device.
5. Copy a greeting, FAQ, or review reply. The drafts use the confirmed business name and hours; the owner must review them before use.
6. Show local SBDC help, SCORE mentor search, the prototype helper listing, and official learning and funding leads. Create a read-only advisor link, copy it, and show the email draft and print action.
7. Switch to **Español**, then answer the day-7 or day-30 check-in. These answers stay in this browser.

## Feature coverage

| Spec | Implementation |
| --- | --- |
| 5.1 | Eight dated, checkable milestones grouped into four weeks, with an estimated time or “Time varies.” They start with free fixes and a baseline, then cover vendor checks, setup, review, team handoff, and a keep/change/stop decision. The team's detailed tool schedule and vendor steps remain available in expandable sections. |
| 5.2 | One receptionist greeting, three FAQs, and three review replies in English and Spanish. Each can be copied. Missing profile facts use a question for a person instead of an invented answer. |
| 5.3 | County-matched Maryland SBDC data from the journey response, official SCORE Maryland mentor search, and an explicitly labelled helper prototype. |
| 5.4–5.5 | A read-only advisor link is rebuilt from the signed journey context. With storage configured it expires after 30 days; otherwise the link carries the plan in its fragment. Advisor and self-email buttons open a prefilled draft in the user's mail app. The print layout focuses on the one-page timeline and human-help contacts. |
| 5.6 | English/Spanish toggle covers the owner plan's main headings, milestone text, templates, help, sharing controls, resources, and check-ins. Earlier journey screens, expanded vendor detail, self-email body, and shared advisor view remain English. |
| 5.7 | Official SBA, Maryland SBDC, Maryland Commerce, and (for Frederick) county resources. Funding is a lead, not an eligibility or award claim; loans are identified as repayable. |
| 5.8 | Day-7 “Is it running?” and day-30 “Did it help?” answers plus checklist completion persist in browser storage for that business and selected tool set. No reminder or catalog feedback service exists yet. |

## Code and data boundaries

- `lib/plan/adoption.ts` builds the bilingual adoption guide deterministically from `buildPlan`, the journey answer, and catalog records. Only tools with a Verified badge and review date appear as selected tools.
- `app/start/AdoptionPanel.tsx` renders the checklist, templates, support, resources, and check-ins. Browser storage contains only completed milestone IDs and check-in choices. No customer names, phone numbers, or free-text responses are stored by this feature.
- `app/start/PlanScreen.tsx` hosts the panel, tool choice, translated plan summary, advisor-link flow, and expanded vendor details. `lib/plan/plan.ts` also checks the review date before including a chosen tool. The advisor view uses the team's existing `/api/plan/share` and `/plan` routes.
- Sample catalog tools remain clearly marked as samples and cannot be purchased. Setup times and prices are estimates to confirm with a vendor. For recording tools, the greeting includes a placeholder for a reviewed notice and consent flow; the product does not claim that the sample greeting alone makes recording lawful.
- Email buttons create a local draft; they do not send email to an advisor automatically. The owner explicitly creates and shares the read-only link. A link can reveal the plan to anyone who has it; the screen says so. Printing depends on browser print settings, so use “Save as PDF” if a paper copy is not needed.

## Checks

Run `npm test`, `npm run typecheck`, and `npm run build`. The focused guide tests are in `lib/plan/adoption.test.ts`. The guided flow was also checked in a browser through plan creation, Spanish text, copy feedback, checklist progress, and a saved check-in.
