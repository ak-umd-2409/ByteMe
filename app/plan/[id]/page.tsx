import type { Metadata } from "next";
import { defaultDeps } from "@/lib/api/handlers.ts";
import { openSavedShare } from "@/lib/api/plan.ts";
import { loadLiveCatalog } from "@/lib/discovery/index.ts";
import { getKv } from "@/lib/shared/kv.ts";
import { Shell } from "../../tools/Shell.tsx";
import s from "../../start/start.module.css";
import { AdvisorView } from "../AdvisorView.tsx";

export const dynamic = "force-dynamic";

// Shared plans are private to whoever has the link: keep them out of search engines.
export const metadata: Metadata = { title: "MainStreet AI | Shared plan", robots: { index: false, follow: false } };

const WHY = {
  missing: "This link has expired or doesn't exist. Shared plans are kept for 30 days: ask the owner to send a new one.",
  unavailable: "Saved plans can't be opened right now. Please try again later, or ask the owner for a printout.",
  broken: "This plan can't be opened. Ask the owner to send it again.",
};

/** A saved plan link (spec §5.4), read-only for the owner's SBDC advisor. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const out = await openSavedShare(id, { api: defaultDeps(), kv: getKv(), catalog: await loadLiveCatalog() });
  return (
    <Shell narrow>
      {out.ok ? (
        <AdvisorView view={out.view} />
      ) : (
        <section className={s.card}>
          <h1 className={s.h3}>Plan not found</h1>
          <p>{WHY[out.reason]}</p>
        </section>
      )}
    </Shell>
  );
}
