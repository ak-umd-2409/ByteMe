/**
 * Ready-to-use words (spec §5.2): a phone greeting, answers to common questions and
 * three review replies, each ready to copy.
 *
 * Built only from facts we hold about the business (name, hours, address, phone,
 * website). Nothing is made up: an answer we can't fill from a fact is left out, and
 * anything only the owner knows is a [blank in brackets] for them to fill.
 */
import type { CatalogRecord } from "../catalog/types.ts";
import type { BusinessCard } from "../journey/types.ts";
import type { Plan } from "./plan.ts";

export interface ReadyText {
  id: string;
  title: string;
  /** Where to use it, in one line. */
  use: string;
  text: string;
  /** The [blanks] the owner should fill in before using it. */
  blanks: string[];
}

const blanksIn = (text: string) => [...new Set(text.match(/\[[^\]]+\]/g) ?? [])];
const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

function item(id: string, title: string, use: string, text: string): ReadyText {
  return { id, title, use, text, blanks: blanksIn(text) };
}

export function readyContent(business: Pick<BusinessCard, "name" | "hours" | "address" | "phone" | "website">, plan: Plan, catalog: CatalogRecord[]): ReadyText[] {
  const name = business.name.trim();
  const hours = clean(business.hours);
  const address = clean(business.address);
  const phone = clean(business.phone);
  const website = clean(business.website)?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? null;

  // A recording tool requires a reviewed notice and consent flow before activation.
  // The draft must not imply that a generic announcement alone supplies consent.
  const byId = new Map(catalog.map((r) => [r.id, r]));
  const records = plan.sections.some((s) => s.tool && byId.get(s.tool.id)?.rulesFlags.recordsCalls === true);
  const recorded = records ? " [If calls are recorded, add a legally reviewed notice and consent flow before enabling recording.]" : "";

  const out: ReadyText[] = [];

  out.push(
    item(
      "greeting",
      "Phone greeting",
      "For you, your staff or an AI receptionist to say when answering.",
      `Thanks for calling ${name}.${recorded} This is [your name]. How can I help you today?`,
    ),
  );
  out.push(
    item(
      "after-hours",
      "After-hours message",
      "For voicemail or an answering tool when you're closed.",
      `Thanks for calling ${name}. We're closed right now.${hours ? ` Our hours are ${hours}.` : ""}${recorded} Please leave your name, number and what you need, and we'll call you back [when you'll call back, e.g. the next business morning].`,
    ),
  );

  const faq: string[] = [];
  if (hours) faq.push(`What are your hours?\nWe're open ${hours}.`);
  if (address) faq.push(`Where are you?\nWe're at ${address}.`);
  if (phone || website) faq.push(`How do I reach you?\n${[phone ? `Call us at ${phone}` : null, website ? `visit ${website}` : null].filter(Boolean).join(" or ")}.`);
  faq.push("Do you offer [a service people often ask about]?\n[Your answer.]");
  if (faq.length > 1) out.push(item("faq", "Answers to common questions", "For your website, Google profile or an AI receptionist's notes. Only lists details we found; check them.", faq.join("\n\n")));

  const signOff = `[Your name], ${name}`;
  out.push(
    item(
      "review-happy",
      "Reply to a happy review",
      "Thank them by name and mention what they liked.",
      `Thank you, [customer's name]! We're so glad [what they liked]. We look forward to seeing you again.\n– ${signOff}`,
    ),
  );
  out.push(
    item(
      "review-mixed",
      "Reply to a mixed review",
      "Thank them, own the part that went wrong, say what you'll change.",
      `Thank you for the honest feedback, [customer's name]. We're glad [what went well], and we're sorry about [what went wrong]. We're [what you're changing]. We hope you'll give us another try.\n– ${signOff}`,
    ),
  );
  out.push(
    item(
      "review-unhappy",
      "Reply to an unhappy review",
      "Apologize, keep it short, take the details offline. Don't share their private details.",
      `[Customer's name], I'm sorry. That isn't the experience we want for anyone. ${phone ? `Please call us at ${phone}` : "Please contact us directly"} so we can make this right.\n– ${signOff}`,
    ),
  );
  return out;
}
