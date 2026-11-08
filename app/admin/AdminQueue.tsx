"use client";

/**
 * Screen 8: discovery and review queue (docs/specs/b-wireframes.md).
 * Runs on the saved Safety Check results in data/catalog, so it works without the internet.
 * Approve follows the real guard (lib/safety/approve): only "ready" tools can be approved.
 * Decisions here are not saved; this is the demo of the workflow.
 */
import { useState } from "react";
import type { CatalogRecord } from "@/lib/catalog/types.ts";
import { approveTool } from "@/lib/safety/approve.ts";
import { Logo, SafetyBadge } from "../start/ToolScreens.tsx";
import s from "../start/start.module.css";
import t from "../start/tools.module.css";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

export function AdminQueue({ records }: { records: CatalogRecord[] }) {
  const listed = records.filter((r) => r.badge === "listed");
  const blocked = records.filter((r) => r.badge === "blocked");
  // Before "Run discovery": one tool already waiting. After: the rest arrive as "found just now".
  const [found, setFound] = useState(false);
  const [running, setRunning] = useState(false);
  const [badges, setBadges] = useState<Record<string, CatalogRecord["badge"]>>(() => Object.fromEntries(records.map((r) => [r.id, r.badge])));
  const [msg, setMsg] = useState<Record<string, string>>({});

  const visibleListed = found ? listed : listed.slice(0, 1);
  const visibleBlocked = found ? blocked : [];
  const isNew = (r: CatalogRecord) => found && r.id !== listed[0]?.id;
  const count = (b: CatalogRecord["badge"]) => records.filter((r) => (badges[r.id] ?? r.badge) === b && (found || r.badge === "verified" || r.id === listed[0]?.id)).length;

  const run = () => {
    setRunning(true);
    setTimeout(() => { setFound(true); setRunning(false); }, 1600);
  };
  const decide = (r: CatalogRecord, act: "ok" | "block") => {
    if (act === "block") { setBadges((b) => ({ ...b, [r.id]: "blocked" })); setMsg((m) => ({ ...m, [r.id]: "Blocked. Owners will never see it." })); return; }
    const res = approveTool(r, "Demo reviewer", new Date().toISOString().slice(0, 10));
    if (res.ok) { setBadges((b) => ({ ...b, [r.id]: "verified" })); setMsg((m) => ({ ...m, [r.id]: "Approved. It can now be recommended." })); }
    else setMsg((m) => ({ ...m, [r.id]: res.reason }));
  };

  const card = (r: CatalogRecord) => {
    const badge = badges[r.id] ?? r.badge;
    const auto = r.badge === "blocked";
    const passes = Object.values(r.safetyCheck.checks).filter((c) => c.result === "pass").slice(0, 3);
    return (
      <article key={r.id} className={cx(s.card, isNew(r) && t.appear)}>
        <div className={cx(s.cardTop, auto && t.blockedTop)}>
          {isNew(r) && <span className={t.found}>New · found just now</span>}
          <div className={s.cardHead}>
            <div className={t.tname}><Logo id={r.id} name={r.name} /><h3 className={s.h3}>{r.name}</h3></div>
            {badge === "listed" ? <span className={cx(s.badge, s.grey)}>◷ Ready for review</span> : <SafetyBadge badge={badge} />}
          </div>
          <span className={s.small}>{r.category} · {r.vendor.domain}</span>
        </div>
        {auto ? (
          <>
            <span className={s.sub}>Red flags</span>
            <ul className={t.ticks}>
              {r.safetyCheck.redFlags.map((x) => <li key={x} className={t.badItem}>{x}</li>)}
              {Object.values(r.safetyCheck.checks).filter((c) => c.result === "fail").map((c) => <li key={c.reason} className={t.badItem}>{c.reason}</li>)}
            </ul>
            <span className={s.small}>Never shown to owners. If an owner checks this link, they see these reasons.</span>
          </>
        ) : (
          <>
            <ul className={t.ticks}>
              {passes.map((c) => <li key={c.reason}>{c.reason}</li>)}
              {r.safetyCheck.warnings.map((w) => <li key={w} className={t.warnItem}>{w}</li>)}
            </ul>
            {badge === "listed" ? (
              <div className={t.actions}>
                <button type="button" className={cx(s.btn, s.primary)} onClick={() => decide(r, "ok")}>Approve</button>
                <button type="button" className={cx(s.btn, s.secondary)} onClick={() => decide(r, "block")}>Block</button>
              </div>
            ) : null}
          </>
        )}
        {msg[r.id] && <p className={s.notice} aria-live="polite">{msg[r.id]}</p>}
      </article>
    );
  };

  return (
    <div className={s.app}>
      <header className={s.topbar}>
        <div className={s.topbarInner}>
          <a className={s.brand} href="/" style={{ textDecoration: "none" }}>MainStreet AI · Review</a>
          <a className={s.linkInk} href="/">Owner view</a>
        </div>
      </header>
      <main className={s.page}>
        <div className={s.cols}>
          <div className={s.col}>
            <h1 className={s.h1}>Tool review queue</h1>
            <p>New tools are found every week. Each one gets the automatic Safety Check, then a person approves or blocks it. Only approved tools ever reach owners.</p>
            <button type="button" className={cx(s.btn, s.primary, s.wide)} onClick={run} disabled={running || found}>
              {running ? "Looking…" : found ? "Up to date" : "Run discovery now"}
            </button>
            <p className={s.small} aria-live="polite">
              {running ? "Looking in 4 places and running the Safety Check…" : found ? `Found ${listed.length - 1 + blocked.length} new tools just now. ${blocked.length} were blocked automatically.` : "Last run Sun Nov 1 · runs every Sunday"}
            </p>
            <article className={s.card}>
              <div className={s.cardTop}><h2 className={s.h3}>Where we look</h2></div>
              <ul className={cx(t.ticks, t.plain)}>
                <li>AI tool directories</li>
                <li>Square, QuickBooks and Jobber app stores</li>
                <li>Vendors who apply to be listed</li>
                <li>Links owners paste into "Check this tool"</li>
              </ul>
            </article>
            <article className={s.card}>
              <div className={s.cardTop}><h2 className={s.h3}>Catalog today</h2></div>
              <div className={s.row}>
                <span className={cx(s.badge, s.ok)}>✓ {count("verified")} Verified</span>
                <span className={cx(s.badge, s.grey)}>◷ {count("listed")} waiting</span>
                <span className={cx(s.badge, s.bad)}>⚠ {count("blocked")} Blocked</span>
              </div>
            </article>
            <p className={s.hint}>Demo: this runs on saved Safety Check results, and decisions here aren't saved.</p>
          </div>
          <div className={s.col}>
            <h2 className={s.h2}>Waiting for a person</h2>
            {visibleListed.map(card)}
            {visibleBlocked.length > 0 && <h2 className={s.h2} style={{ marginTop: 8 }}>Blocked automatically</h2>}
            {visibleBlocked.map(card)}
          </div>
        </div>
      </main>
    </div>
  );
}
