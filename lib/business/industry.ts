import type { IndustryKey } from "./types.ts";

/**
 * Industry classification and per-industry starting assumptions.
 *
 * IMPORTANT: the numbers in `defaults` are placeholder starting points for the
 * calculator, not researched statistics. The UI must label them "starting
 * assumption — replace with your own number" and the impact engine marks them
 * `source: "default"` with low confidence.
 */
export interface IndustryInfo {
  key: IndustryKey;
  label: string;
  /** Customers usually book a time slot. */
  appointmentBased: boolean;
  /** Customers often need help outside business hours (emergencies, evenings). */
  afterHoursDemand: boolean;
  /** Work is usually priced by quote/estimate. */
  quoteBased: boolean;
  handlesHealthData: boolean;
  /** Problem keys typical for the industry — used only to form hypotheses. */
  typicalProblems: string[];
  defaults: {
    weeklyInquiries: number;
    averageJobValue: number;
    hourlyValueOfOwnerTime: number;
  };
}

const info = (i: IndustryInfo) => i;

export const INDUSTRIES: Record<IndustryKey, IndustryInfo> = {
  hvac: info({
    key: "hvac", label: "HVAC", appointmentBased: true, afterHoursDemand: true, quoteBased: true, handlesHealthData: false,
    typicalProblems: ["missed_inquiries", "slow_quotes", "scheduling_inefficiency", "no_customer_follow_up"],
    defaults: { weeklyInquiries: 40, averageJobValue: 300, hourlyValueOfOwnerTime: 50 },
  }),
  plumbing: info({
    key: "plumbing", label: "Plumbing", appointmentBased: true, afterHoursDemand: true, quoteBased: true, handlesHealthData: false,
    typicalProblems: ["missed_inquiries", "slow_quotes", "scheduling_inefficiency"],
    defaults: { weeklyInquiries: 40, averageJobValue: 300, hourlyValueOfOwnerTime: 50 },
  }),
  electrical: info({
    key: "electrical", label: "Electrical", appointmentBased: true, afterHoursDemand: true, quoteBased: true, handlesHealthData: false,
    typicalProblems: ["missed_inquiries", "slow_quotes"],
    defaults: { weeklyInquiries: 30, averageJobValue: 350, hourlyValueOfOwnerTime: 50 },
  }),
  landscaping: info({
    key: "landscaping", label: "Landscaping", appointmentBased: true, afterHoursDemand: false, quoteBased: true, handlesHealthData: false,
    typicalProblems: ["slow_quotes", "missed_inquiries", "scheduling_inefficiency", "repetitive_admin"],
    defaults: { weeklyInquiries: 20, averageJobValue: 250, hourlyValueOfOwnerTime: 40 },
  }),
  cleaning: info({
    key: "cleaning", label: "Cleaning services", appointmentBased: true, afterHoursDemand: false, quoteBased: true, handlesHealthData: false,
    typicalProblems: ["missed_inquiries", "scheduling_inefficiency", "no_customer_follow_up"],
    defaults: { weeklyInquiries: 20, averageJobValue: 150, hourlyValueOfOwnerTime: 35 },
  }),
  auto_repair: info({
    key: "auto_repair", label: "Auto repair", appointmentBased: true, afterHoursDemand: false, quoteBased: true, handlesHealthData: false,
    typicalProblems: ["missed_inquiries", "slow_quotes", "no_customer_follow_up"],
    defaults: { weeklyInquiries: 35, averageJobValue: 350, hourlyValueOfOwnerTime: 45 },
  }),
  restaurant: info({
    key: "restaurant", label: "Restaurant", appointmentBased: false, afterHoursDemand: false, quoteBased: false, handlesHealthData: false,
    typicalProblems: ["poor_review_management", "missed_inquiries", "no_customer_follow_up"],
    defaults: { weeklyInquiries: 60, averageJobValue: 45, hourlyValueOfOwnerTime: 30 },
  }),
  cafe: info({
    key: "cafe", label: "Café / coffee shop", appointmentBased: false, afterHoursDemand: false, quoteBased: false, handlesHealthData: false,
    typicalProblems: ["poor_review_management", "no_customer_follow_up", "repetitive_admin"],
    defaults: { weeklyInquiries: 20, averageJobValue: 25, hourlyValueOfOwnerTime: 25 },
  }),
  salon: info({
    key: "salon", label: "Salon / barber", appointmentBased: true, afterHoursDemand: false, quoteBased: false, handlesHealthData: false,
    typicalProblems: ["no_online_booking", "missed_inquiries", "no_customer_follow_up"],
    defaults: { weeklyInquiries: 50, averageJobValue: 60, hourlyValueOfOwnerTime: 35 },
  }),
  retail: info({
    key: "retail", label: "Retail shop", appointmentBased: false, afterHoursDemand: false, quoteBased: false, handlesHealthData: false,
    typicalProblems: ["no_customer_follow_up", "repetitive_admin", "poor_review_management"],
    defaults: { weeklyInquiries: 25, averageJobValue: 40, hourlyValueOfOwnerTime: 30 },
  }),
  fitness: info({
    key: "fitness", label: "Fitness studio", appointmentBased: true, afterHoursDemand: false, quoteBased: false, handlesHealthData: false,
    typicalProblems: ["no_online_booking", "no_customer_follow_up"],
    defaults: { weeklyInquiries: 25, averageJobValue: 80, hourlyValueOfOwnerTime: 35 },
  }),
  health_clinic: info({
    key: "health_clinic", label: "Health or dental clinic", appointmentBased: true, afterHoursDemand: false, quoteBased: false, handlesHealthData: true,
    typicalProblems: ["missed_inquiries", "no_online_booking", "repetitive_admin"],
    defaults: { weeklyInquiries: 50, averageJobValue: 150, hourlyValueOfOwnerTime: 60 },
  }),
  professional_services: info({
    key: "professional_services", label: "Professional services", appointmentBased: true, afterHoursDemand: false, quoteBased: true, handlesHealthData: false,
    typicalProblems: ["repetitive_admin", "slow_responses", "no_customer_follow_up"],
    defaults: { weeklyInquiries: 10, averageJobValue: 500, hourlyValueOfOwnerTime: 75 },
  }),
  farm: info({
    key: "farm", label: "Farm / farm market", appointmentBased: false, afterHoursDemand: false, quoteBased: false, handlesHealthData: false,
    typicalProblems: ["repetitive_admin", "no_customer_follow_up"],
    defaults: { weeklyInquiries: 15, averageJobValue: 40, hourlyValueOfOwnerTime: 25 },
  }),
  other: info({
    key: "other", label: "Small business", appointmentBased: false, afterHoursDemand: false, quoteBased: false, handlesHealthData: false,
    typicalProblems: ["missed_inquiries", "repetitive_admin"],
    defaults: { weeklyInquiries: 20, averageJobValue: 100, hourlyValueOfOwnerTime: 35 },
  }),
};

/** Google Places primary types (Places API New) → our industries. */
const PLACE_TYPES: Record<string, IndustryKey> = {
  hvac_contractor: "hvac",
  plumber: "plumbing",
  electrician: "electrical",
  roofing_contractor: "hvac",
  general_contractor: "hvac",
  landscaper: "landscaping",
  lawn_care: "landscaping",
  house_cleaning_service: "cleaning",
  car_repair: "auto_repair",
  car_wash: "auto_repair",
  restaurant: "restaurant",
  meal_takeaway: "restaurant",
  meal_delivery: "restaurant",
  pizza_restaurant: "restaurant",
  bakery: "cafe",
  cafe: "cafe",
  coffee_shop: "cafe",
  hair_salon: "salon",
  hair_care: "salon",
  beauty_salon: "salon",
  barber_shop: "salon",
  nail_salon: "salon",
  spa: "salon",
  gym: "fitness",
  fitness_center: "fitness",
  yoga_studio: "fitness",
  dentist: "health_clinic",
  dental_clinic: "health_clinic",
  doctor: "health_clinic",
  physiotherapist: "health_clinic",
  chiropractor: "health_clinic",
  veterinary_care: "health_clinic",
  accounting: "professional_services",
  insurance_agency: "professional_services",
  lawyer: "professional_services",
  real_estate_agency: "professional_services",
  farm: "farm",
  store: "retail",
  clothing_store: "retail",
  florist: "retail",
  hardware_store: "retail",
  gift_shop: "retail",
  book_store: "retail",
  grocery_store: "retail",
};

const KEYWORDS: [RegExp, IndustryKey][] = [
  [/\b(hvac|heating|cooling|air condition|furnace|heat pump)\b/i, "hvac"],
  [/\b(plumb|drain|sewer|water heater)\w*/i, "plumbing"],
  [/\belectric(al|ian)\b/i, "electrical"],
  [/\b(landscap|lawn|garden|tree service|mowing)\w*/i, "landscaping"],
  [/\b(clean(ing|ers)|maid|janitorial)\b/i, "cleaning"],
  [/\b(auto|car|tire|mechanic|collision|body shop)\b/i, "auto_repair"],
  [/\b(coffee|caf[eé]|bakery|espresso)\b/i, "cafe"],
  [/\b(restaurant|grill|diner|pizza|kitchen|bistro|tavern|bbq|taqueria)\b/i, "restaurant"],
  [/\b(salon|barber|nails?|spa|beauty|hair)\b/i, "salon"],
  [/\b(gym|fitness|yoga|pilates|crossfit)\b/i, "fitness"],
  [/\b(dental|dentist|clinic|chiro|therapy|medical|veterinar)\w*/i, "health_clinic"],
  [/\b(cpa|accounting|tax|insurance|law|legal|consult)\w*/i, "professional_services"],
  [/\b(farm|orchard|produce|creamery)\b/i, "farm"],
  [/\b(shop|store|boutique|market|gifts?)\b/i, "retail"],
];

export function classifyIndustry(input: {
  primaryType?: string | null;
  types?: string[];
  name?: string | null;
  categoryText?: string | null;
}): { key: IndustryKey; method: "places_type" | "keyword" | "unknown"; matched: string | null } {
  for (const type of [input.primaryType, ...(input.types ?? [])]) {
    if (type && PLACE_TYPES[type]) return { key: PLACE_TYPES[type], method: "places_type", matched: type };
  }
  const text = [input.categoryText, input.name].filter(Boolean).join(" ");
  for (const [pattern, key] of KEYWORDS) {
    const hit = text.match(pattern);
    if (hit) return { key, method: "keyword", matched: hit[0] };
  }
  return { key: "other", method: "unknown", matched: null };
}

export const industryInfo = (key: IndustryKey): IndustryInfo => INDUSTRIES[key] ?? INDUSTRIES.other;
