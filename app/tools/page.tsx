import type { Metadata } from "next";
import { INDUSTRIES } from "@/lib/business/industry.ts";
import { loadLiveCatalog } from "@/lib/discovery/index.ts";
import { Catalog } from "./Catalog.tsx";
import { Shell } from "./Shell.tsx";

export const metadata: Metadata = {
  title: "MainStreet AI | Browse checked AI tools",
  description: "Every AI tool we know about for small businesses, with its Safety Check: who's behind it, what it does with your data, and what it costs.",
};

// Reviewers approve and block tools at any time, so read the catalog on each visit.
export const dynamic = "force-dynamic";

/** Browse the catalog (spec §1: Verified and "Not yet reviewed" tools; Blocked only under "why we hid these"). */
export default async function ToolsPage() {
  const catalog = await loadLiveCatalog();
  const industries = Object.values(INDUSTRIES)
    .filter((i) => i.key !== "other")
    .map((i) => ({ key: i.key, label: i.label }));
  return (
    <Shell current="tools">
      <Catalog records={catalog} industries={industries} />
    </Shell>
  );
}
