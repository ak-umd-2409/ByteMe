"use client";

/**
 * The owner journey, as one guided flow:
 *   Landing → 1 Find (search, tap your business) → Reading → 2 Check what we found
 *   → 3 A few questions (one at a time) → 4 What's holding you back → 5 Ways to fix it (· Tool detail · Compare)
 * Data: /api/business/search, /api/journey/start, /api/journey/answer, /api/recommend (Part 4).
 * Style: docs/specs/b-wireframes.md. Ways to fix it, Tool detail and Compare live in ToolScreens.tsx.
 */
import { useEffect, useRef, useState } from "react";
import {
  api,
  ApiError,
  journey,
  type Answer,
  type JourneyAnswerResponse,
  type JourneyQuestion,
  type JourneyStartResponse,
  type Opportunity,
} from "@/lib/client/parts23.ts";
import type { BusinessMatch } from "@/lib/business/types.ts";
import type { RecommendationResult } from "@/lib/recommend/types.ts";
import type { CatalogRecord } from "@/lib/catalog/types.ts";
import s from "./start.module.css";
import { Compare, ToolDetail, WaysToFix, type Biz } from "./ToolScreens.tsx";

export interface LookupEntry {
  name: string;
  domain: string;
  status: "verified" | "listed" | "blocked";
  checked: string | null;
  sample: boolean;
}

type Screen = "landing" | "find" | "loading" | "check" | "ask" | "problems" | "tools" | "tool" | "compare";
type Answers = Record<string, Answer>;

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");
const message = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The questions asked one at a time, in this order (only those the backend asks for this business). */
const ASK_ORDER = ["problems", "call_recording", "health_data", "budget", "setup", "goals"];

const STEPS = ["Find", "Check", "Questions", "Results", "Tools"];

function Steps({ n }: { n: number }) {
  return (
    <nav className={s.stepper} aria-label="Progress">
      <ol>
        {STEPS.map((label, i) => {
          const k = i + 1;
          return (
            <li key={label} className={k < n ? s.stepDone : k === n ? s.stepNow : undefined} aria-current={k === n ? "step" : undefined}>
              <span className={s.dot}>{k < n ? "✓" : k}</span>
              <span className={s.stepLabel}>{label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Chip({ pressed, onClick, children, disabled }: { pressed: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className={s.chipsel} aria-pressed={pressed} onClick={onClick} disabled={disabled}>
      {pressed ? "✓ " : ""}
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: Opportunity["status"] | "unchecked" }) {
  if (status === "confirmed") return <span className={cx(s.badge, s.ok)}>● Confirmed</span>;
  if (status === "likely") return <span className={cx(s.badge, s.warn)}>◐ Likely</span>;
  return <span className={cx(s.badge, s.grey)}>○ Not confirmed</span>;
}

/** Tap chips for a single- or multi-choice question (used inside cards). */
function ChoiceQuestion({ q, value, onChange }: { q: JourneyQuestion; value: Answer | undefined; onChange: (v: Answer) => void }) {
  const picked = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const toggle = (v: string) => {
    if (q.kind === "single") return onChange(picked.includes(v) ? null : v);
    if (v === "none") return onChange(picked.includes("none") ? null : ["none"]);
    const next = picked.includes(v) ? picked.filter((x) => x !== v) : [...picked.filter((x) => x !== "none"), v];
    if (q.maxSelect && next.length > q.maxSelect) return;
    onChange(next.length ? next : null);
  };
  return (
    <div className={s.row}>
      {q.options?.map((o) => (
        <Chip key={o.value} pressed={picked.includes(o.value)} onClick={() => toggle(o.value)}>
          {o.label}
          {o.hint && <span className={s.chipHint}>· {o.hint}</span>}
        </Chip>
      ))}
    </div>
  );
}

/** Big, full-width answer rows for the one-question-at-a-time step. */
function OptionList({ q, value, onPick }: { q: JourneyQuestion; value: Answer | undefined; onPick: (v: Answer, done: boolean) => void }) {
  const picked = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const multi = q.kind === "multi";
  const toggle = (v: string) => {
    if (!multi) return onPick(v, true);
    if (v === "none") return onPick(picked.includes("none") ? null : ["none"], false);
    const next = picked.includes(v) ? picked.filter((x) => x !== v) : [...picked.filter((x) => x !== "none"), v];
    if (q.maxSelect && next.length > q.maxSelect) return;
    onPick(next.length ? next : null, false);
  };
  return (
    <div className={s.options} role={multi ? "group" : "radiogroup"} aria-label={q.text}>
      {q.options?.map((o) => {
        const on = picked.includes(o.value);
        const full = multi && !on && q.maxSelect !== undefined && picked.filter((x) => x !== "none").length >= q.maxSelect && o.value !== "none";
        return (
          <button
            key={o.value}
            type="button"
            role={multi ? "checkbox" : "radio"}
            aria-checked={on}
            className={cx(s.option, o.value === "none" && s.optionNone)}
            onClick={() => toggle(o.value)}
            disabled={full}
          >
            <span className={cx(s.optionMark, multi && s.optionSquare)} aria-hidden="true">
              {on ? "✓" : ""}
            </span>
            <span className={s.optionText}>
              <b>{o.label}</b>
              {o.hint && <span>{o.hint}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Journey({ lookup, catalog }: { lookup: LookupEntry[]; catalog: CatalogRecord[] }) {
  const [screen, setScreen] = useState<Screen>("landing");
  const [error, setError] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);

  // Find
  const [name, setName] = useState("");
  const [town, setTown] = useState("");
  const [matches, setMatches] = useState<BusinessMatch[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [manual, setManual] = useState(false);
  const [manualSite, setManualSite] = useState("");
  const [pasted, setPasted] = useState("");
  const [readingName, setReadingName] = useState("");

  // Journey
  const [start, setStart] = useState<JourneyStartResponse | null>(null);
  const [result, setResult] = useState<JourneyAnswerResponse | null>(null);
  const [context, setContext] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  // Read by delayed callbacks (auto-advance), so they always see the latest answers.
  const answersRef = useRef<Answers>(answers);
  answersRef.current = answers;
  const [busy, setBusy] = useState(false);
  const [loadDone, setLoadDone] = useState(false);
  const [slow, setSlow] = useState(false);
  const abort = useRef<AbortController | null>(null);

  // Check
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // Questions
  const [qIndex, setQIndex] = useState(0);

  // Results
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const [elseText, setElseText] = useState("");
  const [openOpp, setOpenOpp] = useState<string | null>(null);
  const seeMoreBtn = useRef<HTMLButtonElement | null>(null);

  // Tools
  const [recs, setRecs] = useState<RecommendationResult | null>(null);
  const [toolId, setToolId] = useState<string | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [cameFrom, setCameFrom] = useState<Screen>("tools");

  // Landing link check
  const [toolUrl, setToolUrl] = useState("");
  const [toolResult, setToolResult] = useState<string | null>(null);

  useEffect(() => {
    top.current?.scrollIntoView({ block: "start" });
  }, [screen, qIndex]);

  // "See more" pop-up: Escape closes it, and focus goes back to the button that opened it.
  useEffect(() => {
    if (!openOpp) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenOpp(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openOpp]);
  useEffect(() => {
    if (!openOpp) seeMoreBtn.current?.focus();
  }, [openOpp]);

  const go = (next: Screen) => {
    setError(null);
    setScreen(next);
  };

  const startOver = () => {
    abort.current?.abort();
    setStart(null);
    setResult(null);
    setContext(null);
    setAnswers({});
    setMatches(null);
    setManual(false);
    setRecs(null);
    setPicks([]);
    setToolId(null);
    setNumbers({});
    setQIndex(0);
    go("landing");
  };

  const setAnswer = (id: string, value: Answer) =>
    setAnswers((prev) => {
      const next = { ...prev };
      if (value === null) delete next[id];
      else next[id] = value;
      return next;
    });

  /** Send changed answers; the server remembers the rest through `context`. */
  const send = async (patch: Answers, ctx = context) => {
    if (!ctx) return null;
    setBusy(true);
    setError(null);
    try {
      const res = await journey.answer(ctx, patch);
      setContext(res.context);
      setResult(res);
      setAnswers((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || res.ignored.some((i) => i.questionId === k)) delete next[k];
          else next[k] = v;
        }
        return next;
      });
      if (res.ignored.length) setError(res.ignored.map((i) => i.reason).join(" "));
      return res;
    } catch (e) {
      setError(message(e));
      return null;
    } finally {
      setBusy(false);
    }
  };

  // ---------- actions ----------

  const search = async () => {
    if (!name.trim()) return setError("Type your business name first.");
    setSearching(true);
    setError(null);
    setManual(false);
    try {
      const res = await api.search(name.trim(), town.trim() || undefined);
      setMatches(res.matches.slice(0, 3));
    } catch (e) {
      setError(message(e));
    } finally {
      setSearching(false);
    }
  };

  /** Read a business: a search result (placeId) or one typed in by hand. */
  const read = async (target: { placeId: string; label: string } | { manual: true }) => {
    const label = "placeId" in target ? target.label : name.trim();
    if (!label) return setError("Type your business name first.");
    setReadingName(label);
    go("loading");
    setLoadDone(false);
    setSlow(false);
    setAnswers({});
    setQIndex(0);
    const controller = new AbortController();
    abort.current = controller;
    const slowTimer = setTimeout(() => setSlow(true), 15_000);
    try {
      const res = await fetch("/api/journey/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...("placeId" in target
            ? { placeId: target.placeId }
            : { manual: { name: name.trim(), ...(town.trim() ? { town: town.trim() } : {}), ...(manualSite.trim() ? { website: manualSite.trim() } : {}) } }),
          ...(pasted.trim() ? { pastedReviews: pasted.trim() } : {}),
        }),
        signal: controller.signal,
      });
      const body = await res.json();
      if (!res.ok) throw new ApiError(res.status, body, res.headers.get("retry-after"));
      const data = body as JourneyStartResponse;
      setStart(data);
      setContext(data.context);
      // Pre-tick what we already saw (e.g. tools on the website).
      for (const q of data.questions) if (q.default !== null) setAnswer(q.id, q.default);
      setLoadDone(true);
      setTimeout(() => go("check"), 800);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(message(e));
      setScreen("find");
    } finally {
      clearTimeout(slowTimer);
    }
  };

  /** End of the questions: send everything from the check and question steps at once. */
  const finishQuestions = async () => {
    if (!start) return;
    const ids = new Set(start.questions.map((q) => q.id));
    const now = answersRef.current;
    const patch: Answers = {};
    for (const [k, v] of Object.entries(now)) if (ids.has(k) || k.startsWith("edit.")) patch[k] = v;
    // Questions the owner skipped are cleared, so the server records them as skipped.
    for (const id of ASK_ORDER) if (ids.has(id) && !(id in now)) patch[id] = null;
    const res = await send(patch, context ?? start.context);
    if (res) go("problems");
  };

  const showTools = async () => {
    if (!result?.recommendation.ready) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/recommend", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(result.recommendation.request) });
      const body = await res.json();
      if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : "We couldn't load tools right now.");
      setRecs(body as RecommendationResult);
      go("tools");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const checkTool = () => {
    let host = "";
    try {
      host = new URL(/^https?:\/\//.test(toolUrl.trim()) ? toolUrl.trim() : `https://${toolUrl.trim()}`).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return setToolResult("That doesn't look like a link. Try something like https://example.com.");
    }
    const hit = lookup.find((e) => host === e.domain || host.endsWith(`.${e.domain}`));
    if (!hit) return setToolResult(`${host} isn't in our list yet. A person needs to check it before we'd recommend it.`);
    const word = hit.status === "verified" ? "✓ Verified by a person" : hit.status === "blocked" ? "⚠ Blocked: it failed our safety check" : "◷ Not yet reviewed";
    setToolResult(`${hit.name}: ${word}${hit.checked ? ` · last checked ${hit.checked}` : ""}${hit.sample ? " (sample entry)" : ""}.`);
  };

  // ---------- frame ----------

  const banner = start?.mode.sampleData ? (
    <div className={s.banner}>Sample business for the demo. Nothing here is real.</div>
  ) : start?.mode.capturedAt ? (
    <div className={s.banner}>
      Real business, read from public pages saved on{" "}
      {new Date(start.mode.capturedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}.
    </div>
  ) : null;

  const errorBox = error ? (
    <div className={s.error} role="alert">
      {error}
    </div>
  ) : null;

  const frame = (children: React.ReactNode, opts: { narrow?: boolean } = {}) => (
    <div className={s.app} ref={top}>
      <header className={s.topbar}>
        <div className={s.topbarInner}>
          <button type="button" className={s.brand} onClick={startOver}>
            MainStreet AI
          </button>
          {screen === "landing" ? (
            <a className={s.linkInk} href="/admin">
              For reviewers
            </a>
          ) : (
            <button
              type="button"
              className={s.linkInk}
              onClick={
                screen === "loading"
                  ? () => {
                      abort.current?.abort();
                      go("find");
                    }
                  : startOver
              }
            >
              {screen === "loading" ? "Cancel" : "Start over"}
            </button>
          )}
        </div>
      </header>
      <main className={cx(s.page, opts.narrow && s.narrow)} key={screen === "ask" ? `ask-${qIndex}` : screen}>
        {children}
      </main>
    </div>
  );

  // ---------- 1 · Landing ----------
  if (screen === "landing") {
    const counts = { verified: lookup.filter((e) => e.status === "verified").length, blocked: lookup.filter((e) => e.status === "blocked").length };
    return frame(
      <>
        <section className={s.heroGrid}>
          <div className={s.col} style={{ gap: 18 }}>
            <span className={cx(s.badge, s.ok)}>✓ Every tool checked by a person</span>
            <h1 className={s.hero}>AI tools you can trust, picked for your business.</h1>
            <p className={s.lead}>Most AI searches give you 50 tools and no way to tell which are safe. We show you the few that are checked, work with what you already use, and come with someone to help set them up.</p>
            <div className={s.row} style={{ gap: 16 }}>
              <button type="button" className={cx(s.btn, s.primary, s.wide)} onClick={() => go("find")}>
                Find my AI tools
              </button>
              <a className={s.link} href="#how-we-check">How we check tools</a>
            </div>
            <span className={s.small}>Free · about 3 minutes · no sign-up</span>
            <div className={s.stats}>
              <div><b className={s.num}>{counts.verified}</b><span>tools checked and approved</span></div>
              <div><b className={s.num}>{counts.blocked}</b><span>scams blocked</span></div>
              <div><b className={s.num}>8</b><span>safety checks on every tool</span></div>
            </div>
          </div>

          <div className={s.preview} aria-label="Example of what you'll see">
            <span className={s.previewTag}>Example result</span>
            <div className={s.card}>
              <div className={s.cardTop}>
                <span className={cx(s.badge, s.ok, s.seal)}>✓ Verified</span>
                <div className={s.cardHead}>
                  <div className={s.previewName}><span className={s.previewLogo} aria-hidden="true">Rw</span><h2 className={s.h3}>Ringwise Receptionist</h2></div>
                  <span className={s.price}>$59<small>/mo</small></span>
                </div>
              </div>
              <p className={s.small} style={{ color: "var(--ink)" }}>Answers calls you miss on a job and texts you the details.</p>
              <ul className={s.previewTicks}>
                <li>Works with your Square</li>
                <li>Doesn't use your data to train AI</li>
                <li>Tells callers they're recorded, as Maryland requires</li>
              </ul>
            </div>
            <div className={s.previewBlocked}>
              <span className={cx(s.badge, s.bad)}>⚠ Blocked</span>
              <span><b>Squarre Voice AI</b> copies Square's name and its website is 2 months old. We'd never show it to you.</span>
            </div>
          </div>
        </section>

        <section className={s.band}>
          <h2 className={s.h2}>How it works</h2>
          <ol className={s.stepsRow}>
            <li><span className={s.stepNum}>1</span><b>Type your business name.</b><span>We read your Google listing, website and reviews, so you don't fill in a long form.</span></li>
            <li><span className={s.stepNum}>2</span><b>See what's costing you.</b><span>Missed calls, slow quotes, unanswered reviews. Each one comes with the proof.</span></li>
            <li><span className={s.stepNum}>3</span><b>Pick a fix and get help.</b><span>Only checked tools that fit your budget, plus a free local advisor to set it up.</span></li>
          </ol>
        </section>

        <section className={s.band} id="how-we-check">
          <h2 className={s.h2}>What we check before a tool reaches you</h2>
          <div className={s.checkGrid}>
            <div><b>Who's behind it</b><span>A real company, a street address and named people.</span></div>
            <div><b>How long it's been around</b><span>New websites are riskier, so we look at the website's age.</span></div>
            <div><b>What happens to your data</b><span>Does it train AI on it? Can you delete it? Where is it kept?</span></div>
            <div><b>Clear prices</b><span>A public price and the freedom to cancel any month.</span></div>
          </div>
          <p className={s.small}>Then a person reviews it. Tools that copy a brand name or have no privacy policy are blocked automatically.</p>
        </section>

        <section className={s.adBand}>
          <div className={s.col} style={{ gap: 6 }}>
            <h2 className={s.h2}>Saw an AI tool in an ad?</h2>
            <p className={s.small} style={{ color: "var(--ink)" }}>Paste the link and we'll tell you if a person has checked it.</p>
          </div>
          <div className={s.col} style={{ gap: 10 }}>
            <div className={s.adRow}>
              <label htmlFor="tool-link" className={s.sr}>
                Tool link
              </label>
              <input id="tool-link" className={s.input} placeholder="https://" value={toolUrl} onChange={(e) => { setToolUrl(e.target.value); setToolResult(null); }} />
              <button type="button" className={cx(s.btn, s.secondary)} onClick={checkTool} disabled={!toolUrl.trim()}>
                Check this tool
              </button>
            </div>
            {toolResult && (
              <p className={s.notice} aria-live="polite">
                {toolResult}
              </p>
            )}
          </div>
        </section>

        <p className={s.small} style={{ textAlign: "center" }}>
          With help from the Maryland SBDC network · Built by Team ByteMe, University of Maryland
        </p>
      </>,
    );
  }


  // ---------- 1 · Find your business ----------
  if (screen === "find")
    return frame(
      <>
        <Steps n={1} />
        <header className={s.intro}>
          <h1 className={s.title}>Let's find your business</h1>
          <p className={s.lead}>Type its name. We'll read your public listings, website and reviews, so you don't have to fill in a form.</p>
        </header>

        <form
          className={s.searchCard}
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <div className={s.searchRow}>
            <div className={cx(s.field, s.grow)}>
              <label htmlFor="biz-name">Business name</label>
              <input id="biz-name" className={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Frederick Heating" autoComplete="organization" autoFocus />
            </div>
            <div className={cx(s.field, s.townField)}>
              <label htmlFor="biz-town">
                Town or ZIP <span className={s.opt}>(optional)</span>
              </label>
              <input id="biz-town" className={s.input} value={town} onChange={(e) => setTown(e.target.value)} placeholder="e.g. Frederick" />
            </div>
            <button type="submit" className={cx(s.btn, s.primary, s.searchBtn)} disabled={searching}>
              {searching ? "Searching…" : "Search"}
            </button>
          </div>
          {errorBox}
        </form>

        {matches && (
          <section className={s.col} aria-live="polite">
            <h2 className={s.h3}>{matches.length ? "Is it one of these? Tap yours." : `We couldn't find “${name.trim()}”.`}</h2>
            {matches.map((m) => (
              <button key={m.placeId} type="button" className={s.resultRow} onClick={() => void read({ placeId: m.placeId, label: m.name })}>
                <span className={s.resultText}>
                  <b>{m.name}</b>
                  <span>{[m.address, m.rating !== null ? `★ ${m.rating}${m.reviewCount !== null ? ` (${m.reviewCount} reviews)` : ""}` : null].filter(Boolean).join(" · ")}</span>
                </span>
                <span className={s.resultGo}>This is me →</span>
              </button>
            ))}
            {!manual ? (
              <button type="button" className={s.link} style={{ justifySelf: "start", paddingLeft: 0 }} onClick={() => setManual(true)}>
                {matches.length ? "Not on the list? Enter it yourself" : "Enter it yourself"}
              </button>
            ) : (
              <form
                className={s.card}
                onSubmit={(e) => {
                  e.preventDefault();
                  void read({ manual: true });
                }}
              >
                <h3 className={s.h3}>Enter it yourself</h3>
                <p className={s.small}>
                  We'll use “{name.trim() || "your business"}”{town.trim() ? ` in ${town.trim()}` : ""}. We only cover Maryland for now.
                </p>
                <div className={s.field}>
                  <label htmlFor="biz-site">
                    Website <span className={s.opt}>(optional, helps a lot)</span>
                  </label>
                  <input id="biz-site" className={s.input} value={manualSite} onChange={(e) => setManualSite(e.target.value)} placeholder="https://" />
                </div>
                <button type="submit" className={cx(s.btn, s.primary)} style={{ justifySelf: "start" }} disabled={!name.trim()}>
                  Read my business →
                </button>
              </form>
            )}
          </section>
        )}

        <details className={s.disc}>
          <summary>
            Have reviews from Yelp or Facebook? <span className={s.opt}>(optional)</span>
          </summary>
          <div className={s.discBody}>
            <p className={s.small}>Google only shares 5 reviews. Paste a few more for a better read. Leave a blank line between reviews.</p>
            <label htmlFor="pasted" className={s.sr}>
              Reviews
            </label>
            <textarea id="pasted" className={s.textarea} value={pasted} onChange={(e) => setPasted(e.target.value)} maxLength={20000} />
          </div>
        </details>
      </>,
      { narrow: true },
    );

  // ---------- Reading your business ----------
  if (screen === "loading")
    return frame(
      <>
        <Steps n={1} />
        <div className={s.loadbox}>
          <h1 className={s.title}>Reading {readingName}</h1>
          <ul className={cx(s.checks, loadDone ? s.done : s.loading)}>
            <li>
              <span className={s.ck} />
              Your listings
            </li>
            <li>
              <span className={s.ck} />
              Your website
            </li>
            <li>
              <span className={s.ck} />
              Customer reviews
            </li>
            <li>
              <span className={s.ck} />
              Tools on your site
            </li>
          </ul>
          <p className={s.small} aria-live="polite">
            {loadDone ? "Done. Here's what we found." : slow ? "Some websites are slow. Still reading…" : "This takes a few seconds."}
          </p>
        </div>
      </>,
      { narrow: true },
    );

  if (!start) return frame(<p>Start over to pick a business.</p>, { narrow: true });
  const q = (id: string) => start.questions.find((x) => x.id === id);

  // ---------- 2 · Check what we found ----------
  if (screen === "check") {
    const listingQ = start.questions.find((x) => x.id.startsWith("listing."));
    const toolsQ = q("tools");
    const b = start.business;
    return frame(
      <>
        <Steps n={2} />
        {banner}
        <header className={s.intro}>
          <h1 className={s.title}>Here's what we found</h1>
          <p className={s.lead}>Check the details. Fix anything that's wrong, then we'll ask a few quick questions.</p>
        </header>

        <article className={s.card}>
          <div className={s.cardTop}>
            <h2 className={s.h2}>{b.name}</h2>
            <span className={s.small}>
              {b.subtitle}
              {b.rating && ` · ★ ${b.rating.value}${b.rating.count !== null ? ` (${b.rating.count} reviews)` : ""}`}
            </span>
          </div>
          <dl className={s.factlist}>
            {b.facts
              .filter((f) => f.id !== "name")
              .map((f) => {
                const edited = answers[`edit.${f.id}`];
                const value = typeof edited === "string" ? edited : f.value;
                const source = typeof edited === "string" ? "You told us" : f.source;
                return (
                  <div className={s.fact} key={f.id}>
                    <dt>{f.label}</dt>
                    <dd className={value ? undefined : s.missing}>{value ?? "We couldn't find this"}</dd>
                    {source && <span className={s.chip}>{source}</span>}
                    {f.editable && editing !== f.id && (
                      <button
                        type="button"
                        className={s.edit}
                        onClick={() => {
                          setEditing(f.id);
                          setDraft(value ?? "");
                        }}
                        aria-label={`${value ? "Edit" : "Add"} ${f.label.toLowerCase()}`}
                      >
                        {value ? "Edit" : "Add"}
                      </button>
                    )}
                    {editing === f.id && (
                      <form
                        className={s.editRow}
                        onSubmit={(e) => {
                          e.preventDefault();
                          setAnswer(`edit.${f.id}`, draft.trim() ? draft.trim().slice(0, 200) : null);
                          setEditing(null);
                        }}
                      >
                        <label htmlFor={`edit-${f.id}`} className={s.sr}>
                          {f.label}
                        </label>
                        <input id={`edit-${f.id}`} className={s.input} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus maxLength={200} />
                        <button type="submit" className={cx(s.btn, s.secondary)}>
                          Save
                        </button>
                        <button type="button" className={s.link} onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </form>
                    )}
                  </div>
                );
              })}
          </dl>
          {listingQ && (
            <div className={s.mismatch}>
              <b>{listingQ.text}</b>
              <span className={s.small}>{listingQ.why}</span>
              <div className={s.stack}>
                {listingQ.options?.map((o) => {
                  const on = answers[listingQ.id] === o.value;
                  return (
                    <button key={o.value} type="button" role="radio" aria-checked={on} className={s.pickOption} onClick={() => setAnswer(listingQ.id, on ? null : o.value)}>
                      <span className={s.optionMark} aria-hidden="true">
                        {on ? "✓" : ""}
                      </span>
                      <span className={s.optionText}>
                        <b>{o.label}</b>
                        {o.hint && <span>{o.hint}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </article>

        <article className={s.card}>
          <div className={s.cardTop}>
            <h2 className={s.h3}>What customers say</h2>
            {start.customersSay.reviewCount > 0 && <span className={s.small}>From {plural(start.customersSay.reviewCount, "review")} we read</span>}
          </div>
          {start.customersSay.themes.length === 0 && <p className={s.small}>We didn't find reviews to read.</p>}
          {start.customersSay.themes.map((t) => (
            <div className={s.theme} key={t.key}>
              <div className={s.themeHead}>
                <span className={cx(s.badge, t.polarity === "praise" ? s.ok : s.warn)}>{t.polarity === "praise" ? "Praise" : "Complaint"}</span>
                <b>{t.label}</b>
                <span className={s.small}>{t.countLabel}</span>
              </div>
              {t.example && (
                <>
                  {t.example.isQuote ? <q className={s.quote}>{t.example.text}</q> : <span>Summary: {t.example.text}</span>}
                  <span className={s.small}>
                    {[t.example.who, t.example.where].filter(Boolean).join(" · ")}
                    {t.example.url && (
                      <>
                        {" · "}
                        <a href={t.example.url} target="_blank" rel="noreferrer">
                          view
                        </a>
                      </>
                    )}
                  </span>
                </>
              )}
            </div>
          ))}
          {start.customersSay.note && <p className={s.small}>{start.customersSay.note}</p>}
        </article>

        <article className={s.card}>
          <div className={s.cardTop}>
            <h2 className={s.h3}>Tools you use</h2>
          </div>
          {start.toolsFound.length > 0 ? (
            <div className={s.row}>
              {start.toolsFound.map((t) => (
                <span className={s.chip} key={t.name}>
                  ✓ {t.name}
                  {t.url && (
                    <>
                      {" · "}
                      <a href={t.url} target="_blank" rel="noreferrer">
                        where we saw it
                      </a>
                    </>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <p className={s.small}>We didn't spot any tools on your website.</p>
          )}
          {toolsQ && (
            <>
              <span className={s.sub}>Do you use any of these? We can't see them from outside.</span>
              <ChoiceQuestion q={toolsQ} value={answers.tools} onChange={(v) => setAnswer("tools", v)} />
            </>
          )}
        </article>

        <details className={s.disc}>
          <summary>Where we looked ({plural(start.sources.count, "public source")})</summary>
          <div className={s.discBody}>
            <ul className={s.todo}>
              {start.sources.list.map((src, i) => (
                <li key={i}>
                  {src.url ? (
                    <a href={src.url} target="_blank" rel="noreferrer">
                      {src.label}
                    </a>
                  ) : (
                    src.label
                  )}
                </li>
              ))}
            </ul>
          </div>
        </details>

        <div className={s.actionBar}>
          <button type="button" className={s.link} onClick={() => go("find")}>
            ‹ Back
          </button>
          <button
            type="button"
            className={cx(s.btn, s.primary)}
            onClick={() => {
              setQIndex(0);
              go("ask");
            }}
          >
            Looks right →
          </button>
        </div>
      </>,
      { narrow: true },
    );
  }

  // ---------- 3 · A few questions, one at a time ----------
  if (screen === "ask") {
    const flow = ASK_ORDER.map((id) => q(id)).filter((x): x is JourneyQuestion => Boolean(x) && journey.visible(x!, answers));
    const i = Math.min(qIndex, Math.max(flow.length - 1, 0));
    const current = flow[i];
    const last = i >= flow.length - 1;
    const next = () => (last ? void finishQuestions() : setQIndex(i + 1));
    const value = current ? answers[current.id] : undefined;
    const hasValue = Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null;
    if (!current) {
      return frame(
        <>
          <Steps n={3} />
          <p>No questions for this business.</p>
          <button type="button" className={cx(s.btn, s.primary)} onClick={() => void finishQuestions()}>
            See results →
          </button>
        </>,
        { narrow: true },
      );
    }
    return frame(
      <>
        <Steps n={3} />
        <div className={s.qHead}>
          <span className={s.small}>
            Question {i + 1} of {flow.length}
          </span>
          <div className={s.qBar} aria-hidden="true">
            <i style={{ width: `${((i + 1) / flow.length) * 100}%` }} />
          </div>
        </div>
        <header className={s.intro}>
          <h1 className={s.title}>{current.text}</h1>
          <p className={s.lead}>
            {current.why}
            {current.source?.url && (
              <>
                {" "}
                <a href={current.source.url} target="_blank" rel="noreferrer">
                  Read the law
                </a>
              </>
            )}
          </p>
          {current.kind === "multi" && <span className={s.small}>{current.maxSelect ? `Pick up to ${current.maxSelect}.` : "Pick all that apply."}</span>}
        </header>

        <OptionList
          q={current}
          value={value}
          onPick={(v, done) => {
            setAnswer(current.id, v);
            if (done) setTimeout(next, 220);
          }}
        />
        {errorBox}

        <div className={s.actionBar}>
          <button type="button" className={s.link} onClick={() => (i === 0 ? go("check") : setQIndex(i - 1))}>
            ‹ Back
          </button>
          <div className={s.row}>
            <button
              type="button"
              className={s.link}
              onClick={() => {
                setAnswer(current.id, null);
                next();
              }}
              title={current.ifSkipped}
            >
              Skip
            </button>
            {(current.kind === "multi" || (last && hasValue)) && (
              <button type="button" className={cx(s.btn, s.primary)} onClick={next} disabled={busy || (current.kind === "multi" && !hasValue)}>
                {busy ? "One moment…" : last ? "See results →" : "Continue →"}
              </button>
            )}
          </div>
        </div>
        <p className={s.hint}>If you skip: {current.ifSkipped}</p>
      </>,
      { narrow: true },
    );
  }

  if (!result) return frame(<p>Start over to pick a business.</p>, { narrow: true });

  // ---------- 4 · What's holding you back ----------
  if (screen === "problems") {
    const opps = result.opportunities;
    const confirmed = opps.filter((o) => o.status === "confirmed").length;
    const likely = opps.filter((o) => o.status === "likely").length;
    const sum = (kind: "revenue_opportunity" | "time_cost") => {
      const list = opps.filter((o) => o.impact?.kind === kind).map((o) => o.impact!.monthly);
      return list.length ? list.reduce((a, m) => ({ expected: a.expected + m.expected, low: a.low + m.low, high: a.high + m.high }), { expected: 0, low: 0, high: 0 }) : null;
    };
    const revenue = sum("revenue_opportunity");
    const time = sum("time_cost");
    const problemsQ = q("problems");
    const hints = new Map((problemsQ?.options ?? []).map((o) => [o.value, o]));
    const extra = start.questions.filter((x) => (x.id === "call_recording" || x.id === "health_data") && journey.visible(x, answers) && !(x.id in answers));
    const dealQ = q("deal_breakers");
    const counts = [confirmed ? `${confirmed} confirmed` : null, likely ? `${likely} likely` : null].filter(Boolean).join(" and ");
    const followUp = (id: string) => result.followUps.find((f) => f.id === id);
    const toolCount = result.recommendation.ready ? result.recommendation.focus.length : 0;

    return frame(
      <>
        <Steps n={4} />
        {banner}
        <header className={s.intro}>
          <h1 className={s.title}>What's holding {start.business.name} back</h1>
          <p className={s.lead}>
            {opps.length ? (
              <>
                We found <b>{counts}</b> {opps.length === 1 ? "problem" : "problems"}, most important first.
                {revenue && (
                  <>
                    {" "}
                    Together they might be worth about <b className={s.num}>{usd(revenue.expected)} a month</b> in missed business{" "}
                    <span className={s.num}>
                      ({usd(revenue.low)}–{usd(revenue.high)})
                    </span>
                    .
                  </>
                )}
                {time && (
                  <>
                    {" "}
                    {revenue ? "Plus" : "That's"} about <b className={s.num}>{usd(time.expected)} a month</b> of your time.
                  </>
                )}
              </>
            ) : (
              result.headline
            )}
          </p>
          {revenue || time ? (
            <span className={s.small}>Estimated opportunity, not proven lost revenue.</span>
          ) : opps.some((o) => o.impactNeeds.length) ? (
            <span className={s.small}>Want a dollar figure? Open a card and add a couple of numbers only you know.</span>
          ) : null}
        </header>

        <div className={s.oppGrid}>
          {opps.map((o) => (
            <article className={cx(s.card, s.pcard)} key={o.id}>
              <div className={cx(s.cardTop, s.pcTop)}>
                <div className={s.row} style={{ justifyContent: "space-between" }}>
                  <StatusBadge status={o.status} />
                  <span className={s.rank}>#{o.rank}</span>
                </div>
                <h2 className={s.h3}>{o.headline}</h2>
                <span className={s.small}>{o.statusLabel}</span>
              </div>
              <div className={s.pcBody}>
                {o.impact ? (
                  <p className={s.money}>
                    <span className={s.small}>{o.impact.kind === "time_cost" ? "Your time: about" : "Might be worth about"}</span>{" "}
                    <b className={s.num}>{usd(o.impact.monthly.expected)} a month</b>
                  </p>
                ) : (
                  <span className={s.small}>{o.impactNeeds.length ? "Add a number to see what it's worth" : o.fix.kind === "free" ? "Free to fix" : "No dollar figure for this one"}</span>
                )}
                <p className={s.clamp}>{o.whyItMatters}</p>
                <p className={s.firstStep}>
                  <b>First step:</b> {o.fix.nextStep}
                </p>
              </div>
              <button
                type="button"
                className={cx(s.btn, s.secondary, s.seeMore)}
                aria-haspopup="dialog"
                onClick={(e) => {
                  seeMoreBtn.current = e.currentTarget;
                  setOpenOpp(o.id);
                }}
              >
                See the proof
              </button>
            </article>
          ))}
        </div>

        {(() => {
          const o = opps.find((x) => x.id === openOpp);
          if (!o) return null;
          return (
            <div
              className={s.overlay}
              onClick={(e) => {
                if (e.target === e.currentTarget) setOpenOpp(null);
              }}
            >
              <div className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="opp-title">
                <div className={s.dialogTop}>
                  <div className={s.col} style={{ gap: 6 }}>
                    <StatusBadge status={o.status} />
                    <h2 className={s.h2} id="opp-title">
                      {o.headline}
                    </h2>
                    <span className={s.small}>{o.statusLabel}</span>
                  </div>
                  <button type="button" className={cx(s.btn, s.secondary, s.closeBtn)} onClick={() => setOpenOpp(null)} autoFocus>
                    Close ✕
                  </button>
                </div>
                <div className={s.dialogBody}>
                  <p>{o.whyItMatters}</p>
                  <div className={s.col} style={{ gap: 10 }}>
                    <h3 className={s.h3}>Why we think this</h3>
                    <ul className={s.evid}>
                      {o.evidence.map((e, k) => (
                        <li key={k} className={e.observed ? undefined : s.unsure}>
                          {e.title && <b>{e.title}</b>}
                          {e.isQuote ? <q className={s.quote}>{e.text}</q> : <span>{e.text}</span>}
                          <span className={s.small}>
                            {e.sourceLabel}
                            {!e.observed && " · not directly seen"}
                            {e.links.slice(0, 4).map((l, n) => (
                              <span key={n}>
                                {" · "}
                                <a href={l.url!} target="_blank" rel="noreferrer">
                                  {l.label === e.sourceLabel || e.links.length === 1 ? "view page" : l.label}
                                </a>
                              </span>
                            ))}
                          </span>
                        </li>
                      ))}
                      {o.counterEvidence && (
                        <li className={s.against}>
                          <span>But: {o.counterEvidence}.</span>
                          <span className={s.small}>Customer reviews</span>
                        </li>
                      )}
                    </ul>
                    {o.moreEvidence > 0 && <span className={s.small}>And {o.moreEvidence} more.</span>}
                  </div>
                  {o.impact ? (
                    <div className={s.calc}>
                      <p className={s.money}>
                        <span className={s.small}>{o.impact.kind === "time_cost" ? "Your time: about" : "Might be worth about"}</span>{" "}
                        <b className={s.num}>{usd(o.impact.monthly.expected)} a month</b>
                      </p>
                      <span className={s.sub}>How we got the number</span>
                      <p className={s.small}>{o.impact.math}</p>
                      {o.impact.assumed.length > 0 && (
                        <span className={s.hint}>
                          Our assumption:{" "}
                          {o.impact.assumed
                            .map((a) => `${a.label.toLowerCase()} ${a.unit === "percent" ? `${Math.round(a.value * 100)}%` : a.unit === "usd" || a.unit === "usd_per_hour" ? usd(a.value) : a.value}`)
                            .join("; ")}
                          .
                        </span>
                      )}
                    </div>
                  ) : o.impactNeeds.length ? (
                    <form
                      className={cx(s.calc, s.calcBox)}
                      onSubmit={(e) => {
                        e.preventDefault();
                        const patch: Answers = {};
                        for (const id of o.impactNeeds) {
                          const raw = numbers[id]?.replace(/[$,\s]/g, "");
                          if (raw) patch[id] = Number(raw);
                        }
                        if (Object.keys(patch).length) void send(patch);
                      }}
                    >
                      <span className={s.sub}>What might this be worth?</span>
                      {o.impactNeeds.map((id) => {
                        const f = followUp(id);
                        if (!f) return null;
                        return (
                          <div className={s.field} key={id}>
                            <label htmlFor={`${o.id}-${id}`}>{f.text}</label>
                            <input
                              id={`${o.id}-${id}`}
                              className={s.input}
                              inputMode="decimal"
                              placeholder={f.placeholder}
                              value={numbers[id] ?? (typeof answers[id] === "number" ? String(answers[id]) : "")}
                              onChange={(e) => setNumbers((n) => ({ ...n, [id]: e.target.value }))}
                            />
                          </div>
                        );
                      })}
                      <span className={s.hint}>Only you know these. We won't guess them.</span>
                      <button type="submit" className={cx(s.btn, s.secondary)} disabled={busy} style={{ justifySelf: "start" }}>
                        Show the estimate
                      </button>
                      {errorBox}
                    </form>
                  ) : (
                    o.impactNote && <p className={s.small}>{o.impactNote}</p>
                  )}
                  <p className={s.firstStep}>
                    <b>First step:</b> {o.fix.nextStep} <span className={s.small}>· {o.fix.label}</span>
                  </p>
                  {o.alsoCovers.length > 0 && <span className={s.small}>Also covers: {o.alsoCovers.map((c) => c.headline.toLowerCase()).join(", ")}.</span>}
                </div>
              </div>
            </div>
          );
        })()}

        {(result.toCheck.length > 0 || extra.length > 0) && (
          <section className={s.card}>
            <div className={s.cardTop}>
              <h2 className={s.h3}>Do any of these happen too?</h2>
              <span className={s.small}>You skipped these. We can't see them from outside, so we haven't counted them.</span>
            </div>
            {result.toCheck.map((t) => (
              <div className={s.checkRow} key={t.problemKey}>
                <span className={s.optionText}>
                  <b>{hints.get(t.problemKey)?.label ?? t.headline}</b>
                  {hints.get(t.problemKey)?.hint && <span>{hints.get(t.problemKey)!.hint}</span>}
                </span>
                <div className={s.row}>
                  <Chip pressed={false} disabled={busy} onClick={() => void send({ [`problem.${t.problemKey}`]: "yes" })}>
                    Yes
                  </Chip>
                  <Chip pressed={false} disabled={busy} onClick={() => void send({ [`problem.${t.problemKey}`]: "no" })}>
                    No
                  </Chip>
                </div>
              </div>
            ))}
            {extra.map((x) => (
              <div className={s.checkRow} key={x.id}>
                <span className={s.optionText}>
                  <b>{x.text}</b>
                  <span>{x.why}</span>
                </span>
                <ChoiceQuestion q={x} value={answers[x.id]} onChange={(v) => void send({ [x.id]: v })} />
              </div>
            ))}
          </section>
        )}

        {result.alsoNoticed.length > 0 && (
          <section className={s.col} style={{ gap: 8 }}>
            <h2 className={s.h3}>Also noticed</h2>
            <ul className={s.todo}>
              {result.alsoNoticed.map((a) => (
                <li key={a.problemKey}>
                  {a.headline} <span className={s.small}>· {a.statusLabel}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className={s.grid2}>
          <section className={s.card}>
            <div className={s.cardTop}>
              <h2 className={s.h3}>Anything else?</h2>
            </div>
            <form
              className={s.col}
              style={{ gap: 10 }}
              onSubmit={(e) => {
                e.preventDefault();
                void send({ anything_else: elseText.trim() || null });
              }}
            >
              <label htmlFor="else" className={s.sub}>
                Something else slowing you down?
              </label>
              <div className={s.inlineForm}>
                <input id="else" className={s.input} value={elseText} onChange={(e) => setElseText(e.target.value)} placeholder="e.g. chasing unpaid invoices" maxLength={300} />
                <button type="submit" className={cx(s.btn, s.secondary)} disabled={busy || !elseText.trim()}>
                  Add
                </button>
              </div>
            </form>
            {dealQ && (
              <>
                <span className={s.sub}>{dealQ.text}</span>
                <ChoiceQuestion q={dealQ} value={answers.deal_breakers} onChange={(v) => void send({ deal_breakers: v })} />
              </>
            )}
          </section>
          <section className={s.card}>
            <div className={s.cardTop}>
              <h2 className={s.h3}>Your answers</h2>
            </div>
            {result.youToldUs.length === 0 && result.assumptions.length === 0 && <p className={s.small}>Nothing yet.</p>}
            <ul className={s.todo}>
              {result.youToldUs.map((y) => (
                <li key={y.questionId}>
                  {y.label}: <b>{y.value}</b>
                </li>
              ))}
              {result.assumptions.map((a) => (
                <li key={a.questionId} className={s.small}>
                  We assumed: {a.text}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={s.link}
              style={{ justifySelf: "start", paddingLeft: 0 }}
              onClick={() => {
                setQIndex(0);
                go("ask");
              }}
            >
              Change your answers
            </button>
          </section>
        </div>

        <div className={cx(s.actionBar, s.sticky)}>
          <span className={s.small}>
            {result.recommendation.ready ? `Next: checked tools for ${toolCount === 1 ? "one of these" : `${toolCount} of these`}, within your budget.` : result.recommendation.reason}
          </span>
          {errorBox}
          <button type="button" className={cx(s.btn, s.primary)} onClick={() => void showTools()} disabled={busy || !result.recommendation.ready}>
            {busy ? "One moment…" : "Show me tools for these →"}
          </button>
        </div>
      </>,
    );
  }

  // ---------- 5 · Ways to fix it · 6 · Tool detail · 7 · Compare ----------
  const req = result?.recommendation.ready ? result.recommendation.request.business : null;
  const biz: Biz | null = req
    ? { monthlyBudget: req.monthlyBudget, currentTools: req.currentTools, needsHelp: req.needsHelp, budgetAssumed: result?.budget.assumed, help: result?.localHelp }
    : null;
  const choices = new Map((recs?.problems ?? []).flatMap((p) => p.options.flatMap((o) => o.choices)).map((c) => [c.tool.id, c] as const));
  const togglePick = (id: string) => setPicks((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-3)));
  const openTool = (id: string) => { setCameFrom(screen === "tool" ? cameFrom : screen); setToolId(id); go("tool"); };
  const openCompare = () => { setCameFrom(screen === "compare" ? cameFrom : screen); go("compare"); };
  const backLink = (label: string, to: Screen) => (
    <button type="button" className={s.link} style={{ justifySelf: "start", paddingLeft: 0 }} onClick={() => go(to)}>‹ {label}</button>
  );

  if (screen === "tool") {
    const r = catalog.find((x) => x.id === toolId);
    return frame(
      <>
        {backLink(cameFrom === "compare" ? "Back to compare" : "Ways to fix it", cameFrom === "compare" ? "compare" : "tools")}
        {banner}
        {r ? (
          <ToolDetail r={r} choice={choices.get(r.id)} biz={biz} picked={picks.includes(r.id)} togglePick={() => togglePick(r.id)} openCompare={openCompare} canCompare={picks.length >= 2} />
        ) : (
          <p className={s.notice}>We couldn't find this tool in our catalog.</p>
        )}
      </>,
    );
  }

  if (screen === "compare") {
    const rs = picks.map((id) => catalog.find((x) => x.id === id)).filter((x): x is CatalogRecord => Boolean(x));
    return frame(
      <>
        {backLink("Ways to fix it", "tools")}
        {banner}
        {rs.length >= 2 ? <Compare rs={rs} choices={choices} biz={biz} openTool={openTool} /> : <p className={s.notice}>Pick at least 2 tools with "+ Compare" to see them side by side.</p>}
      </>,
    );
  }

  return frame(
    <>
      <Steps n={5} />
      {banner}
      {recs && biz ? (
        <WaysToFix recs={recs} biz={biz} catalog={catalog} picks={picks} togglePick={togglePick} openTool={openTool} openCompare={openCompare} back={() => go("problems")} />
      ) : (
        <p className={s.notice}>We need a little more about your business before we can suggest tools.</p>
      )}
    </>,
  );
}
