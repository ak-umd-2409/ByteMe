/**
 * Everyday challenges by kind of business: the starting point for challenge suggestions.
 *
 * These are prompts the owner can tap, not findings. A suggestion only becomes a finding when the
 * owner picks it or describes it, or when public evidence backs it (see suggest.ts). `problem`
 * links to the problem taxonomy (lib/problems) when one fits; `useCase` links to Part 4's tool
 * categories. Many entries have neither: discovery is not limited to the taxonomy.
 */
import type { IndustryKey } from "../business/types.ts";
import type { ProblemKey } from "../problems/types.ts";
import type { UseCase } from "../recommend/types.ts";

export interface LibraryEntry {
  id: string;
  /** Owner voice, under ~70 characters. */
  text: string;
  /** Words an owner might type about this; used to narrow suggestions while typing. */
  keywords: string[];
  problem?: ProblemKey;
  useCase?: UseCase;
}

const FIELD: LibraryEntry[] = [
  { id: "field-onsite-calls", text: "Answering calls while I'm on a job", keywords: ["call", "phone", "voicemail", "job", "site", "answer", "missed"], problem: "missed_inquiries", useCase: "missed-calls" },
  { id: "field-estimate-followup", text: "Following up on estimates nobody answered", keywords: ["estimate", "quote", "follow", "bid", "proposal", "chase"], problem: "slow_quotes", useCase: "quotes" },
  { id: "field-writing-quotes", text: "Writing quotes at night after jobs", keywords: ["quote", "estimate", "night", "evening", "write", "paperwork"], problem: "slow_quotes", useCase: "quotes" },
  { id: "field-emergency", text: "Handling urgent or emergency calls after hours", keywords: ["emergency", "urgent", "after hours", "night", "weekend", "call"], problem: "missed_inquiries", useCase: "missed-calls" },
  { id: "field-scheduling", text: "Scheduling jobs and moving them around", keywords: ["schedule", "dispatch", "calendar", "reschedule", "route", "appointment"], problem: "scheduling_inefficiency", useCase: "booking" },
  { id: "field-reminders", text: "Reminding customers about maintenance or the next visit", keywords: ["remind", "maintenance", "tune", "seasonal", "repeat", "service plan"], problem: "no_customer_follow_up", useCase: "marketing" },
  { id: "field-invoices", text: "Sending invoices and chasing payments", keywords: ["invoice", "payment", "paid", "chase", "billing", "money"], problem: "repetitive_admin", useCase: "bookkeeping" },
  { id: "field-reviews", text: "Getting happy customers to leave reviews", keywords: ["review", "google", "rating", "reputation", "stars"], problem: "poor_review_management", useCase: "reviews" },
];

const FOOD: LibraryEntry[] = [
  { id: "food-phone-rush", text: "Answering the phone during the rush", keywords: ["phone", "call", "rush", "busy", "order", "answer"], problem: "missed_inquiries", useCase: "missed-calls" },
  { id: "food-questions", text: "Answering the same questions about hours, menu and parking", keywords: ["question", "hours", "menu", "same", "message", "dm", "parking"], problem: "slow_responses", useCase: "customer-messaging" },
  { id: "food-catering", text: "Taking catering and large orders by text or phone", keywords: ["catering", "large order", "party", "event", "text", "order"], useCase: "customer-messaging" },
  { id: "food-reservations", text: "Managing reservations and no-shows", keywords: ["reservation", "table", "no-show", "booking", "waitlist"], problem: "scheduling_inefficiency", useCase: "booking" },
  { id: "food-social", text: "Keeping up with social media posts", keywords: ["social", "instagram", "facebook", "tiktok", "post", "content"], useCase: "marketing" },
  { id: "food-staff-shifts", text: "Making the staff schedule and covering shifts", keywords: ["staff", "shift", "schedule", "employee", "cover", "call out"], useCase: "staff-scheduling" },
  { id: "food-inventory", text: "Ordering supplies and tracking inventory", keywords: ["inventory", "stock", "supplies", "order", "waste", "vendor"], useCase: "inventory" },
  { id: "food-reviews", text: "Replying to reviews, especially the bad ones", keywords: ["review", "yelp", "google", "rating", "complaint", "reply"], problem: "poor_review_management", useCase: "reviews" },
];

const SALON: LibraryEntry[] = [
  { id: "salon-booking-calls", text: "Handling booking calls and texts between clients", keywords: ["booking", "appointment", "call", "text", "between", "client"], problem: "scheduling_inefficiency", useCase: "booking" },
  { id: "salon-cancellations", text: "Last-minute cancellations and no-shows", keywords: ["cancel", "no-show", "late", "empty", "gap", "deposit"], problem: "scheduling_inefficiency", useCase: "booking" },
  { id: "salon-rebooking", text: "Getting clients to rebook their next visit", keywords: ["rebook", "repeat", "return", "next visit", "regular", "loyal"], problem: "no_customer_follow_up", useCase: "marketing" },
  { id: "salon-reminders", text: "Sending appointment reminders", keywords: ["remind", "reminder", "confirm", "text", "appointment"], problem: "scheduling_inefficiency", useCase: "booking" },
  { id: "salon-social", text: "Posting my work on Instagram and social media", keywords: ["social", "instagram", "post", "photos", "tiktok", "content"], useCase: "marketing" },
  { id: "salon-questions", text: "Answering price and availability questions in DMs", keywords: ["dm", "message", "price", "question", "availability", "instagram"], problem: "slow_responses", useCase: "customer-messaging" },
  { id: "salon-reviews", text: "Getting more reviews from happy clients", keywords: ["review", "google", "rating", "stars"], problem: "poor_review_management", useCase: "reviews" },
];

const RETAIL: LibraryEntry[] = [
  { id: "retail-questions", text: "Answering the same customer questions every day", keywords: ["question", "same", "message", "email", "dm", "stock", "hours"], problem: "slow_responses", useCase: "customer-messaging" },
  { id: "retail-inventory", text: "Keeping track of stock and reordering", keywords: ["inventory", "stock", "reorder", "count", "supplier", "out of stock"], useCase: "inventory" },
  { id: "retail-social", text: "Keeping up with social media and promotions", keywords: ["social", "instagram", "facebook", "post", "promotion", "sale"], useCase: "marketing" },
  { id: "retail-email", text: "Bringing past customers back with emails or texts", keywords: ["email", "newsletter", "repeat", "loyalty", "past customer", "text"], problem: "no_customer_follow_up", useCase: "email-marketing" },
  { id: "retail-online", text: "Getting found online and selling online", keywords: ["website", "online", "google", "search", "seo", "shop"], useCase: "website-seo" },
  { id: "retail-staff", text: "Scheduling staff shifts", keywords: ["staff", "shift", "schedule", "employee"], useCase: "staff-scheduling" },
  { id: "retail-books", text: "Bookkeeping and sales tax", keywords: ["bookkeeping", "tax", "receipt", "accounting", "quickbooks"], problem: "repetitive_admin", useCase: "bookkeeping" },
];

const FITNESS: LibraryEntry[] = [
  { id: "fit-class-booking", text: "Managing class bookings and waitlists", keywords: ["class", "booking", "waitlist", "spots", "schedule"], problem: "scheduling_inefficiency", useCase: "booking" },
  { id: "fit-trials", text: "Following up with people who tried a class", keywords: ["trial", "follow", "lead", "intro", "convert", "sign up"], problem: "no_customer_follow_up", useCase: "marketing" },
  { id: "fit-retention", text: "Keeping members from cancelling", keywords: ["cancel", "member", "retention", "churn", "quit"], problem: "no_customer_follow_up", useCase: "email-marketing" },
  { id: "fit-questions", text: "Answering membership and pricing questions", keywords: ["question", "price", "membership", "message", "dm"], problem: "slow_responses", useCase: "customer-messaging" },
  { id: "fit-social", text: "Keeping up with social media", keywords: ["social", "instagram", "post", "content", "video"], useCase: "marketing" },
  { id: "fit-instructors", text: "Scheduling instructors and covering classes", keywords: ["instructor", "coach", "staff", "cover", "schedule"], useCase: "staff-scheduling" },
];

const CLINIC: LibraryEntry[] = [
  { id: "clinic-phones", text: "Keeping up with phone calls at the front desk", keywords: ["phone", "call", "front desk", "hold", "voicemail"], problem: "missed_inquiries", useCase: "missed-calls" },
  { id: "clinic-no-shows", text: "Missed appointments and late cancellations", keywords: ["no-show", "cancel", "missed", "late", "appointment"], problem: "scheduling_inefficiency", useCase: "booking" },
  { id: "clinic-reminders", text: "Recall reminders for checkups and cleanings", keywords: ["recall", "reminder", "checkup", "cleaning", "follow"], problem: "no_customer_follow_up", useCase: "marketing" },
  { id: "clinic-forms", text: "Intake forms and paperwork", keywords: ["form", "intake", "paperwork", "insurance", "admin"], problem: "repetitive_admin", useCase: "admin-paperwork" },
  { id: "clinic-billing", text: "Billing and insurance follow-up", keywords: ["billing", "insurance", "claim", "payment", "invoice"], problem: "repetitive_admin", useCase: "bookkeeping" },
  { id: "clinic-reviews", text: "Getting more patient reviews", keywords: ["review", "google", "rating"], problem: "poor_review_management", useCase: "reviews" },
];

const PRO: LibraryEntry[] = [
  { id: "pro-leads", text: "Responding to new inquiries quickly", keywords: ["inquiry", "lead", "email", "respond", "new client", "form"], problem: "slow_responses", useCase: "customer-messaging" },
  { id: "pro-proposals", text: "Writing proposals and following up on them", keywords: ["proposal", "quote", "follow", "estimate", "engagement"], problem: "slow_quotes", useCase: "quotes" },
  { id: "pro-scheduling", text: "Back-and-forth emails to schedule meetings", keywords: ["meeting", "schedule", "calendar", "email", "consult"], problem: "scheduling_inefficiency", useCase: "booking" },
  { id: "pro-docs", text: "Collecting documents and paperwork from clients", keywords: ["document", "paperwork", "forms", "collect", "chase"], problem: "repetitive_admin", useCase: "admin-paperwork" },
  { id: "pro-invoicing", text: "Invoicing and tracking time", keywords: ["invoice", "billing", "time", "hours", "payment"], problem: "repetitive_admin", useCase: "bookkeeping" },
  { id: "pro-marketing", text: "Staying in touch with past clients", keywords: ["newsletter", "email", "past client", "referral", "follow"], problem: "no_customer_follow_up", useCase: "email-marketing" },
];

const FARM: LibraryEntry[] = [
  { id: "farm-orders", text: "Taking orders and preorders by text, email and phone", keywords: ["order", "preorder", "text", "email", "csa", "phone"], useCase: "customer-messaging" },
  { id: "farm-social", text: "Telling customers what's in season or at market", keywords: ["social", "post", "season", "market", "newsletter", "update"], useCase: "marketing" },
  { id: "farm-inventory", text: "Tracking what's available and what sold", keywords: ["inventory", "stock", "harvest", "sold", "available"], useCase: "inventory" },
  { id: "farm-books", text: "Bookkeeping and receipts", keywords: ["bookkeeping", "receipt", "tax", "accounting"], problem: "repetitive_admin", useCase: "bookkeeping" },
];

const COMMON: LibraryEntry[] = [
  { id: "common-calls", text: "Missing calls when I'm busy", keywords: ["call", "phone", "missed", "voicemail", "busy"], problem: "missed_inquiries", useCase: "missed-calls" },
  { id: "common-replies", text: "Replying to emails and messages", keywords: ["email", "message", "reply", "inbox", "text", "respond"], problem: "slow_responses", useCase: "customer-messaging" },
  { id: "common-paperwork", text: "Invoices, receipts and paperwork", keywords: ["invoice", "paperwork", "receipt", "admin", "bookkeeping"], problem: "repetitive_admin", useCase: "bookkeeping" },
  { id: "common-social", text: "Keeping up with social media", keywords: ["social", "instagram", "facebook", "post", "marketing"], useCase: "marketing" },
  { id: "common-followup", text: "Following up with past customers", keywords: ["follow", "repeat", "past customer", "remind", "email"], problem: "no_customer_follow_up", useCase: "email-marketing" },
  { id: "common-scheduling", text: "Scheduling appointments", keywords: ["schedule", "appointment", "booking", "calendar"], problem: "scheduling_inefficiency", useCase: "booking" },
];

const BY_INDUSTRY: Record<IndustryKey, LibraryEntry[]> = {
  hvac: FIELD,
  plumbing: FIELD,
  electrical: FIELD,
  landscaping: FIELD,
  cleaning: FIELD,
  auto_repair: FIELD,
  restaurant: FOOD,
  cafe: FOOD,
  salon: SALON,
  retail: RETAIL,
  fitness: FITNESS,
  health_clinic: CLINIC,
  professional_services: PRO,
  farm: FARM,
  other: COMMON,
};

export function libraryFor(industry: IndustryKey | string | null | undefined): LibraryEntry[] {
  return BY_INDUSTRY[(industry ?? "other") as IndustryKey] ?? COMMON;
}

/** Every entry, for looking a suggestion up by id. */
export const ALL_ENTRIES: LibraryEntry[] = [...new Map([FIELD, FOOD, SALON, RETAIL, FITNESS, CLINIC, PRO, FARM, COMMON].flat().map((e) => [e.id, e])).values()];
