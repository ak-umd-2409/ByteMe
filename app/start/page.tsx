import type { Metadata } from "next";
import { loadLiveCatalog, watchListSize } from "@/lib/discovery/index.ts";
import { Journey, type LookupEntry } from "./Journey.tsx";

export const metadata: Metadata = {
  title: "MainStreet AI | Find what's holding your business back",
  description: "Type your business name. We read your public listings, website and reviews, ask a few questions, and show what's costing you, with the proof.",
};

// The catalog changes when reviewers approve or block tools, so read it on each visit.
export const dynamic = "force-dynamic";

/** The owner journey (docs/specs/b-wireframes.md), on /api/journey/*. */
export default async function StartPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : undefined);
  // Built-in catalog plus tools checked and decided through discovery (lib/discovery).
  const catalog = await loadLiveCatalog();
  // "Saw an AI tool in an ad?" looks the link up here first, then asks /api/discovery/submit.
  const lookup: LookupEntry[] = catalog
    .map((r) => ({ name: r.name, domain: r.vendor.domain.replace(/^www\./, "").toLowerCase(), status: r.badge, checked: r.lastChecked ?? null, sample: Boolean(r.sample), id: r.id }))
    .filter((e) => e.domain);
  // The homepage now explains the product, so /start opens on "find your business".
  return <Journey lookup={lookup} catalog={catalog} watchCount={watchListSize()} entry={{ screen: "find", query: one(q.q), town: one(q.town), example: q.example === "1" }} />;
}
