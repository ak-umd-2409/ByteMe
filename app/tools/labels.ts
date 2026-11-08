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

/** "2026-11-08" or an ISO timestamp → "Nov 8, 2026". Anything else is returned as it came. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}
