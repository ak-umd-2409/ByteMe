"use client";

import { useEffect, useState } from "react";
import type { AdvisorView as View } from "@/lib/plan/share.ts";
import s from "../../start/start.module.css";
import { AdvisorView } from "../AdvisorView.tsx";

/** Reads the plan from the part of the link after "#" and asks the server to rebuild it. */
export function FromLink() {
  const [state, setState] = useState<{ view: View } | { error: string } | null>(null);
  useEffect(() => {
    // Opening a different plan link in the same tab only changes the part after "#".
    const reopen = () => window.location.reload();
    window.addEventListener("hashchange", reopen);
    return () => window.removeEventListener("hashchange", reopen);
  }, []);
  useEffect(() => {
    const link = window.location.hash.slice(1);
    if (!link) {
      setState({ error: "This link is missing the plan. Ask the owner to send it again." });
      return;
    }
    fetch("/api/plan/open", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ link }) })
      .then(async (res) => {
        const body = await res.json();
        setState(res.ok ? { view: body as View } : { error: body?.error?.message ?? "This plan can't be opened." });
      })
      .catch(() => setState({ error: "We couldn't open this plan. Check your connection and try again." }));
  }, []);
  if (!state) return <p className={s.small}>Opening the plan…</p>;
  if ("error" in state)
    return (
      <section className={s.card}>
        <h1 className={s.h3}>Plan not found</h1>
        <p>{state.error}</p>
      </section>
    );
  return <AdvisorView view={state.view} />;
}
