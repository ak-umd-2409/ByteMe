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
  type SavedBusiness,
} from "@/lib/client/parts23.ts";
import type { BusinessMatch } from "@/lib/business/types.ts";
import type { RecommendationResult } from "@/lib/recommend/types.ts";
import type { CatalogRecord } from "@/lib/catalog/types.ts";
import s from "./start.module.css";
import { PlanScreen } from "./PlanScreen.tsx";
import { AdvisorPanel } from "../advisor/AdvisorPanel.tsx";
import { SiteHeader, siteStyles as site } from "../ui/Site.tsx";
import { saveResults } from "../advisor/saved.ts";
import { Compare, ToolDetail, WaysToFix, type Biz, type Chosen } from "./ToolScreens.tsx";
import { ChallengeStep, FindingsView } from "./Findings.tsx";
import type { Finding } from "@/lib/journey/types.ts";

export interface LookupEntry {
  name: string;
  domain: string;
  status: "verified" | "listed" | "blocked";
  checked: string | null;
  sample: boolean;
  id?: string;
}

type Screen = "landing" | "find" | "loading" | "check" | "ask" | "problems" | "tools" | "tool" | "compare" | "plan";
type Answers = Record<string, Answer>;

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");
const message = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The questions asked one at a time, in this order (only those the backend asks for this business). */
/** Listen first ("challenges"), then only what tools need. "problems" and "goals" are no longer asked. */
const ASK_ORDER = ["challenges", "call_recording", "health_data", "budget", "setup"];

const STEPS = ["Find", "Check", "Questions", "Results", "Tools", "Plan"];

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

/** Tick software from the list, or type in any other (shown as its own ticked chip). */
function ToolsPicker({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const listed = options.filter((o) => o !== "none");
  const custom = value.filter((v) => v !== "none" && !listed.includes(v));
  const toggle = (name: string) => {
    if (name === "none") return onChange(value.includes("none") ? [] : ["none"]);
    const rest = value.filter((x) => x !== "none");
    onChange(rest.includes(name) ? rest.filter((x) => x !== name) : [...rest, name]);
  };
  const add = () => {
    const name = draft.trim().slice(0, 40);
    if (!name) return;
    if (!value.some((v) => v.toLowerCase() === name.toLowerCase())) onChange([...value.filter((x) => x !== "none"), name]);
    setDraft("");
  };
  return (
    <div className={s.col} style={{ gap: 10 }}>
      <div className={s.row}>
        {[...listed, ...custom].map((name) => (
          <Chip key={name} pressed={value.includes(name)} onClick={() => toggle(name)}>
            {name}
          </Chip>
        ))}
        <Chip pressed={value.includes("none")} onClick={() => toggle("none")}>
          None of these
        </Chip>
      </div>
      <form
        className={s.inlineForm}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label htmlFor="add-tool" className={s.sr}>
          Add another tool
        </label>
        <input id="add-tool" className={s.input} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add another, e.g. Housecall Pro" maxLength={40} />
        <button type="submit" className={cx(s.btn, s.secondary)} disabled={!draft.trim()}>
          + Add
        </button>
      </form>
    </div>
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

/** How the owner arrived: from the homepage's name box, the "see a real example" link, or straight in. */
export type JourneyEntry = { screen?: "landing" | "find"; query?: string; town?: string; example?: boolean };

export function Journey({ lookup, catalog, watchCount = 0, entry }: { lookup: LookupEntry[]; catalog: CatalogRecord[]; watchCount?: number; entry?: JourneyEntry }) {
  const [screen, setScreen] = useState<Screen>(entry?.screen === "find" || entry?.query ? "find" : "landing");
  const [error, setError] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);

  // Find
  const [name, setName] = useState("");
  const [town, setTown] = useState("");
  const [matches, setMatches] = useState<BusinessMatch[] | null>(null);
  // When live Google search is off, the API says so and lists the real businesses we saved.
  const [searchInfo, setSearchInfo] = useState<{ liveSearch: boolean; saved: SavedBusiness[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [manual, setManual] = useState(false);
  const [manualSite, setManualSite] = useState("");
  const [pasted, setPasted] = useState("");
  const lastRead = useRef<{ placeId: string; label: string } | { manual: true } | null>(null);
  const [readingName, setReadingName] = useState("");

  // Journey
  const [start, setStart] = useState<JourneyStartResponse | null>(null);
  const [result, setResult] = useState<JourneyAnswerResponse | null>(null);
  // Keep the latest results in this tab so the Business Advisor page can answer about them.
  useEffect(() => {
    if (!result) return;
    saveResults({
      context: result.context,
      business: result.business.name,
      industry: result.recommendation.ready ? result.recommendation.request.business.industry.toLowerCase() : null,
      firstProblem: result.opportunities[0]?.headline ?? null,
      problems: result.opportunities.map((o) => o.headline),
      budget: result.budget?.value ?? null,
    });
  }, [result]);
  const [context, setContext] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  // Read by delayed callbacks (auto-advance), so they always see the latest answers.
  /** Which problems the owner wants tools for (Part 4 problem ids). Starts with all of them. */
  const [toolPick, setToolPick] = useState<Set<string> | null>(null);
  const [draftLen, setDraftLen] = useState(0);
  /** Tools the owner chose on the tools screen (problem id → tool id), carried into the plan. */
  const [chosen, setChosen] = useState<Chosen>({});
  const draftRef = useRef("");
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
  const [toolResult, setToolResult] = useState<{ text: string; tone: "ok" | "bad" | "info"; toolId?: string } | null>(null);
  const [toolChecking, setToolChecking] = useState(false);

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
    go(entry?.screen === "find" ? "find" : "landing");
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

  // Arriving from the homepage: search the name they typed, or open the saved real example.
  const entered = useRef(false);
  useEffect(() => {
    if (entered.current || !entry) return;
    entered.current = true;
    if (entry.example) void read({ placeId: "public-frederick-heating-ac", label: "Frederick Heating & Air Conditioning" });
    else if (entry.query) {
      setName(entry.query);
      if (entry.town) setTown(entry.town);
      void searchFor(entry.query, entry.town ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- actions ----------

  const search = async () => searchFor(name, town);
  const searchFor = async (n: string, t: string) => {
    if (!n.trim()) return setError("Type your business name first.");
    setSearching(true);
    setError(null);
    setManual(false);
    try {
      const res = await api.search(n.trim(), t.trim() || undefined);
      setMatches(res.matches.slice(0, 3));
      setSearchInfo({ liveSearch: res.liveSearch, saved: res.saved ?? [] });
    } catch (e) {
      setError(message(e));
    } finally {
      setSearching(false);
    }
  };

  /** Read a business: a search result (placeId) or one typed in by hand. */
  const read = async (target: { placeId: string; label: string } | { manual: true }) => {
    lastRead.current = target;
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
    for (const [k, v] of Object.entries(now)) if (ids.has(k) || k.startsWith("edit.") || k === "challenge_picks") patch[k] = v;
    if (!("challenge_picks" in now)) patch.challenge_picks = null;
    // Questions the owner skipped are cleared, so the server records them as skipped.
    for (const id of ASK_ORDER) if (ids.has(id) && !(id in now)) patch[id] = null;
    const res = await send(patch, context ?? start.context);
    if (res) go("problems");
  };

  const showTools = async () => {
    if (!result?.recommendation.ready) return;
    const request = result.recommendation.request;
    const chosen = toolPick ? request.problems.filter((p) => toolPick.has(p.id)) : request.problems;
    if (!chosen.length) return setError("Tick at least one problem to find tools for.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/recommend", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...request, problems: chosen }) });
      const body = await res.json();
      if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : "We couldn't load tools right now.");
      setRecs(body as RecommendationResult);
      setChosen({});
      go("tools");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Looks the link up in the catalog; anything new is added to the discovery queue (spec 1.1, 4.11). */
  const checkTool = async () => {
    setToolChecking(true);
    setToolResult(null);
    try {
      const res = await fetch("/api/discovery/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: toolUrl.trim(), source: "owner_check" }) });
      const body = await res.json();
      if (!res.ok) return setToolResult({ text: body?.error?.message ?? "We couldn't check that link right now.", tone: "bad" });
      const hit = body.kind === "in_catalog" ? lookup.find((e) => e.id === body.toolId) : undefined;
      const tone = body.kind === "blocked" || body.badge === "blocked" || body.status === "blocked" ? "bad" : body.badge === "verified" ? "ok" : "info";
      const extra = hit ? `${hit.checked ? ` Last checked ${hit.checked}.` : ""}${hit.sample ? " (Sample entry.)" : ""}` : "";
      setToolResult({ text: `${body.message}${extra}`, tone, toolId: body.kind === "in_catalog" ? body.toolId : undefined });
    } catch {
      setToolResult({ text: "We couldn't check that link right now. Please try again.", tone: "bad" });
    } finally {
      setToolChecking(false);
    }
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
      <SiteHeader
        right={
          screen === "landing" || screen === "find" ? undefined : (
            <button
              type="button"
              className={site.quiet}
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
          )
        }
      />
      <main className={cx(s.page, opts.narrow && s.narrow)} key={screen === "ask" ? `ask-${qIndex}` : screen}>
        {children}
      </main>
      {screen !== "loading" && (
        <AdvisorPanel
          floating
          raised={screen === "problems" || screen === "tools"}
          context={result?.context ?? null}
          known={
            result
              ? { business: result.business.name, industry: result.recommendation.ready ? result.recommendation.request.business.industry.toLowerCase() : null, firstProblem: result.opportunities[0]?.headline ?? null, budget: result.budget?.value ?? null }
              : { industry: null }
          }
        />
      )}
    </div>
  );

  // ---------- 1 · Landing ----------
  if (screen === "landing") {
    // Only real tools count. Sample (made-up) tools never inflate the numbers.
    const real = lookup.filter((e) => !e.sample);
    const counts = { verified: real.filter((e) => e.status === "verified").length, blocked: real.filter((e) => e.status === "blocked").length };
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
              <a className={s.link} href="/tools">Browse all checked tools</a>
            </div>
            <span className={s.small}>Free · about 3 minutes · no sign-up</span>
            <div className={s.stats}>
              {counts.verified > 0 ? (
                <div><b className={s.num}>{counts.verified}</b><span>real tools checked and approved</span></div>
              ) : (
                <div><b className={s.num}>{watchCount}</b><span>real AI tools on our watch list</span></div>
              )}
              {counts.blocked > 0 ? (
                <div><b className={s.num}>{counts.blocked}</b><span>unsafe tools blocked</span></div>
              ) : (
                <div><b className={s.num}>0</b><span>tools recommended before a person checks them</span></div>
              )}
              <div><b className={s.num}>8</b><span>safety checks on every tool</span></div>
            </div>
          </div>

          <div className={s.preview} aria-label="Example of what you'll see">
            <span className={s.previewTag}>Example of a result · sample tools, not real products</span>
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
          <p className={s.small}>
            Then a person reviews it. Tools that copy a brand name or have no privacy policy are blocked automatically. Make AI tools? <a href="/submit">Apply to be listed</a>.
          </p>
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
              <button type="button" className={cx(s.btn, s.secondary)} onClick={() => void checkTool()} disabled={!toolUrl.trim() || toolChecking}>
                {toolChecking ? "Checking…" : "Check this tool"}
              </button>
            </div>
            {toolResult && (
              <p className={toolResult.tone === "bad" ? s.error : toolResult.tone === "ok" ? s.okNote : s.notice} aria-live="polite">
                {toolResult.text}
                {toolResult.toolId && (
                  <>
                    {" "}
                    <a href={`/tools/${toolResult.toolId}`}>See what we checked</a>
                  </>
                )}
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
            {searchInfo && !searchInfo.liveSearch && (
              <div className={s.notice}>
                Live search is off in this demo, so we can only find businesses we saved from public pages. We never swap in a different one.
              </div>
            )}
            <h2 className={s.h3}>
              {matches.length ? "Is it one of these? Tap yours." : searchInfo && !searchInfo.liveSearch ? `“${name.trim()}” isn't one of our saved businesses.` : `We couldn't find “${name.trim()}”.`}
            </h2>
            {matches.map((m) => (
              <button key={m.placeId} type="button" className={s.resultRow} onClick={() => void read({ placeId: m.placeId, label: m.name })}>
                <span className={s.resultText}>
                  <b>{m.name}</b>
                  <span>{[m.address, m.rating !== null ? `★ ${m.rating}${m.reviewCount !== null ? ` (${m.reviewCount} reviews)` : ""}` : null].filter(Boolean).join(" · ")}</span>
                </span>
                <span className={s.resultGo}>This is me →</span>
              </button>
            ))}
            {matches.length === 0 && searchInfo && !searchInfo.liveSearch && searchInfo.saved.length > 0 && (
              <>
                <span className={s.sub}>Try a saved real Maryland business instead:</span>
                {searchInfo.saved.map((b) => (
                  <button key={b.placeId} type="button" className={s.resultRow} onClick={() => void read({ placeId: b.placeId, label: b.name })}>
                    <span className={s.resultText}>
                      <b>{b.name}</b>
                      <span>
                        {b.address} · saved from public pages on {new Date(`${b.capturedAt.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
                      </span>
                    </span>
                    <span className={s.resultGo}>Use this →</span>
                  </button>
                ))}
              </>
            )}
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
  /** Whether the owner's challenges involve the phone (so the call-recording question applies). */
  const phoneChallenge = () => {
    const text = typeof answers.challenges === "string" ? answers.challenges : "";
    const picked = Array.isArray(answers.challenge_picks) ? (answers.challenge_picks as string[]) : [];
    const sugg = q("challenges")?.suggestions ?? [];
    return /\b(calls?|phones?|voicemail|answer(ing)? the phone)\b/i.test(text) || picked.some((id) => sugg.find((x) => x.id === id)?.useCase === "missed-calls");
  };

  // ---------- 2 · Check what we found ----------
  if (screen === "check") {
    const listingQ = start.questions.find((x) => x.id.startsWith("listing."));
    const toolsQ = q("tools");
    const b = start.business;
    // Most details share one source; name it once instead of on every row.
    const sourceCounts = new Map<string, number>();
    for (const f of b.facts) if (f.id !== "name" && f.source) sourceCounts.set(f.source, (sourceCounts.get(f.source) ?? 0) + 1);
    const commonSource = [...sourceCounts].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
    return frame(
      <>
        <Steps n={2} />
        {banner}
        <header className={s.intro}>
          <h1 className={s.title}>Here's what we found</h1>
          <p className={s.lead}>Check the details. Fix anything that's wrong, then we'll ask a few quick questions.</p>
        </header>
        {start.couldNotCheck.length > 0 && (
          <div className={s.notice}>
            <b>What we couldn't check</b>
            <ul className={s.todo} style={{ marginTop: 6 }}>
              {start.couldNotCheck.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}

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
                const source = typeof edited === "string" ? "You told us" : f.source === commonSource ? null : f.source;
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
          {commonSource && <p className={s.small}>Details from {commonSource.replace(/^from /i, "").toLowerCase().replace(/\bgoogle\b/, "Google")} unless marked.</p>}
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
          {start.customersSay.themes.length === 0 && (
            <p className={s.small}>
              {start.customersSay.reviewCount > 0
                ? `We read ${plural(start.customersSay.reviewCount, "review")}; none pointed to a clear pattern yet.`
                : "We didn't find reviews to read."}
            </p>
          )}
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
          <details className={s.disc}>
            <summary>{start.customersSay.reviewCount < 5 ? "Add reviews you have" : "Add more reviews"} <span className={s.opt}>(paste or upload)</span></summary>
            <div className={s.discBody}>
              <span className={s.small}>
                Copy reviews from Google, Yelp, Facebook or anywhere else, one per paragraph, or upload a .txt or .csv file. We read them alongside the others and count each review once.
              </span>
              <label htmlFor="more-reviews" className={s.sr}>
                Reviews to add
              </label>
              <textarea id="more-reviews" className={s.textarea} value={pasted} onChange={(e) => setPasted(e.target.value)} maxLength={20000} rows={5} />
              <div className={s.row}>
                <label className={cx(s.btn, s.secondary)} style={{ cursor: "pointer" }}>
                  Upload a file
                  <input
                    type="file"
                    accept=".txt,.csv,text/plain,text/csv"
                    className={s.sr}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 200_000) return setError("That file is too big. Keep it under 200 KB.");
                      const text = await file.text();
                      setPasted((p) => `${p.trim() ? `${p.trim()}\n\n` : ""}${text}`.slice(0, 20000));
                    }}
                  />
                </label>
                <button type="button" className={cx(s.btn, s.primary)} disabled={!pasted.trim() || !lastRead.current} onClick={() => lastRead.current && void read(lastRead.current)}>
                  Read these reviews
                </button>
              </div>
            </div>
          </details>
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
              <span className={s.sub}>What software do you already use?</span>
              <span className={s.small}>Tick yours, or add any we missed. Tools that work with these are easier to set up.</span>
              <ToolsPicker
                options={(toolsQ.options ?? []).map((o) => o.value)}
                value={Array.isArray(answers.tools) ? (answers.tools as string[]) : []}
                onChange={(v) => setAnswer("tools", v.length ? v : null)}
              />
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
    const visibleNow = (x: JourneyQuestion) => journey.visible(x, answers) || (x.id === "call_recording" && phoneChallenge());
    const flow = ASK_ORDER.map((id) => q(id)).filter((x): x is JourneyQuestion => Boolean(x) && visibleNow(x!));
    const i = Math.min(qIndex, Math.max(flow.length - 1, 0));
    const current = flow[i];
    const last = i >= flow.length - 1;
    const next = () => {
      // Words still in the box count as added when the owner moves on.
      if (current?.id === "challenges" && draftRef.current.trim()) {
        const before = typeof answers.challenges === "string" ? answers.challenges : "";
        const merged = [before, draftRef.current.trim()].filter(Boolean).join("\n");
        setAnswer("challenges", merged);
        answersRef.current = { ...answersRef.current, challenges: merged };
        draftRef.current = "";
      }
      if (last) void finishQuestions();
      else setQIndex(i + 1);
    };
    const value = current ? answers[current.id] : undefined;
    const draftTyped = draftLen > 0;
    const picks = Array.isArray(answers.challenge_picks) ? (answers.challenge_picks as string[]) : [];
    const hasValue =
      current?.id === "challenges"
        ? (typeof value === "string" && value.trim().length > 0) || picks.length > 0 || draftTyped
        : Array.isArray(value)
          ? value.length > 0
          : value !== undefined && value !== null;
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

        {current.id === "challenges" ? (
          <ChallengeStep
            business={start.business.name}
            placeholder={current.placeholder}
            suggestions={current.suggestions ?? []}
            text={typeof value === "string" ? value : ""}
            picks={picks}
            onText={(t) => setAnswer("challenges", t.trim() ? t : null)}
            onPicks={(ids) => setAnswer("challenge_picks", ids.length ? ids : null)}
            onDraft={(d) => {
              draftRef.current = d;
              setDraftLen(d.trim().length);
            }}
          />
        ) : (
          <OptionList
            q={current}
            value={value}
            onPick={(v, done) => {
              setAnswer(current.id, v);
              if (done) setTimeout(next, 220);
            }}
          />
        )}
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
                if (current.id === "challenges") setAnswer("challenge_picks", null);
                next();
              }}
              title={current.ifSkipped}
            >
              Skip
            </button>
            {(current.kind === "multi" || current.kind === "text" || (last && hasValue)) && (
              <button type="button" className={cx(s.btn, s.primary)} onClick={next} disabled={busy || ((current.kind === "multi" || current.kind === "text") && !hasValue)}>
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
      const list = [...result.findings.yours, ...result.findings.noticed].filter((o) => o.impact?.kind === kind).map((o) => o.impact!.monthly);
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
    const allTools = result.recommendation.ready ? result.recommendation.request.problems.map((p) => p.id) : [];
    // Everything starts ticked; ids that no longer exist (after new answers) drop out.
    const picked = new Set(toolPick ? allTools.filter((id) => toolPick.has(id)) : allTools);
    const toolCount = picked.size;

    return frame(
      <>
        <Steps n={4} />
        {banner}
        <header className={s.intro}>
          <h1 className={s.title}>What we found at {start.business.name}</h1>
          <p className={s.lead}>
            {result.headline}
            {revenue && (
              <>
                {" "}
                Together they might be worth about <b className={s.num}>{usd(revenue.expected)} a month</b>{" "}
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
          </p>
          {(revenue || time) && <span className={s.small}>Estimated opportunity, not proven lost revenue. Only where you gave us the numbers.</span>}
        </header>

        {result.recommendation.ready && <p className={s.small}>Tick the problems you want tools for. The rest stay in your plan with a free first step.</p>}
        <FindingsView
          findings={result.findings}
          industry={start.business.subtitle.split(" · ")[0] ?? "similar"}
          onOpen={(f, el) => {
            seeMoreBtn.current = el;
            setOpenOpp(f.id);
          }}
          selected={picked}
          onToggle={(id) =>
            setToolPick(() => {
              const next = new Set(picked);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
        />

        <form
          className={cx(s.card, s.addMore)}
          onSubmit={(e) => {
            e.preventDefault();
            const before = typeof answers.challenges === "string" ? answers.challenges.trim() : "";
            const added = elseText.trim();
            if (!added) return;
            void send({ challenges: before ? `${before}\n${added}` : added }).then(() => setElseText(""));
          }}
        >
          <label htmlFor="add-challenge" className={s.sub}>
            {result.findings.yours.length ? "Anything else taking your time?" : "What's taking up too much of your time?"}
          </label>
          <div className={s.inlineForm}>
            <input id="add-challenge" className={s.input} value={elseText} onChange={(e) => setElseText(e.target.value)} placeholder="e.g. chasing unpaid invoices" maxLength={300} />
            <button type="submit" className={cx(s.btn, s.secondary)} disabled={busy || !elseText.trim()}>
              {busy ? "Adding…" : "Add"}
            </button>
          </div>
        </form>

        {(() => {
          const all = [...result.findings.yours, ...result.findings.noticed, ...result.findings.consider];
          const f: Finding | undefined = all.find((x) => x.id === openOpp);
          if (!f) return null;
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
                    <span className={s.small}>{f.confidence.label}</span>
                    <h2 className={s.h2} id="opp-title">
                      {f.title}
                    </h2>
                  </div>
                  <button type="button" className={cx(s.btn, s.secondary, s.closeBtn)} onClick={() => setOpenOpp(null)} autoFocus>
                    Close ✕
                  </button>
                </div>
                <div className={s.dialogBody}>
                  {f.ownerWords.length > 0 && <p className={s.ownerWords}>You said: “{f.ownerWords.join("” · “")}”</p>}
                  <p>{f.whatsHappening}</p>
                  {f.whyItMatters && !f.whatsHappening.includes(f.whyItMatters) && <p className={s.small}>{f.whyItMatters}</p>}
                  {f.connection && <p className={s.connection}>{f.connection}</p>}
                  <div className={s.col} style={{ gap: 10 }}>
                    <h3 className={s.h3}>Evidence</h3>
                    {f.evidence.length ? (
                      <ul className={s.evid}>
                        {f.evidence.map((e, k) => (
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
                      </ul>
                    ) : (
                      <p className={s.small}>
                        {f.group === "yours"
                          ? "This comes from you. We couldn't see it in your reviews, website or listings, which is normal for things that happen behind the scenes."
                          : f.group === "consider"
                            ? "No direct evidence for your business. It's common for businesses like yours."
                            : "No details to show."}
                      </p>
                    )}
                    {f.moreEvidence > 0 && <span className={s.small}>And {f.moreEvidence} more.</span>}
                  </div>
                  {f.impact ? (
                    <div className={s.calc}>
                      <p className={s.money}>
                        <span className={s.small}>{f.impact.kind === "time_cost" ? "Your time: about" : "Might be worth about"}</span>{" "}
                        <b className={s.num}>{usd(f.impact.monthly.expected)} a month</b>
                      </p>
                      <span className={s.sub}>How we got the number</span>
                      <p className={s.small}>{f.impact.math}</p>
                      {f.impact.assumed.length > 0 && (
                        <span className={s.hint}>
                          Our assumption:{" "}
                          {f.impact.assumed
                            .map((a) => `${a.label.toLowerCase()} ${a.unit === "percent" ? `${Math.round(a.value * 100)}%` : a.unit === "usd" || a.unit === "usd_per_hour" ? usd(a.value) : a.value}`)
                            .join("; ")}
                          .
                        </span>
                      )}
                    </div>
                  ) : f.impactNeeds.length ? (
                    <form
                      className={cx(s.calc, s.calcBox)}
                      onSubmit={(e) => {
                        e.preventDefault();
                        const patch: Answers = {};
                        for (const id of f.impactNeeds) {
                          const raw = numbers[id]?.replace(/[$,\s]/g, "");
                          if (raw) patch[id] = Number(raw);
                        }
                        if (Object.keys(patch).length) void send(patch);
                      }}
                    >
                      <span className={s.sub}>What might this be worth? (optional)</span>
                      {f.impactNeeds.map((id) => {
                        const fq = followUp(id);
                        if (!fq) return null;
                        return (
                          <div className={s.field} key={id}>
                            <label htmlFor={`${f.id}-${id}`}>{fq.text}</label>
                            <input
                              id={`${f.id}-${id}`}
                              className={s.input}
                              inputMode="decimal"
                              placeholder={fq.placeholder}
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
                    f.impactNote && <p className={s.small}>{f.impactNote}</p>
                  )}
                  {f.whatToDo && (
                    <p className={s.firstStep}>
                      <b>What to do:</b> {f.whatToDo}
                    </p>
                  )}
                  {f.ai && (
                    <p className={s.aiLine}>
                      <b>{f.ai.level === "yes" ? "AI can help." : f.ai.level === "partly" ? "AI can partly help." : "No AI needed."}</b> {f.ai.how}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* The yes/no problem list is replaced by "Worth considering"; only the tool questions that now apply remain. */}
        {extra.length > 0 && (
          <section className={s.card}>
            <div className={s.cardTop}>
              <h2 className={s.h3}>A quick question for picking tools</h2>
              <span className={s.small}>So we only suggest tools that fit how you work.</span>
            </div>

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

        <div className={s.grid2}>
          {dealQ && <details className={s.disc}>
            <summary>Anything a tool must have?</summary>
            <div className={s.discBody}>
              <span className={s.sub}>{dealQ.text}</span>
              <ChoiceQuestion q={dealQ} value={answers.deal_breakers} onChange={(v) => void send({ deal_breakers: v })} />
            </div>
          </details>}
          <details className={s.disc}>
            <summary>
              Your answers{result.assumptions.length > 0 ? ` and ${plural(result.assumptions.length, "assumption")}` : ""}
            </summary>
            <div className={s.discBody}>
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
            </div>
          </details>
        </div>

        <div className={cx(s.actionBar, s.sticky)}>
          <span className={s.small}>
            {result.recommendation.ready
              ? toolCount
                ? `Next: checked tools for the ${toolCount === 1 ? "problem" : `${toolCount} problems`} you ticked, within your budget.`
                : "Tick a problem to find tools for it, or go straight to your plan."
              : result.recommendation.reason}
          </span>
          {errorBox}
          {result.recommendation.ready && toolCount > 0 ? (
            <button type="button" className={cx(s.btn, s.primary)} onClick={() => void showTools()} disabled={busy}>
              {busy ? "One moment…" : `Find tools (${toolCount}) →`}
            </button>
          ) : (
            <button type="button" className={cx(s.btn, s.primary)} onClick={() => go("plan")} disabled={busy || (opps.length === 0 && result.findings.yours.length + result.findings.noticed.length === 0)}>
              Make my plan →
            </button>
          )}
        </div>
      </>,
    );
  }

  // ---------- 5 · Ways to fix it · 6 · Tool detail · 7 · Compare ----------
  const req = result?.recommendation.ready ? result.recommendation.request.business : null;
  const biz: Biz | null = req
    ? { monthlyBudget: req.monthlyBudget, currentTools: req.currentTools, needsHelp: req.needsHelp, budgetAssumed: result?.budget.assumed, help: result?.localHelp }
    : null;
  const choices = new Map([
    ...(recs?.starterKits ?? []).flatMap((kit) => kit.choices),
    ...(recs?.problems ?? []).flatMap((p) => p.options.flatMap((o) => o.choices)),
  ].map((c) => [c.tool.id, c] as const));
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

  // ---------- 6 · Your plan ----------
  if (screen === "plan")
    return frame(
      <>
        <Steps n={6} />
        {banner}
        <PlanScreen answer={result} recs={recs} catalog={catalog} currentTools={req?.currentTools ?? []} needsHelp={req?.needsHelp ?? answers.setup === "help"} chosenTools={chosen} back={() => go(recs ? "tools" : "problems")} />
      </>,
      { narrow: true },
    );

  return frame(
    <>
      <Steps n={5} />
      {banner}
      {recs && biz ? (
        <WaysToFix recs={recs} biz={biz} catalog={catalog} picks={picks} togglePick={togglePick} openTool={openTool} openCompare={openCompare} back={() => go("problems")} chosen={chosen} onChosen={setChosen} />
      ) : (
        <p className={s.notice}>We need a little more about your business before we can suggest tools.</p>
      )}
      <div className={cx(s.actionBar, s.sticky)}>
        <span className={s.small}>
          {Object.keys(chosen).length
            ? `${Object.keys(chosen).length} ${Object.keys(chosen).length === 1 ? "tool" : "tools"} chosen: ${Object.values(chosen).map((id) => catalog.find((r) => r.id === id)?.name ?? id).join(", ")}.`
            : "Choose a kit or a tool for any problem, or skip straight to your plan with free first steps."}
        </span>
        <button type="button" className={cx(s.btn, s.primary)} onClick={() => go("plan")}>
          {Object.keys(chosen).length ? `Make my plan with ${Object.keys(chosen).length} ${Object.keys(chosen).length === 1 ? "tool" : "tools"} →` : "Make my plan →"}
        </button>
      </div>
    </>,
  );
}
