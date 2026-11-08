import type { Metadata } from "next";
import { loadLiveCatalog } from "@/lib/discovery/index.ts";
import { Home } from "./home/Home.tsx";
import { homeData } from "./home/data.ts";

export const metadata: Metadata = {
  title: "MainStreet AI | Find the AI that fits your small business",
  description:
    "Type your business name. MainStreet AI reads your public listing, website and reviews, shows what's costing you time or customers, and matches you only with AI tools a person has checked.",
};

// The catalog changes when reviewers approve or block tools, so read it on each visit.
export const dynamic = "force-dynamic";

/** The homepage. The guided journey lives at /start; the earlier demo at /classic. */
export default async function Page() {
  return <Home data={await homeData(await loadLiveCatalog())} />;
}
