# Wireframes and style board

Person B · Nov 7, 2026 · Status: style board and screens 1–4 approved by Rishabh (PR #12); screens 5–8 added for review (this PR).

- **Click-through page:** [`docs/wireframes/mainstreet-wireframes.html`](../wireframes/mainstreet-wireframes.html). Open it in a browser. It has a Website (16:10) / Phone switch and moves one screen at a time through all 8 screens.
- **Shared link:** https://claude.ai/artifact/VW7qZhbEgwbftQPH5wH2Wg (private until shared from its Share menu).
- **Who uses this:** whoever builds the real screens (problem 10). Copy the tokens below into `app/globals.css`; don't invent new colors.

## Style board (approved)

### Colors

| Token | Hex | Use |
| --- | --- | --- |
| Warm Cream Beige | `#E8D2B5` | Page background on every screen |
| Muted Sage Grey | `#A5A79B` | Card tops ("labels"), top bar |
| Deep Burgundy | `#590907` | Main buttons, links, focus ring |
| Light fill | `#FBF4EA` | Card bodies, list rows, text boxes |
| Ink | `#2A1F1D` | Main text, button borders and shadows |
| Dark grey | `#3F3833` | Small print (readable on beige, sage and light fill) |
| Safe green | `#2F5233` | Only ✓ Verified and ● Confirmed |
| Alert red | `#B3261E` on `#FDE8E6` | Only ⚠ Blocked and errors |
| Amber | `#7A4B0C` on `#F6E7CC` | ◐ Likely, sample-data banner, "which is right?" boxes |
| Slate | `#4A4F4A` on `#E7E8E2` | ◷ Not yet reviewed, ○ Not confirmed, neutral notices |

No off-white "paper" background. Problems are never red.

### Type

- **Headings and prices:** Tiro Bangla (Google Fonts, regular only; use size, not bold). Page title 28px, section 23px, card title 21px, money 24px.
- **Everything else:** Spectral (Google Fonts). Body 17px, small print 15px, nothing under 13px. Spectral italic for review quotes.

### Components

- **Buttons:** hard shadow. 3px ink border, 4px ink offset shadow, 52px tall. They lift on hover and press in when tapped. Burgundy fill = the one main action per screen; white fill = second actions. Disabled buttons lose the shadow.
- **Text boxes:** soft. Light fill, no outline, 14px corners, dark bottom edge (`#5E4F3B`), 52px tall. Typed text is burgundy, the empty-box example is grey, and the focus ring is burgundy. Error = pink fill, red bottom edge, message underneath.
- **Badges:** stamp. 2px outline in the badge color, square corners, a symbol plus a word. ✓ Verified gets a double line like a seal. Fact chips ("✓ Works with Square", "From Google") have a dashed outline. Tap-to-pick chips have the button shadow and press in, turning burgundy when picked.
- **Tool logos:** every tool name has its logo on the left: 40px rounded square, or 56px on the tool page. The wireframes use colored initials as placeholders. The real app should show the vendor's logo, which means the catalog needs a logo field.
- **Cards:** two-part. A sage top with the name, badge and price, then a light body with the details. No outline, no shadow, 14px corners.
- **Page frame:** sage top bar ("MainStreet AI" · Start over), sample-data banner, step line "Step N of 4: …", page title, then content. Phone = one column. Website = two columns, max 1040px wide.
- **Motion:** screens slide in over about 0.3s. The only other motion is the button press. All of it is off when the phone or computer asks for reduced motion.

## Screens

### 1 · Landing (approved)
- A stamp ("✓ Every tool checked by a person"), the promise headline, one line on why, and one burgundy button "Find my AI tools" (free · about 3 minutes · no sign-up).
- "How it works" in 3 steps. A "Saw an AI tool in an ad?" box with a link field and "Check this tool".
- "For reviewers" in the top bar goes to the admin queue (screen 8).
- Website: hero on the left, "How it works" and the link check on the right.

### 2 · Find your business (approved)
- Business name and town fields, then Search. Search runs on tap, not on every keystroke.
- Up to 3 results, where the whole row is the button. "Not listed? Enter it yourself" is always there.
- 3 quick questions: monthly budget, "Want someone to set it up?", what matters most (up to 2). Optional "Paste a few reviews" box. Main button: "Read my business".
- **Loading step:** a checklist of the real steps (Google listing, website, reviews, tools on your site) that all tick together when the answer arrives, then it moves on by itself. Cancel goes back. No progress bar, no "AI is thinking".

### 3 · Check what we found (approved)
- "Is this right?" Each fact shows where it came from (From Google / Your website) and has Edit next to it. Missing facts say "We couldn't find this · Add".
- Mismatches go in an amber "Which is right?" box (for example, the hours).
- "What customers say": complaint themes with "from N of 5 reviews", one italic quote with the reviewer's name, and a note that Google only shares 5 reviews.
- "Tools you use": found tools with "See where we found it", and tap chips for the ones we can't see. Main button: "Looks right".

### 4 · Problems and what they cost (approved)
- One summary sentence with the total and range, with "Estimated opportunity, not proven lost revenue" right under it.
- Problem cards in order: badge, title, "Might be worth about $X a month", then "Why we think this" (the proof first, then the number with editable guesses and the math in plain words).
- "Might apply. Tell us." problems have a dashed outline and no money, and ask "Yes, it does" / "No". "Also noticed" is a plain to-do list. Main button: "Show me tools for these".
- Website: the 3 problem cards side by side.

### 5 · Ways to fix it
- **Starter Kit first:** one card with 3 tools that fix all 3 problems (Ringwise $59, QuoteQuick $39, ReplyKind $25). The total ($123 a month) is shown against Mike's $200 budget, with one line on how the tools work together. Each tool is a row that opens its detail page.
- **"Or fix one problem at a time":** problem tabs (Missed calls / Quotes / Reviews). Each option card has a label for its fix type: Quick fix · Lowest cost · Use what you have · Done for you. Each card also shows the Verified stamp, price, the "why this pick" line, fit chips, and Fit N of 100 with setup time.
- **"Why not these?"** (collapsed): left-out tools with their badge and one reason, including the blocked scam.
- **A dark compare bar** stays at the bottom once 2 tools are picked ("2 picked · Compare").
- Only Verified tools that fit the budget. "Use what you have" shows on the Quotes tab (QuickBooks estimates).

### 6 · Tool detail
- **Top card:** big ✓ Verified stamp, name, price, maker, last checked date, one-line what it does. Main button: **Get help setting this up**. Then "Go to Ringwise" and "+ Compare".
- **Why it fits Mike's business:** works with Square, how far under budget, setup time, Spanish.
- **Rules for your business:** Maryland call-recording rule with an OK stamp and "Not legal advice. Ask your SBDC advisor."
- **Why you can trust it** (who made it, website age, clear prices, a person reviewed it, re-checked every 90 days) and **What happens to your data** (the 5 privacy answers, with "Show where we read this" for the quotes).
- **Price** table (small / medium / large, contract, "as of Nov 2026").
- **Get help** rows: Maryland SBDC (the office serving Frederick County, free), SCORE mentor, and a local helper marked "coming soon".
- Website: the top card, fit and rules on the left, trust, data, price and help on the right.

### 7 · Compare
- Up to 3 tools in a plain table: cost, works with your tools, setup, Spanish, Maryland call recording, trains AI on your data, contract, last checked. Rows that differ get a burgundy dot and a tint. "Best fit" tag on the top pick.
- One "Our take" sentence built from the table, then "Pick X" buttons.
- CallKeeper is a placeholder until the real catalog has a second Verified phone tool.

### 8 · Admin: discovery queue
- **Left:** what the queue is, **Run discovery now** (last run, runs every Sunday), where we look (directories, Square/QuickBooks/Jobber app stores, vendor applications, owner link checks), and catalog counts (Verified / waiting / Blocked).
- **Right:** "Waiting for a person": cards with the Safety Check results (✓ passed, ! warnings) and **Approve / Block**. Approving turns the badge ✓ Verified.
- **"Blocked automatically":** the scam (Squarre Voice AI) with a pink top and its red flags in plain words. It's never shown to owners, and owners who check its link see these reasons.
- Demo moment: press Run discovery and 2 new tools appear. One is ready for review, and the scam is already blocked.
- Reached from "For reviewers" on the landing page. "Owner view" goes back.
