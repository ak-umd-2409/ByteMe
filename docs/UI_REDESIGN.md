# Owner experience redesign

## Goal

Help a Maryland small business owner move from a vague interest in AI to one reviewable decision: discover a business problem, compare practical ways to address it, and leave with a 30-day plan. The interface should make sense in a short hackathon demo and on a phone.

## Product decisions

- **One main action at a time.** The landing page starts with “Find my next move”; the guided screens keep a clear primary action and a visible six-step path.
- **Show the product before asking for effort.** An interactive Discover / Compare / Adopt preview explains the value in seconds. All preview content is labeled illustrative.
- **Let judges try a real business quickly.** “Explore a guided example” reads a saved public snapshot of Frederick Heating & Air Conditioning. The source date and the fictional tool status remain visible in the flow.
- **Make trust legible.** Public evidence, owner answers, assumptions, sample tools, and human review status have distinct labels. The catalog separates real approved tools from fictional verified examples.
- **Offer genuinely different next moves.** For a problem, the UI shows a no-cost action, each checked tool only once, and a free local advisor. It states plainly when no checked tool exists.
- **Keep the plan usable.** Checklists, ready-to-use text, local resources, and print/share controls use the same visual language as discovery and comparison.
- **Design for phones first.** Major actions are at least 44px high, text and cards reflow to one column, and reduced-motion preferences are respected.

## Research behind the changes

- [University of Maryland's AI for Small Business Hack-a-thon](https://www.rhsmith.umd.edu/centers-initiatives/artificial-intelligence-business/ai-events/ai-small-business-hack-thon) frames the challenge as helping small businesses discover, compare, and adopt AI tools. Those three verbs shape the preview and decision flow.
- [SBA guidance on AI for small business](https://www.sba.gov/business-guide/manage-your-business/ai-small-business) recommends starting small and assessing value and risk. Free first steps and the day-30 keep/change/stop check reflect that guidance.
- [SBA Research Spotlight on small-firm AI](https://advocacy.sba.gov/wp-content/uploads/2025/09/Research-Spotlight-AI-in-Business-Small-Firms-Closing-In_-092425.pdf) identifies knowledge and relevance barriers. Plain-language examples, direct costs, and local help address those barriers.
- [Nielsen Norman Group's progressive disclosure guidance](https://www.nngroup.com/articles/progressive-disclosure/) supports keeping advanced detail behind “See the proof,” tool detail, and expandable sections.
- [GOV.UK's question-page pattern](https://design-system.service.gov.uk/patterns/question-pages/) supports one question at a time with a back path and contextual help.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) informed focus visibility, contrast, touch targets, and reduced-motion handling.

## Demo path

1. Open `/` and switch the Discover / Compare / Adopt preview tabs.
2. Choose **Explore a guided example**. The app reads the saved public Maryland business snapshot.
3. Review the business facts, answer the short questions, and open the evidence behind a result.
4. Open **Ways to fix it**. Show the free action, the labeled sample tool, and local advisor support.
5. Make a plan. Tick a step, switch to Spanish, copy a template, and show print/share controls.

## Current limits

The built-in catalog still contains fictional sample tools for demonstration. They are labeled throughout the flow and cannot be purchased. Live search depends on configured external services; the saved Maryland example works without them. The redesign does not imply endorsement by the Maryland SBDC or SCORE.
