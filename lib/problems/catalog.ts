import type { UseCase } from "../recommend/types.ts";
import type { ProblemKey } from "./types.ts";

/**
 * The problems MainStreet AI can identify, in plain English, plus their link
 * to Part 4's use cases (`lib/recommend/types.ts`).
 */
export interface ProblemDefinition {
  key: ProblemKey;
  title: string;
  /** Template explanation; `{name}` is replaced with the business name. */
  explanation: string;
  category: { key: string; label: string };
  useCase: UseCase | null;
  /** Impact model id in impact.ts, or null when we don't estimate money. */
  impactModel: string | null;
  noImpactReason?: string;
  /** ≤ 70 chars: the business consequence, for the card's second line. */
  whyItMatters: string;
  /** ≤ 60 chars: the first concrete thing to do. */
  nextStep: string;
  /** How big the fix is. "free" = no new tool needed. */
  effort: { kind: "free" | "tool"; label: string };
}

export const PROBLEMS: Record<ProblemKey, ProblemDefinition> = {
  missed_inquiries: {
    key: "missed_inquiries",
    title: "Customer calls and messages go unanswered",
    explanation: "Some people who contact {name} don't reach anyone and don't get a call back, so they may hire someone else.",
    category: { key: "customer_communication", label: "Customer communication" },
    useCase: "missed-calls",
    impactModel: "missed_inquiries",
    whyItMatters: "Every unanswered call can be a job that goes to a competitor.",
    nextStep: "Make sure every call is answered or called back fast",
    effort: { kind: "tool", label: "Needs a tool" },
  },
  slow_responses: {
    key: "slow_responses",
    title: "Replies to customers are slow",
    explanation: "Emails, form requests or messages to {name} wait a long time for an answer. Customers who wait often go elsewhere.",
    category: { key: "customer_communication", label: "Customer communication" },
    useCase: "customer-messaging",
    impactModel: "slow_responses",
    whyItMatters: "Customers who wait for a reply often hire whoever answers first.",
    nextStep: "Reply to every message the same day",
    effort: { kind: "tool", label: "Needs a tool" },
  },
  no_online_booking: {
    key: "no_online_booking",
    title: "Customers can't book online",
    explanation: "Customers have to call {name} to book. People who want to book after hours or without calling may give up.",
    category: { key: "booking_scheduling", label: "Booking and scheduling" },
    useCase: "booking",
    impactModel: "no_online_booking",
    whyItMatters: "Some customers would rather book online than call.",
    nextStep: "Let customers pick a time online",
    effort: { kind: "tool", label: "Needs a tool" },
  },
  scheduling_inefficiency: {
    key: "scheduling_inefficiency",
    title: "Scheduling takes too much time",
    explanation: "Booking, rescheduling and running late eat into the day at {name} and frustrate customers.",
    category: { key: "booking_scheduling", label: "Booking and scheduling" },
    useCase: "booking",
    impactModel: "time_cost_scheduling",
    whyItMatters: "Time spent juggling the schedule is time not spent on jobs.",
    nextStep: "Move scheduling into one shared calendar",
    effort: { kind: "tool", label: "Needs a tool" },
  },
  slow_quotes: {
    key: "slow_quotes",
    title: "Quotes and estimates take too long",
    explanation: "Customers wait for prices from {name}. Writing estimates by hand also takes the owner's evenings.",
    category: { key: "sales_quotes", label: "Quotes and sales" },
    useCase: "quotes",
    impactModel: "time_cost_quotes",
    whyItMatters: "Customers often go with whoever sends a price first.",
    nextStep: "Send quotes the same day as the visit",
    effort: { kind: "tool", label: "Needs a tool" },
  },
  poor_review_management: {
    key: "poor_review_management",
    title: "Online reviews need attention",
    explanation: "Reviews shape whether new customers choose {name}. Replying to them, especially the unhappy ones, shows customers you care.",
    category: { key: "reputation", label: "Reviews and reputation" },
    useCase: "reviews",
    impactModel: null,
    noImpactReason: "We don't estimate money for reviews: the link between replies and revenue is too uncertain to put a fair number on.",
    whyItMatters: "New customers compare ratings before they call.",
    nextStep: "Ask happy customers to review you where you rate lowest",
    effort: { kind: "tool", label: "Needs a tool" },
  },
  no_customer_follow_up: {
    key: "no_customer_follow_up",
    title: "Past customers aren't followed up",
    explanation: "{name} may be missing repeat business because there is no regular reminder or follow-up to past customers.",
    category: { key: "marketing", label: "Marketing and repeat business" },
    useCase: "marketing",
    impactModel: "follow_up",
    whyItMatters: "Past customers are the cheapest customers to win back.",
    nextStep: "Send seasonal tune-up reminders to past customers",
    effort: { kind: "tool", label: "Needs a tool" },
  },
  repetitive_admin: {
    key: "repetitive_admin",
    title: "Paperwork and admin eat up time",
    explanation: "Invoices, receipts and data entry at {name} take hours that could go to customers.",
    category: { key: "admin", label: "Admin and bookkeeping" },
    useCase: "bookkeeping",
    impactModel: "time_cost_admin",
    whyItMatters: "Hours of paperwork take you away from paid work.",
    nextStep: "Automate invoices and receipts",
    effort: { kind: "tool", label: "Needs a tool" },
  },
  inconsistent_business_info: {
    key: "inconsistent_business_info",
    title: "Your business details don't match everywhere",
    explanation: "{name} shows different hours, addresses or phone numbers on different sites. Customers may think you're closed or call an old number.",
    category: { key: "online_presence", label: "Online presence" },
    useCase: null,
    impactModel: "wrong_info",
    whyItMatters: "People who see “closed” or an old number call someone else.",
    nextStep: "Make hours, address and phone match on every listing",
    effort: { kind: "free", label: "Free · about an hour" },
  },
};
