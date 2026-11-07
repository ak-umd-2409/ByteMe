import { industryInfo } from "../business/industry.ts";
import type { OnboardingProfile, ReviewAnalysis, ReviewThemeKey, WebsiteAnalysis } from "../business/types.ts";
import { PROBLEM_KEYS, type EvidenceSource, type ProblemKey, type Signal } from "./types.ts";

/**
 * Turn Part 2 analyses into evidence signals.
 *
 * `verified: true` only for things directly observed: an exact review quote,
 * something present or absent on pages we actually read, a Google listing
 * field, or the owner's own words. Inferences ("HVAC emergencies happen at
 * night") are `verified: false` and can only support a hypothesis.
 */
export interface SignalInput {
  profile: OnboardingProfile;
  reviews: ReviewAnalysis;
  website: WebsiteAnalysis | null;
}

/** Review theme → problems it is evidence for, with per-mention weight. */
const THEME_TO_PROBLEMS: Partial<Record<ReviewThemeKey, [ProblemKey, number][]>> = {
  missed_calls: [["missed_inquiries", 0.6]],
  no_callback: [["missed_inquiries", 0.6]],
  slow_response: [["slow_responses", 0.6]],
  poor_communication: [["slow_responses", 0.4]],
  hard_to_book: [
    ["no_online_booking", 0.6],
    ["scheduling_inefficiency", 0.3],
  ],
  scheduling_delays: [["scheduling_inefficiency", 0.5]],
  late_or_no_show: [["scheduling_inefficiency", 0.5]],
  quote_delays: [["slow_quotes", 0.6]],
  pricing_unclear: [["slow_quotes", 0.3]],
  billing_problems: [["repetitive_admin", 0.4]],
};

const REVIEW_SOURCE: Record<string, EvidenceSource> = {
  google: "google_review",
  owner_pasted: "pasted_review",
  mock: "sample_review",
};

/** Keywords in the owner's "what eats your week?" answer. */
const TIME_SINK_RULES: [RegExp, ProblemKey][] = [
  [/\b(miss(ed|ing)? calls?|phone|voicemail|calls? (go|going) unanswered|can'?t answer)/i, "missed_inquiries"],
  [/\b(quotes?|estimates?|bids?|proposals?)\b/i, "slow_quotes"],
  [/\b(schedul\w*|appointments?|booking|calendar|dispatch\w*)\b/i, "scheduling_inefficiency"],
  [/\b(invoic\w*|bookkeep\w*|receipts?|paperwork|admin|data entry|payroll|billing)\b/i, "repetitive_admin"],
  [/\breviews?\b/i, "poor_review_management"],
  [/\b(emails?|messages?|texts?|repl(y|ies|ying)|respond\w*|inbox)\b/i, "slow_responses"],
  [/\b(follow[- ]?ups?|repeat customers?|remind\w*|newsletter|marketing|social media)\b/i, "no_customer_follow_up"],
];

/** Parse a clock time like "5:00 PM", "6pm", "17:30" into minutes after midnight. */
export function parseClock(text: string): number | null {
  const m = text.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] ?? 0);
  const meridiem = m[3]?.toLowerCase().replace(/\./g, "");
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (!meridiem && hour <= 12) return null; // ambiguous without am/pm
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

const TIME_TOKEN = /\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?/gi;

/** Weekday closing time from Google weekday descriptions ("Monday: 7:00 AM – 5:00 PM"). */
export function googleWeekdayClose(hours: string[]): number | null {
  const closes = hours
    .filter((line) => /^(monday|tuesday|wednesday|thursday|friday)\b/i.test(line))
    .map((line) => {
      const times = line.split(":").slice(1).join(":").match(TIME_TOKEN) ?? [];
      return times.length >= 2 ? parseClock(times[times.length - 1]) : null;
    })
    .filter((v): v is number => v !== null);
  if (closes.length === 0) return null;
  // Most common weekday closing time.
  const counts = new Map<number, number>();
  for (const c of closes) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

/** Weekday closing time stated on the website, e.g. "Mon–Fri 7am–6pm". */
export function websiteWeekdayClose(lines: string[]): { minutes: number; line: string } | null {
  for (const line of lines) {
    if (!/\b(mon|tue|wed|thu|fri|weekday)/i.test(line)) continue;
    const times = line.match(TIME_TOKEN) ?? [];
    if (times.length < 2) continue;
    // Website times are often "7am–6pm": inherit am/pm only from the token itself.
    const close = parseClock(times[1]);
    if (close !== null) return { minutes: close, line };
  }
  return null;
}

const clockLabel = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
};

const digits = (s: string) => s.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

export function collectSignals({ profile, reviews, website }: SignalInput): Signal[] {
  const signals: Signal[] = [];
  let n = 0;
  const push = (s: Omit<Signal, "id">) => signals.push({ ...s, id: `sig-${++n}` });
  const industry = industryInfo(profile.business.industry.value ?? "other");

  // 1) Customer reviews — exact quotes only.
  for (const theme of reviews.complaints) {
    for (const [problem, weight] of THEME_TO_PROBLEMS[theme.key] ?? []) {
      for (const ev of theme.evidence) {
        push({
          problem,
          source: REVIEW_SOURCE[ev.source] ?? "google_review",
          observation: `A customer review mentions: ${theme.label.toLowerCase()}.`,
          quote: ev.quote,
          reference: { reviewId: ev.reviewId },
          weight,
          verified: true,
        });
      }
    }
  }

  // 2) Website — only what we actually read.
  if (website?.reachable) {
    const home = website.pages.find((p) => p.status === "scanned")?.url ?? website.requestedUrl;
    if (!website.booking.onlineBooking && (industry.appointmentBased || website.phoneOnlyCallsToAction.length > 0)) {
      push({
        problem: "no_online_booking",
        source: "website",
        observation: `We read ${website.pagesScanned} page${website.pagesScanned === 1 ? "" : "s"} of your website and found no online booking link or scheduling tool.`,
        quote: null,
        reference: { url: home },
        weight: 0.5,
        verified: true,
      });
    }
    for (const cta of website.phoneOnlyCallsToAction) {
      const quoteRelated = /quote|estimate/i.test(cta.value);
      push({
        problem: quoteRelated ? "slow_quotes" : "no_online_booking",
        source: "website",
        observation: quoteRelated ? "Your website asks customers to call for a quote." : "Your website asks customers to call to book.",
        quote: cta.evidence.snippet,
        reference: { url: cta.evidence.url },
        weight: quoteRelated ? 0.3 : 0.3,
        verified: true,
      });
    }
    for (const message of website.afterHoursMessages) {
      push({
        problem: "missed_inquiries",
        source: "website",
        observation: "Your website tells after-hours callers to leave a message and wait for a call back.",
        quote: message.evidence.snippet,
        reference: { url: message.evidence.url },
        weight: 0.4,
        verified: true,
      });
    }
    const googleClose = googleWeekdayClose(profile.business.hours.source === "website" ? [] : profile.business.hours.value ?? []);
    const siteClose = websiteWeekdayClose(website.hours.map((h) => h.value));
    if (googleClose !== null && siteClose && Math.abs(googleClose - siteClose.minutes) >= 30) {
      push({
        problem: "inconsistent_business_info",
        source: "website",
        observation: `Google says you close at ${clockLabel(googleClose)} on weekdays, but your website says ${clockLabel(siteClose.minutes)}.`,
        quote: siteClose.line,
        reference: { url: website.hours.find((h) => h.value === siteClose.line)?.evidence.url ?? home, field: "business.hours" },
        weight: 0.8,
        verified: true,
      });
    }
    const googlePhone = profile.business.phone.source === "google_places" || profile.business.phone.source === "mock_places" ? profile.business.phone.value : null;
    if (googlePhone && website.phones.length > 0 && !website.phones.some((p) => digits(p.value) === digits(googlePhone))) {
      push({
        problem: "inconsistent_business_info",
        source: "website",
        observation: `The phone number on your website (${website.phones[0].value}) doesn't match Google (${googlePhone}).`,
        quote: website.phones[0].evidence.snippet,
        reference: { url: website.phones[0].evidence.url, field: "business.phone" },
        weight: 0.6,
        verified: true,
      });
    }
    if (website.phones.length > 0 && !website.contactForm.present && website.emails.length === 0) {
      push({
        problem: "missed_inquiries",
        source: "website",
        observation: "Your website offers a phone number but no contact form or email, so every inquiry depends on someone answering.",
        quote: null,
        reference: { url: home },
        weight: 0.2,
        verified: true,
      });
    }
  }

  // 3) Google listing facts used for inferences (not proof on their own).
  const close = googleWeekdayClose(profile.business.hours.value ?? []);
  if (industry.afterHoursDemand && close !== null && close <= 18 * 60) {
    push({
      problem: "missed_inquiries",
      source: "google_profile",
      observation: `Your listed hours end at ${clockLabel(close)} on weekdays. ${industry.label} customers often need help in the evening, when nobody may be answering.`,
      quote: (profile.business.hours.value ?? []).find((l) => /^monday/i.test(l)) ?? null,
      reference: { field: "business.hours" },
      weight: 0.3,
      verified: false,
    });
  }
  const rating = profile.business.rating.value;
  const count = profile.business.reviewCount.value;
  if (rating !== null && count !== null && count >= 10 && rating < 4.0) {
    push({
      problem: "poor_review_management",
      source: "google_profile",
      observation: `Your Google rating is ${rating} from ${count} reviews. Replying to critical reviews may help — we can't see your replies, so this is a guess.`,
      quote: null,
      reference: { field: "business.rating" },
      weight: 0.3,
      verified: false,
    });
  }

  // 4) Tools the owner confirmed. A missing tool is only an inference, so these never count as verified
  //    evidence on their own: they can support a problem, not create one.
  const tools = profile.technology.currentTools;
  if (tools.source === "owner") {
    const names = (tools.value ?? []).map((t) => t.toLowerCase());
    const hasFieldService = names.some((t) => /jobber|housecall|servicetitan|workiz/.test(t));
    if (industry.quoteBased && !hasFieldService) {
      push({
        problem: "slow_quotes",
        source: "tech_stack",
        observation: "You told us the tools you use, and none of them create quotes or estimates.",
        quote: null,
        reference: { field: "technology.currentTools" },
        weight: 0.3,
        verified: false, // inferred from a missing tool, not something we observed
      });
    }
    if (industry.appointmentBased && !hasFieldService && !names.some((t) => /calendly|acuity|square appointments|booksy|vagaro|mindbody/.test(t))) {
      push({
        problem: "scheduling_inefficiency",
        source: "tech_stack",
        observation: "You told us the tools you use, and none of them handle scheduling.",
        quote: null,
        reference: { field: "technology.currentTools" },
        weight: 0.3,
        verified: false, // inferred from a missing tool, not something we observed
      });
    }
  }

  // 5) The owner's own words.
  const reported = profile.owner.reportedProblems.value ?? [];
  for (const key of reported) {
    if ((PROBLEM_KEYS as readonly string[]).includes(key)) {
      push({
        problem: key as ProblemKey,
        source: "owner_reported",
        observation: "You told us this is a problem.",
        quote: null,
        reference: { field: "owner.reportedProblems" },
        weight: 0.9,
        verified: true,
      });
    }
  }
  const timeSink = profile.owner.biggestTimeSink.value;
  if (timeSink) {
    for (const [pattern, problem] of TIME_SINK_RULES) {
      if (pattern.test(timeSink)) {
        push({
          problem,
          source: "owner_reported",
          observation: "You said this takes up your week.",
          quote: timeSink.slice(0, 240),
          reference: { field: "owner.biggestTimeSink" },
          weight: 0.7,
          verified: true,
        });
      }
    }
  }

  // 6) Industry patterns — only where nothing else points to the problem.
  const covered = new Set(signals.map((s) => s.problem));
  for (const key of industry.typicalProblems) {
    if (!covered.has(key as ProblemKey)) {
      push({
        problem: key as ProblemKey,
        source: "industry_pattern",
        observation: `This is common for ${industry.label.toLowerCase()} businesses, but we haven't seen direct evidence of it for you yet.`,
        quote: null,
        reference: null,
        weight: 0.2,
        verified: false,
      });
    }
  }
  return signals;
}
