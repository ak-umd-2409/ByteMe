import type { CatalogRecord, SafetyCheckItem } from "./types.ts";

/** Test helper: a complete, valid, verified record. Tests override fields. */
const passed = (reason: string): SafetyCheckItem => ({
  result: "pass",
  reason,
  evidence: [{ url: "https://example.com/about", checkedAt: "2026-11-07" }],
});

export function validRecord(): CatalogRecord {
  return {
    id: "test-receptionist",
    name: "Test Receptionist",
    vendor: { company: "Test Co", website: "https://example.com", domain: "example.com" },
    description: "Answers your phone when you can't.",
    category: "AI receptionist",
    useCases: ["missed-calls"],
    industries: ["hvac", "plumbing"],
    pricing: {
      asOf: "Nov 2026",
      small: { monthlyUsd: 49, note: "Up to 100 calls" },
      medium: { monthlyUsd: 99, note: "Up to 300 calls" },
      large: { monthlyUsd: 199, note: "Up to 1,000 calls" },
      freeTier: false,
      contract: "monthly",
      cancellation: "Cancel any time.",
      pricingUrl: "https://example.com/pricing",
    },
    worksWith: [
      { product: "Square", type: "native" },
      { product: "QuickBooks", type: "zapier" },
      { product: "Toast", type: "none" },
    ],
    setupMinutes: 30,
    setupMode: "self_serve",
    languages: ["English", "Spanish"],
    privacyCard: {
      trainsOnYourData: { answer: "no", plain: "Does not train AI on your calls.", quote: "We do not use your data to train models.", sourceUrl: "https://example.com/privacy" },
      canDeleteData: { answer: "yes", plain: "You can delete your data.", quote: "You may request deletion at any time.", sourceUrl: "https://example.com/privacy" },
      whereStored: { answer: "United States", plain: "Data is stored in the US.", quote: "Data is stored in the United States.", sourceUrl: "https://example.com/privacy" },
      sharesOrSells: { answer: "no", plain: "Does not sell your data.", quote: "We do not sell personal information.", sourceUrl: "https://example.com/privacy" },
      securityCertification: { answer: "unknown", plain: "We couldn't confirm a security certification.", quote: null, sourceUrl: null },
    },
    rulesFlags: {
      recordsCalls: true,
      announcesRecording: true,
      hipaaReady: false,
      outboundAiCalls: false,
      personalizedPricing: false,
    },
    badge: "verified",
    reviewedAt: "2026-11-07",
    reviewedBy: "Person B",
    safetyCheck: {
      ranAt: "2026-11-07",
      checks: {
        whoIsBehind: passed("Company, address and leadership found."),
        domainAge: passed("Domain is 6 years old."),
        privacyPolicy: passed("Privacy policy found."),
        dataUse: passed("No training on your data; deletion allowed."),
        dataLocation: passed("Stored in the US."),
        pricingClarity: passed("Public pricing, monthly plan."),
        securityBasics: passed("Uses HTTPS."),
        redFlags: passed("No red flags."),
      },
      redFlags: [],
      verdict: "ready",
      warnings: [],
    },
    lastChecked: "2026-11-07",
    sources: ["https://example.com/pricing", "https://example.com/privacy"],
    needsVerification: [],
  };
}
