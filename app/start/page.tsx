import type { Metadata } from "next";
import { loadCatalog } from "@/lib/catalog/index.ts";
import { Journey, type LookupEntry } from "./Journey.tsx";

export const metadata: Metadata = {
  title: "MainStreet AI | Find what's holding your business back",
  description: "Type your business name. We read your public listings, website and reviews, ask a few questions, and show what's costing you, with the proof.",
};

/** Owner journey: screens 1–4 of the approved wireframes (docs/specs/b-wireframes.md), on /api/journey/*. */
export default function StartPage() {
  // "Saw an AI tool in an ad?" looks the link up in the reviewed tool catalog (lib/catalog).
  const lookup: LookupEntry[] = loadCatalog()
    .map((r) => ({ name: r.name, domain: r.vendor.domain.replace(/^www\./, "").toLowerCase(), status: r.badge, checked: r.lastChecked ?? null, sample: Boolean(r.sample) }))
    .filter((e) => e.domain);
  return <Journey lookup={lookup} />;
}
