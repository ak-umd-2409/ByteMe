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
}

export const PROBLEMS: Record<ProblemKey, ProblemDefinition> = {
  missed_inquiries: {
    key: "missed_inquiries",
    title: "Customer calls and messages go unanswered",
    explanation: "Some people who contact {name} don't reach anyone and don't get a call back, so they may hire someone else.",
    category: { key: "customer_communication", label: "Customer communication" },
    useCase: "missed-calls",
    impactModel: "missed_inquiries",
  },
  slow_responses: {
    key: "slow_responses",
    title: "Replies to customers are slow",
    explanation: "Emails, form requests or messages to {name} wait a long time for an answer. Customers who wait often go elsewhere.",
    category: { key: "customer_communication", label: "Customer communication" },
    useCase: "missed-calls",
    impactModel: "slow_responses",
  },
  no_online_booking: {
    key: "no_online_booking",
    title: "Customers can't book online",
    explanation: "Customers have to call {name} to book. People who want to book after hours or without calling may give up.",
    category: { key: "booking_scheduling", label: "Booking and scheduling" },
    useCase: "booking",
    impactModel: "no_online_booking",
  },
  scheduling_inefficiency: {
    key: "scheduling_inefficiency",
    title: "Scheduling takes too much time",
    explanation: "Booking, rescheduling and running late eat into the day at {name} and frustrate customers.",
    category: { key: "booking_scheduling", label: "Booking and scheduling" },
    useCase: "booking",
    impactModel: "time_cost_scheduling",
  },
  slow_quotes: {
    key: "slow_quotes",
    title: "Quotes and estimates take too long",
    explanation: "Customers wait for prices from {name}. Writing estimates by hand also takes the owner's evenings.",
    category: { key: "sales_quotes", label: "Quotes and sales" },
    useCase: "quotes",
    impactModel: "time_cost_quotes",
  },
  poor_review_management: {
    key: "poor_review_management",
    title: "Online reviews need attention",
    explanation: "Reviews shape whether new customers choose {name}. Replying to them, especially the unhappy ones, shows customers you care.",
    category: { key: "reputation", label: "Reviews and reputation" },
    useCase: "reviews",
    impactModel: null,
    noImpactReason: "We don't estimate money for reviews: the link between replies and revenue is too uncertain to put a fair number on.",
  },
  no_customer_follow_up: {
    key: "no_customer_follow_up",
    title: "Past customers aren't followed up",
    explanation: "{name} may be missing repeat business because there is no regular reminder or follow-up to past customers.",
    category: { key: "marketing", label: "Marketing and repeat business" },
    useCase: "marketing",
    impactModel: "follow_up",
  },
  repetitive_admin: {
    key: "repetitive_admin",
    title: "Paperwork and admin eat up time",
    explanation: "Invoices, receipts and data entry at {name} take hours that could go to customers.",
    category: { key: "admin", label: "Admin and bookkeeping" },
    useCase: "bookkeeping",
    impactModel: "time_cost_admin",
  },
  inconsistent_business_info: {
    key: "inconsistent_business_info",
    title: "Your business details don't match everywhere",
    explanation: "Google and the website for {name} show different details. Customers may call at the wrong time or use an old number.",
    category: { key: "online_presence", label: "Online presence" },
    useCase: null,
    impactModel: null,
    noImpactReason: "This is a quick manual fix, so we don't put a money figure on it.",
  },
};
