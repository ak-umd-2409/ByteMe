# Wireframes and style board (v1)

Person B · Nov 7, 2026 · Status: style board and screens 1–4 approved by Rishabh; screens 5–8 to follow in the next PR.

- **Click-through page:** [`docs/wireframes/mainstreet-wireframes.html`](../wireframes/mainstreet-wireframes.html). Open it in a browser. It has a Website (16:10) / Phone switch and moves one screen at a time.
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

### 5–8 (next PR)
Ways to fix it · Tool detail · Compare · Admin discovery queue.
