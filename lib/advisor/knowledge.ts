/**
 * What the Business Advisor knows that isn't in the catalog: plain-English explanations of
 * each kind of problem, a free first step, when AI isn't worth it, and what should stay human.
 *
 * Rules for this file: no tool names, no prices, no statistics, no legal claims beyond the
 * Maryland rules already in lib/rules. Tools, prices and links come only from the catalog.
 */
import type { IndustryKey } from "../business/types.ts";
import type { UseCase } from "../recommend/types.ts";

export interface UseCaseGuide {
  label: string;
  /** What AI can actually do here, one sentence. */
  whatAiDoes: string;
  /** Something useful the owner can do this week for free, with no AI at all. */
  freeFirst: { title: string; detail: string };
  /** When AI isn't worth it for this problem. */
  notNeeded: string;
  /** What should stay with a person. */
  keepHuman: string;
}

export const GUIDES: Record<UseCase, UseCaseGuide> = {
  "missed-calls": {
    label: "Missed calls",
    whatAiDoes: "An AI receptionist picks up when you can't, asks what the caller needs, and texts or emails you a summary.",
    freeFirst: {
      title: "Set a voicemail that says when you'll call back",
      detail: "Record a greeting with your hours and a promise to call back the same day, then check messages at set times. Free, about 10 minutes.",
    },
    notNeeded: "If you miss only a call or two a week, a clear voicemail and a same-day callback habit may be all you need.",
    keepHuman: "Prices, complaints and emergencies should still reach a person.",
  },
  booking: {
    label: "Booking and scheduling",
    whatAiDoes: "Online booking lets customers pick a time themselves and sends reminders, so there's less phone tag and fewer no-shows.",
    freeFirst: {
      title: "Say clearly how to book",
      detail: "Put your hours and how to book (call, text or email) at the top of your website and Google profile. Free, about 15 minutes.",
    },
    notNeeded: "If most bookings come from regulars who call you, a shared calendar may be enough.",
    keepHuman: "Special requests and rescheduling for regulars feel better from a person.",
  },
  reviews: {
    label: "Reviews",
    whatAiDoes: "Review tools draft replies and ask happy customers for a review. You approve anything before it's posted.",
    freeFirst: {
      title: "Reply to your last five reviews",
      detail: "Thank people by name, and ask your next three happy customers to leave a review. Free, about 20 minutes.",
    },
    notNeeded: "If you get a few reviews a month, replying yourself is quicker than setting up a tool.",
    keepHuman: "Replies to unhappy customers should be written or checked by you.",
  },
  marketing: {
    label: "Marketing and social posts",
    whatAiDoes: "AI writing tools draft posts, flyers and ads from a short description. You edit them and post.",
    freeFirst: {
      title: "Post one real photo a week",
      detail: "Share a photo of your work or your team with a one-line caption. Free, about 10 minutes a week.",
    },
    notNeeded: "Free chat assistants can draft a post. Paid writing tools mostly save time when you post a lot.",
    keepHuman: "Your own photos and voice are what make posts feel local, so keep them.",
  },
  "customer-messaging": {
    label: "Answering customer questions",
    whatAiDoes: "A website chat assistant answers common questions at any hour from answers you give it, and passes harder ones to you.",
    freeFirst: {
      title: "Write down your 10 most-asked questions",
      detail: "Put the answers on your website. Free, about an hour, and any chat tool would need them anyway.",
    },
    notNeeded: "If you get only a few messages a day, saved replies in your email or phone may be enough.",
    keepHuman: "Anything about a specific order, complaint or price should go to a person.",
  },
  quotes: {
    label: "Quotes and estimates",
    whatAiDoes: "Quoting tools turn your price list into neat, consistent quotes faster, and some let customers accept online.",
    freeFirst: {
      title: "Make a quote template",
      detail: "Put your standard prices, terms and a few photos in one template, so each quote starts mostly filled in. Free, about an hour.",
    },
    notNeeded: "If you send only a few quotes a month, a good template may save as much time as new software.",
    keepHuman: "Site visits and the final price are your call.",
  },
  bookkeeping: {
    label: "Bookkeeping and invoices",
    whatAiDoes: "Accounting software can sort expenses and chase unpaid invoices for you.",
    freeFirst: {
      title: "Set one weekly money hour",
      detail: "Send invoices and record receipts at the same time each week. Free.",
    },
    notNeeded: "Accounting software you already pay for may have these features built in, so check its settings first.",
    keepHuman: "Tax decisions belong with you and your accountant.",
  },
  inventory: {
    label: "Inventory",
    whatAiDoes: "Inventory tools warn you before you run low and suggest how much to reorder from past sales.",
    freeFirst: {
      title: "Keep a reorder list",
      detail: "List your 20 best sellers with the point at which you reorder, and check it weekly. Free.",
    },
    notNeeded: "A small or slow-moving stock rarely needs forecasting software.",
    keepHuman: "What to stock is a judgment about your customers that only you can make.",
  },
  "staff-scheduling": {
    label: "Staff schedules",
    whatAiDoes: "Scheduling tools build shifts from availability and let staff swap shifts on their phones.",
    freeFirst: {
      title: "Share one schedule",
      detail: "Keep one schedule everyone can see, and collect availability by the same day each week. Free.",
    },
    notNeeded: "With only a few staff, a shared calendar usually works.",
    keepHuman: "Conversations about hours and pay should stay personal.",
  },
  "website-seo": {
    label: "Being found online",
    whatAiDoes: "SEO tools show what people search for and suggest changes so your pages show up more often.",
    freeFirst: {
      title: "Update your Google Business Profile",
      detail: "Check your hours, services, photos and website link. Free, about 30 minutes.",
    },
    notNeeded: "For most local businesses, an up-to-date Google profile and reviews matter more than SEO software.",
    keepHuman: "What makes you different is yours to say.",
  },
  "email-marketing": {
    label: "Email to past customers",
    whatAiDoes: "Email tools help write and schedule newsletters and reminders to people who've agreed to hear from you.",
    freeFirst: {
      title: "Start a customer email list",
      detail: "Ask customers for their email at checkout, with permission, and send one useful note a month. Free.",
    },
    notNeeded: "Without a customer email list yet, collect emails first before paying for a tool.",
    keepHuman: "Offers and personal notes to regulars read better in your own words.",
  },
  "admin-paperwork": {
    label: "Paperwork and admin",
    whatAiDoes: "AI writing tools draft emails, policies and job posts, and tidy up your notes.",
    freeFirst: {
      title: "Keep standard replies in one place",
      detail: "Save your common emails and checklists in one shared document. Free.",
    },
    notNeeded: "If paperwork takes less than an hour a week, an AI tool may not pay off.",
    keepHuman: "Anything legal or contractual should be read by you before it goes out.",
  },
};

/** Where AI most often helps, by kind of business. Used only when we don't have the owner's own results. */
export const INDUSTRY_TOPICS: Record<IndustryKey, UseCase[]> = {
  hvac: ["missed-calls", "quotes", "reviews"],
  plumbing: ["missed-calls", "quotes", "reviews"],
  electrical: ["missed-calls", "quotes", "reviews"],
  landscaping: ["missed-calls", "quotes", "reviews"],
  cleaning: ["missed-calls", "booking", "reviews"],
  auto_repair: ["missed-calls", "booking", "reviews"],
  restaurant: ["missed-calls", "reviews", "marketing"],
  cafe: ["reviews", "marketing", "email-marketing"],
  salon: ["booking", "reviews", "customer-messaging"],
  retail: ["customer-messaging", "marketing", "email-marketing"],
  fitness: ["booking", "email-marketing", "reviews"],
  health_clinic: ["booking", "reviews", "admin-paperwork"],
  professional_services: ["quotes", "customer-messaging", "admin-paperwork"],
  farm: ["marketing", "email-marketing", "admin-paperwork"],
  other: ["missed-calls", "reviews", "marketing"],
};

export const INDUSTRY_LABEL: Record<IndustryKey, string> = {
  hvac: "heating and cooling",
  plumbing: "plumbing",
  electrical: "electrical",
  landscaping: "landscaping",
  cleaning: "cleaning",
  auto_repair: "auto repair",
  restaurant: "restaurant",
  cafe: "café",
  salon: "salon",
  retail: "retail",
  fitness: "fitness",
  health_clinic: "health practice",
  professional_services: "professional services",
  farm: "farm",
  other: "local",
};

export const EXPLAINER =
  "AI tools are software that can read and write. For a small business that usually means three things: answering customers when you're busy, " +
  "writing first drafts (posts, emails, quotes, review replies) and spotting patterns in your records. You stay in charge: you choose what it handles and you check its work.";

export const START_SMALL = "The easiest place to start is one task that eats your time every week. Fix that one, check after two weeks whether it helped, and only then add another.";
