import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadLiveCatalog } from "@/lib/discovery/index.ts";
import { Shell } from "../Shell.tsx";
import { ToolPage } from "./ToolPage.tsx";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const r = (await loadLiveCatalog()).find((x) => x.id === id);
  return { title: r ? `MainStreet AI | ${r.name}: Safety Check` : "MainStreet AI | Tool not found" };
}

/** One tool's card: Safety Check, data answers, price, rules, help. Blocked tools show why. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = (await loadLiveCatalog()).find((x) => x.id === id);
  if (!r) notFound();
  return (
    <Shell current="tools">
      <ToolPage r={r} />
    </Shell>
  );
}
