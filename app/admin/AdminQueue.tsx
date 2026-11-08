"use client";

/**
 * Screen 8: discovery and review queue (docs/specs/b-wireframes.md), on real data.
 * Find → Safety Check → a person approves or blocks → published to the catalog.
 * API: /api/discovery/{queue,run,decide} (docs/DISCOVERY.md). Approve follows the
 * real guard (lib/safety/approve): only tools whose Safety Check says "ready".
 */
import { useCallback, useEffect, useState } from "react";
import type { CatalogRecord } from "@/lib/catalog/types.ts";
import type { Candidate, queueView, RunSummary } from "@/lib/discovery/index.ts";
import { SOURCE_LABEL } from "@/lib/discovery/types.ts";
import { USE_CASES, type UseCase } from "@/lib/recommend/types.ts";
import { Logo, SafetyBadge } from "../start/ToolScreens.tsx";
import s from "../start/start.module.css";
import t from "../start/tools.module.css";
import { USE_CASE_LABEL } from "../tools/labels.ts";

type Queue = Awaited<ReturnType<typeof queueView>>;
type Item = { record: CatalogRecord; candidate: Candidate | null };

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const TOKEN_KEY = "mainstreet.reviewerCode";
const NAME_KEY = "mainstreet.reviewerName";
const store = {
  get: (k: string) => {
    try {
      return sessionStorage.getItem(k) ?? "";
    } catch {
      return "";
    }
  },
  set: (k: string, v: string) => {
    try {
      sessionStorage.setItem(k, v);
    } catch {
      /* storage unavailable: keep it in memory only */
    }
  },
};

function runLine(r: RunSummary) {
  const parts = [`checked ${r.checked}`, r.ready && `${r.ready} ready for review`, r.held && `${r.held} held for missing facts`, r.blocked && `${r.blocked} blocked`, r.failed && `${r.failed} couldn't be reached`]
    .filter(Boolean)
    .join(", ");
  return `${r.trigger === "schedule" ? "Weekly run" : "Run by a reviewer"} · ${when(r.ranAt)}: ${parts}. ${r.waiting} still waiting.`;
}

export function AdminQueue() {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [locked, setLocked] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, { text: string; bad: boolean }>>({});
  const [uses, setUses] = useState<Record<string, UseCase[]>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [topMsg, setTopMsg] = useState<string | null>(null);

  const headers = useCallback((): Record<string, string> => ({ "content-type": "application/json", "x-admin-token": store.get(TOKEN_KEY) }), []);

  const load = useCallback(async () => {
    const res = await fetch("/api/discovery/queue", { headers: headers(), cache: "no-store" });
    const body = await res.json().catch(() => null);
    if (!res.ok) return setLocked(body?.error?.message ?? "The review queue isn't available.");
    setLocked(null);
    setQueue(body as Queue);
  }, [headers]);

  useEffect(() => {
    setReviewer(store.get(NAME_KEY));
    void load();
  }, [load]);

  const run = async () => {
    setRunning(true);
    setTopMsg(null);
    try {
      const res = await fetch("/api/discovery/run", { method: "POST", headers: headers(), body: JSON.stringify({ limit: 3 }) });
      const body = await res.json();
      if (!res.ok) return setTopMsg(body?.error?.message ?? "Discovery couldn't run.");
      setQueue(body.queue);
      setTopMsg(runLine(body.summary));
    } catch {
      setTopMsg("Discovery couldn't run. Please try again.");
    } finally {
      setRunning(false);
    }
  };

  const decide = async (item: Item, action: "approve" | "block") => {
    const id = item.record.id;
    if (!reviewer.trim()) return setMsg((m) => ({ ...m, [id]: { text: "Add your name at the top first.", bad: true } }));
    setBusyId(id);
    try {
      const res = await fetch("/api/discovery/decide", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ id, action, reviewer: reviewer.trim(), reason: reasons[id]?.trim() || undefined, useCases: uses[id] ?? item.record.useCases }),
      });
      const body = await res.json();
      if (!res.ok) return setMsg((m) => ({ ...m, [id]: { text: body?.error?.message ?? "That didn't work.", bad: true } }));
      setQueue(body.queue);
      setTopMsg(`${item.record.name}: ${body.message}`);
    } finally {
      setBusyId(null);
    }
  };

  const frame = (children: React.ReactNode) => (
    <div className={s.app}>
      <header className={s.topbar}>
        <div className={s.topbarInner}>
          <a className={s.brand} href="/" style={{ textDecoration: "none" }}>
            MainStreet AI · Review
          </a>
          <span className={s.row} style={{ gap: 18 }}>
            <a className={s.linkInk} href="/tools">
              Catalog
            </a>
            <a className={s.linkInk} href="/">
              Owner view
            </a>
          </span>
        </div>
      </header>
      <main className={s.page}>{children}</main>
    </div>
  );

  if (locked)
    return frame(
      <div className={cx(s.col, s.narrow)} style={{ margin: "0 auto", width: "100%" }}>
        <h1 className={s.title}>Tool review queue</h1>
        <p className={s.notice}>{locked}</p>
        <form
          className={s.card}
          onSubmit={(e) => {
            e.preventDefault();
            store.set(TOKEN_KEY, code.trim());
            void load();
          }}
        >
          <div className={s.field}>
            <label htmlFor="code">Reviewer code</label>
            <input id="code" type="password" className={s.input} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
            <span className={s.hint}>Kept in this browser tab only.</span>
          </div>
          <button type="submit" className={cx(s.btn, s.primary)} style={{ justifySelf: "start" }}>
            Open the queue
          </button>
        </form>
      </div>,
    );

  if (!queue) return frame(<p className={s.small}>Loading the queue…</p>);

  const byId = new Map(queue.candidates.map((c) => [c.id, c]));
  const recordOf = (id: string) => queue.records[id] ?? queue.builtInWaiting.find((r) => r.id === id) ?? null;
  const waiting: Item[] = [
    ...queue.candidates.filter((c) => c.status === "checked").map((c) => ({ record: recordOf(c.id)!, candidate: c })).filter((x) => x.record),
    ...queue.builtInWaiting.map((r) => ({ record: r, candidate: byId.get(r.id) ?? null })),
  ];
  const inLine = queue.candidates.filter((c) => c.status === "new" || c.status === "failed");
  const blocked = queue.candidates.filter((c) => c.status === "blocked");
  const approved = queue.candidates.filter((c) => c.status === "approved").slice(0, 5);
  const last = queue.runs[0];

  const reviewCard = ({ record: r, candidate }: Item) => {
    const sc = r.safetyCheck;
    const ready = sc.verdict === "ready";
    const notPass = Object.values(sc.checks).filter((c) => c.result !== "pass");
    const passes = Object.values(sc.checks).filter((c) => c.result === "pass").slice(0, 4);
    const picked = uses[r.id] ?? r.useCases;
    return (
      <article key={r.id} className={s.card}>
        <div className={s.cardTop}>
          <span className={s.small}>{candidate ? SOURCE_LABEL[candidate.source] : "In the catalog, never reviewed"}</span>
          <div className={s.cardHead}>
            <div className={t.tname}>
              <Logo id={r.id} name={r.name} />
              <h3 className={s.h3}>{r.name}</h3>
            </div>
            <span className={cx(s.badge, ready ? s.ok : s.warn)}>{ready ? "◷ Ready for review" : "! Held"}</span>
          </div>
          <span className={s.small}>
            {r.category} · <a href={r.vendor.website} target="_blank" rel="noreferrer">{r.vendor.domain}</a> · checked {r.lastChecked}
            {r.sample && " · sample"}
          </span>
        </div>
        <ul className={t.ticks}>
          {passes.map((c) => (
            <li key={c.reason}>{c.reason}</li>
          ))}
          {notPass.map((c) => (
            <li key={c.reason} className={c.result === "fail" ? t.badItem : t.warnItem}>
              {c.reason}
            </li>
          ))}
          {sc.warnings.filter((w) => !notPass.some((c) => c.reason === w)).map((w) => (
            <li key={w} className={t.warnItem}>
              {w}
            </li>
          ))}
        </ul>
        {!ready && <p className={s.small}>Held tools can't be approved until the missing facts are found (docs/specs/b-real-catalog.md §4) and the check is run again.</p>}
        <details className={s.disc}>
          <summary>
            What it's for: {picked.length ? picked.map((u) => USE_CASE_LABEL[u]).join(", ") : "not set (needed to approve)"} · change
          </summary>
          <div className={s.row}>
            {USE_CASES.map((u) => {
              const on = picked.includes(u);
              return (
                <button key={u} type="button" className={s.chipsel} aria-pressed={on} onClick={() => setUses((m) => ({ ...m, [r.id]: on ? picked.filter((x) => x !== u) : [...picked, u] }))}>
                  {on ? "✓ " : ""}
                  {USE_CASE_LABEL[u]}
                </button>
              );
            })}
          </div>
        </details>
        <div className={s.field}>
          <label htmlFor={`why-${r.id}`}>Reason, if you block it</label>
          <input id={`why-${r.id}`} className={s.input} value={reasons[r.id] ?? ""} onChange={(e) => setReasons((m) => ({ ...m, [r.id]: e.target.value }))} placeholder="Owners see this" maxLength={200} />
        </div>
        <div className={t.actions}>
          <button type="button" className={cx(s.btn, s.primary)} onClick={() => void decide({ record: r, candidate }, "approve")} disabled={!ready || busyId === r.id || picked.length === 0}>
            Approve
          </button>
          <button type="button" className={cx(s.btn, s.secondary)} onClick={() => void decide({ record: r, candidate }, "block")} disabled={busyId === r.id}>
            Block
          </button>
          <a className={s.link} href={`/tools/${r.id}`} target="_blank" rel="noreferrer">
            Full card
          </a>
        </div>
        {msg[r.id] && (
          <p className={msg[r.id].bad ? s.error : s.notice} aria-live="polite">
            {msg[r.id].text}
          </p>
        )}
      </article>
    );
  };

  return frame(
    <div className={s.cols}>
      <div className={s.col}>
        <h1 className={s.title}>Tool review queue</h1>
        <p>New tools are found every week. Each one gets the automatic Safety Check, then a person approves or blocks it. Only approved tools ever reach owners.</p>
        <div className={s.field}>
          <label htmlFor="reviewer">Your name</label>
          <input
            id="reviewer"
            className={s.input}
            value={reviewer}
            onChange={(e) => {
              setReviewer(e.target.value);
              store.set(NAME_KEY, e.target.value);
            }}
            placeholder="Shown on every decision"
            maxLength={60}
          />
        </div>
        <button type="button" className={cx(s.btn, s.primary, s.wide)} onClick={() => void run()} disabled={running}>
          {running ? "Checking…" : "Run discovery now"}
        </button>
        <p className={s.small} aria-live="polite">
          {running
            ? "Adding new tools from our watch list and checking up to 3 (reading their pages and privacy policy). This can take a minute."
            : topMsg ?? (last ? runLine(last) : "Not run yet. It also runs by itself every Sunday.")}
        </p>
        <article className={s.card}>
          <div className={s.cardTop}>
            <h2 className={s.h3}>Where we look</h2>
          </div>
          <ul className={cx(t.ticks, t.plain)}>
            <li>Our watch list: {queue.counts.watchList} real AI tools for small businesses, including the AI features inside Square, QuickBooks, Jobber and Toast</li>
            <li>
              Vendors who <a href="/submit">apply to be listed</a>
            </li>
            <li>Links owners paste into "Check this tool"</li>
            <li>Every tool again after 90 days, or sooner when its pages change</li>
          </ul>
        </article>
        <article className={s.card}>
          <div className={s.cardTop}>
            <h2 className={s.h3}>Live services</h2>
          </div>
          <ul className={cx(t.ticks, t.plain)}>
            <li className={queue.services.googlePlaces ? undefined : t.warnItem}>
              Google business search: {queue.services.googlePlaces ? "on" : "off (owners can only use the saved businesses)"}
            </li>
            <li className={queue.services.ai ? undefined : t.warnItem}>
              AI ({queue.services.aiModel}): {queue.services.ai ? "on" : "off (rules only; the Safety Check holds tools it can't confirm)"}
            </li>
            <li>
              AI spent: ${queue.services.aiSpentUsd.toFixed(4)} of the ${queue.services.aiCapUsd} cap{queue.services.aiSpendShared ? "" : " (counted on this server only until storage is connected)"}
            </li>
            <li className={queue.services.weeklyRun ? undefined : t.warnItem}>Weekly discovery run: {queue.services.weeklyRun ? "on" : "off (set CRON_SECRET)"}</li>
            <li>Sample tools: {queue.services.samplesHidden ? "hidden" : "shown, labelled as samples"}</li>
          </ul>
        </article>
        <article className={s.card}>
          <div className={s.cardTop}>
            <h2 className={s.h3}>Catalog today</h2>
          </div>
          <div className={s.row}>
            <span className={cx(s.badge, s.ok)}>✓ {queue.counts.verified} Verified</span>
            <span className={cx(s.badge, s.grey)}>◷ {queue.counts.listed} waiting</span>
            <span className={cx(s.badge, s.bad)}>⚠ {queue.counts.blocked} Blocked</span>
          </div>
          <span className={s.hint}>{queue.storage.describe}</span>
        </article>
        {inLine.length > 0 && (
          <article className={s.card}>
            <div className={s.cardTop}>
              <h2 className={s.h3}>In line for the Safety Check ({inLine.length})</h2>
            </div>
            <ul className={cx(t.ticks, t.plain)}>
              {inLine.slice(0, 12).map((c) => (
                <li key={c.id}>
                  <b>{c.name}</b> · {c.domain} · {SOURCE_LABEL[c.source]}
                  {c.status === "failed" && <span className={s.small}> · {c.note}</span>}
                </li>
              ))}
              {inLine.length > 12 && <li className={s.small}>and {inLine.length - 12} more</li>}
            </ul>
          </article>
        )}
      </div>

      <div className={s.col}>
        <h2 className={s.h2}>Waiting for a person ({waiting.length})</h2>
        {waiting.length === 0 && <p className={s.notice}>Nothing to review. Run discovery to check the next tools.</p>}
        {waiting.map(reviewCard)}

        {blocked.length > 0 && (
          <>
            <h2 className={s.h2} style={{ marginTop: 8 }}>
              Blocked ({blocked.length})
            </h2>
            {blocked.map((c) => (
              <article key={c.id} className={s.card}>
                <div className={cx(s.cardTop, t.blockedTop)}>
                  <div className={s.cardHead}>
                    <div className={t.tname}>
                      <Logo id={c.id} name={c.name} />
                      <h3 className={s.h3}>{c.name}</h3>
                    </div>
                    <SafetyBadge badge="blocked" />
                  </div>
                  <span className={s.small}>
                    {c.domain} · {SOURCE_LABEL[c.source]} · {c.decidedBy}
                  </span>
                </div>
                <ul className={t.ticks}>
                  {(queue.records[c.id]?.safetyCheck.redFlags ?? [c.note ?? "Failed the Safety Check."]).map((x) => (
                    <li key={x} className={t.badItem}>
                      {x}
                    </li>
                  ))}
                </ul>
                <span className={s.small}>Never shown to owners. If an owner checks this link, they see these reasons.</span>
              </article>
            ))}
          </>
        )}

        {approved.length > 0 && (
          <>
            <h2 className={s.h2} style={{ marginTop: 8 }}>
              Approved recently
            </h2>
            <ul className={cx(t.ticks, t.plain)}>
              {approved.map((c) => (
                <li key={c.id}>
                  <a href={`/tools/${c.id}`}>{c.name}</a> · {c.note}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>,
  );
}
