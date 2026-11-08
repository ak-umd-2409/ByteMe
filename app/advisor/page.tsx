import type { Metadata } from "next";
import { Shell } from "../tools/Shell.tsx";
import { AdvisorPage } from "./AdvisorPage.tsx";

export const metadata: Metadata = {
  title: "MainStreet AI | Business Advisor",
  description: "Ask where AI fits your small business. Answers come only from tools a person has checked, with real prices and links.",
};

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 600) : null);
  return (
    <Shell current="advisor">
      <AdvisorPage question={one(q.q)} industry={one(q.industry)} />
    </Shell>
  );
}
