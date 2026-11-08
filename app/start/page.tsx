import type { Metadata } from "next";
import { loadLiveCatalog } from "@/lib/discovery/index.ts";
import { Journey, type LookupEntry } from "./Journey.tsx";

export const metadata: Metadata = {
  title: "MainStreet AI | Find your next move",
  description: "Discover business opportunities, compare trusted AI fixes, and build a practical 30-day plan for your Maryland small business.",
};

// The catalog changes when reviewers approve or block tools, so read it on each visit.
export const dynamic = "force-dynamic";

/** The owner journey (docs/specs/b-wireframes.md), on /api/journey/*. */
export default async function StartPage() {
  // Built-in catalog plus tools checked and decided through discovery (lib/discovery).
  const catalog = await loadLiveCatalog();
  // "Saw an AI tool in an ad?" looks the link up here first, then asks /api/discovery/submit.
  const lookup: LookupEntry[] = catalog
    .map((r) => ({ name: r.name, domain: r.vendor.domain.replace(/^www\./, "").toLowerCase(), status: r.badge, checked: r.lastChecked ?? null, sample: Boolean(r.sample), id: r.id }))
    .filter((e) => e.domain);
  return <Journey lookup={lookup} catalog={catalog} />;
}
