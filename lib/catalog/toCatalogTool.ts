/**
 * Translates our detailed catalog record into the `CatalogTool` shape that
 * the recommendation engine (lib/recommend) reads.
 *
 * Safety rule: when we don't know a rules flag, we assume the answer that
 * protects the owner, so the engine's rule gates err on the side of caution.
 */
import type { CatalogTool, IntegrationKind } from "../recommend/types.ts";
import { PRIVACY_KEYS, type CatalogRecord } from "./types.ts";

/** Used when setup time is unknown: a conservative two-hour estimate. */
const UNKNOWN_SETUP_MINUTES = 120;

const orTrue = (v: boolean | "unknown") => v === "unknown" ? true : v;
const orFalse = (v: boolean | "unknown") => v === "unknown" ? false : v;

/**
 * Tools that answer, make or route phone calls. Only these can record calls or
 * make AI calls, so only these get the worst-case answer when we don't know.
 * A writing or email tool with an unknown call-recording answer isn't a risk.
 */
const isPhoneTool = (r: CatalogRecord) =>
  r.useCases.includes("missed-calls") || /phone|call|receptionist|voice/i.test(r.category);

/** Tools that set prices. Only these can personalize prices. */
const isPricingTool = (r: CatalogRecord) => /pric/i.test(r.category);

/** The safe guess when unknown: worst case if the risk can apply to this kind of tool, else no. */
const ifApplies = (applies: boolean, v: boolean | "unknown") => (applies ? orTrue(v) : orFalse(v));

export function toCatalogTool(record: CatalogRecord): CatalogTool | null {
  const price = record.pricing.small.monthlyUsd;
  if (price === "unknown") return null;

  const integrations: Record<string, IntegrationKind> = {};
  for (const w of record.worksWith) {
    if (w.type === "native") integrations[w.product] = "native";
    else if (w.type === "zapier") integrations[w.product] = "via-zapier";
  }

  const f = record.rulesFlags;
  const minutes = record.setupMinutes === "unknown" ? UNKNOWN_SETUP_MINUTES : record.setupMinutes;
  const phone = isPhoneTool(record);
  const outbound = ifApplies(phone, f.outboundAiCalls);

  return {
    id: record.id,
    name: record.name,
    category: record.category,
    description: record.description,
    website: record.vendor.website,
    status: record.badge,
    reviewedAt: record.reviewedAt,
    useCases: [...record.useCases],
    industries: [...record.industries],
    monthlyPrice: price,
    pricingNote: `As of Nov 2026: ${record.pricing.small.note}`,
    integrations,
    existingProduct: record.existingProduct,
    setupMinutes: minutes,
    reviewRating: record.reviews?.rating,
    reviewCount: record.reviews?.count,
    languages: [...record.languages],
    flags: {
      recordsCalls: ifApplies(phone, f.recordsCalls),
      announcesRecording: orFalse(f.announcesRecording),
      outboundAICalls: outbound,
      // No record field proves a tool handles call consent, so never claim it.
      requiresOutboundConsent: false,
      hipaaReady: orFalse(f.hipaaReady),
      baaAvailable: f.hipaaReady === true,
      personalizesPrices: ifApplies(isPricingTool(record), f.personalizedPricing),
      dataDeletion: record.privacyCard.canDeleteData.answer === "yes",
      requiresContract: record.pricing.contract !== "monthly",
    },
    privacySummary: PRIVACY_KEYS.map((k) => record.privacyCard[k].plain).join(" "),
    setupSummary:
      record.setupMode === "self_serve"
        ? `Set it up yourself in about ${minutes} minutes.`
        : `Best with a helper — about ${minutes} minutes.`,
    demoOnly: record.sample === true,
  };
}
