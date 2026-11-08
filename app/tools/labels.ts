import type { UseCase } from "@/lib/recommend/types.ts";

/** Owner words for the 12 problem types. */
export const USE_CASE_LABEL: Record<UseCase, string> = {
  "missed-calls": "Missed calls",
  booking: "Online booking",
  reviews: "Reviews",
  marketing: "Marketing",
  "customer-messaging": "Customer messages",
  quotes: "Quotes and estimates",
  bookkeeping: "Bookkeeping",
  inventory: "Inventory",
  "staff-scheduling": "Staff scheduling",
  "website-seo": "Website and search",
  "email-marketing": "Email marketing",
  "admin-paperwork": "Paperwork",
};
