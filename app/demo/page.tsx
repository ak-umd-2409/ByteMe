"use client";

/**
 * MainStreet AI — Parts 2 & 3 demo, wired to the real API.
 *   Find → Check → Problems → Tools (Part 4's /api/recommend)
 * Runs without API keys on real Maryland businesses captured from public pages (data/real).
 */
import { useRef, useState } from "react";
import { ListingsMatrix, OpportunityChart, StrengthBars } from "@/components/parts23/charts.tsx";
import { FactField, SourceChip } from "@/components/parts23/primitives.tsx";
import { ProblemCardView } from "@/components/parts23/ProblemCardView.tsx";
import ui from "@/components/parts23/parts23.module.css";
import type { ProfileCorrections } from "@/lib/business/profile.ts";
import type { BusinessMatch, Fact, Goal } from "@/lib/business/types.ts";
import {
  api,
  ApiError,
  fmt,
  type DiscoveryResult,
  type OnboardingAnalysis,
  type OnboardingProfile,
  type ProblemKey,
  type RecommendationInputResult,
} from "@/lib/client/parts23.ts";
import type { RecommendationResult } from "@/lib/recommend/types.ts";
import s from "./demo.module.css";

type Step = "find" | "reading" | "check" | "problems" | "tools";
const STEP_LABEL: Record<Step, string> = {
  find: "Step 1 of 4: Find your business",
  reading: "Step 1 of 4: Reading",
  check: "Step 2 of 4: Check the details",
  problems: "Step 3 of 4: What may be costing you",
  tools: "Step 4 of 4: Tools that fit",
};
const REAL = [
  { q: "Dave's Cooling & Heating", label: "Dave's Cooling & Heating", place: "Frederick, MD" },
  { q: "Frederick Heating & Air Conditioning", label: "Frederick Heating & Air Conditioning", place: "Jefferson, MD" },
];
const GOALS: { key: Goal; label: string }[] = [
  { key: "more_customers", label: "More customers" },
  { key: "save_time", label: "Save time" },
  { key: "better_reviews", label: "Better reviews" },
  { key: "get_paid_faster", label: "Get paid faster" },
];
const OPTION_LABEL: Record<string, string> = {
  "already-have": "Use what you have",
  "quick-fix": "Quick fix",
  "starter-kit": "Starter kit",
  "lowest-cost": "Lowest cost",
  alternative: "Another verified option",
  "done-for-you": "Done for you",
};

const ownerFact = <T,>(fact: Fact<T>, value: T): Fact<T> => ({ ...fact, value, source: "owner", confidence: "high", evidence: "You corrected this", needsOwnerInput: false });
const dateLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function DemoPage() {
  const [step, setStep] = useState<Step>("find");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const [q, setQ] = useState("");
  const [near, setNear] = useState("");
  const [matches, setMatches] = useState<BusinessMatch[] | null>(null);
  const [budget, setBudget] = useState("200");
  const [needsHelp, setNeedsHelp] = useState<boolean | null>(null);
  const [goals, setGoals] = useState<Goal[]>(["more_customers"]);

  const [analysis, setAnalysis] = useState<OnboardingAnalysis | null>(null);
  const [view, setView] = useState<OnboardingProfile | null>(null);
  const [corrections, setCorrections] = useState<ProfileCorrections>({});
  const [tools, setTools] = useState<string[]>([]);
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [recInput, setRecInput] = useState<RecommendationInputResult | null>(null);
  const [assumptions, setAssumptions] = useState<Partial<Record<ProblemKey, Record<string, number>>>>({});
  const [dirty, setDirty] = useState(false);
  const [dismissed, setDismissed] = useState<ProblemKey[]>([]);
  const [recs, setRecs] = useState<RecommendationResult | null>(null);

  async function run<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
    abort.current?.abort();
    abort.current = new AbortController();
    setBusy(true);
    setError(null);
    try {
      return await task(abort.current.signal);
    } catch (e) {
      if ((e as Error).name === "AbortError") return null;
      setError(e instanceof ApiError ? (e.status === 429 ? `Too many tries. Wait ${e.retryAfterSec ?? 30} seconds and try again.` : e.message) : "Something went wrong. Try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function search(query = q, town = near) {
    if (query.trim().length < 2) return setError("Type at least two letters of the business name.");
    const res = await run((signal) => api.search(query.trim(), town.trim() || undefined, signal));
    if (res) setMatches(res.matches);
  }

  async function analyze(placeId: string) {
    setStep("reading");
    const res = await run((signal) =>
      api.analyze(
        { placeId, owner: { monthlyBudget: Number(budget) || 0, goals, ...(needsHelp === null ? {} : { techComfort: needsHelp ? "needs_help" : "self_serve" }) } },
        signal,
      ),
    );
    if (!res) return setStep("find");
    setAnalysis(res);
    setView(res.profile);
    setCorrections({});
    setTools([]);
    setDismissed([]);
    setAssumptions({});
    setStep("check");
    window.scrollTo({ top: 0 });
  }

  function correct(key: "phone" | "website" | "category", value: string) {
    if (!view) return;
    setCorrections((c) => ({ ...c, business: { ...c.business, [key]: value } }));
    setView({ ...view, business: { ...view.business, [key]: ownerFact(view.business[key] as Fact<string>, value) } });
  }
  function chooseHours(display: string) {
    if (!view) return;
    setCorrections((c) => ({ ...c, business: { ...c.business, hours: [display] } }));
    setView({ ...view, business: { ...view.business, hours: ownerFact(view.business.hours, [display]) } });
  }

  async function discover(p: OnboardingProfile, a = assumptions) {
    if (!analysis) return false;
    const res = await run((signal) =>
      api.discover({ profile: p, reviews: analysis.reviews, website: analysis.website, listings: analysis.listings, assumptions: a }, signal),
    );
    if (!res) return false;
    setDiscovery(res.discovery);
    setRecInput(res.recommendationInput);
    setDirty(false);
    return true;
  }

  async function confirmProfile() {
    if (!analysis) return;
    const all: ProfileCorrections = { ...corrections, ...(tools.length ? { currentTools: tools } : {}) };
    const res = await run((signal) => api.confirm({ profile: analysis.profile, corrections: all }, signal));
    if (!res) return;
    setProfile(res.profile);
    if (await discover(res.profile)) {
      setStep("problems");
      window.scrollTo({ top: 0 });
    }
  }

  async function answer(key: ProblemKey, applies: boolean) {
    if (!applies || !profile) return setDismissed((d) => [...d, key]);
    // "Yes" is recorded as something the owner told us. It never becomes found evidence.
    const reported = [...(profile.owner.reportedProblems.value ?? []), key] as ProblemKey[];
    const res = await run((signal) => api.confirm({ profile, corrections: { owner: { reportedProblems: reported } } }, signal));
    if (!res) return;
    setProfile(res.profile);
    await discover(res.profile);
  }

  async function getTools() {
    if (!recInput?.ok) return;
    const res = await run(async (signal) => {
      const r = await fetch("/api/recommend", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(recInput.request), signal });
      if (!r.ok) throw new ApiError(r.status, null, null);
      return (await r.json()) as RecommendationResult;
    });
    if (res) {
      setRecs(res);
      setStep("tools");
      window.scrollTo({ top: 0 });
    }
  }

  function startOver() {
    abort.current?.abort();
    setStep("find");
    setMatches(null);
    setAnalysis(null);
    setDiscovery(null);
    setRecs(null);
    setError(null);
  }

  const industry = profile?.business.industry.value ?? analysis?.profile.business.industry.value ?? "other";
  const found = discovery?.problems.filter((p) => p.status !== "hypothesis") ?? [];
  const toCheck = discovery?.problems.filter((p) => p.status === "hypothesis" && !dismissed.includes(p.key)) ?? [];
  const snap = analysis?.snapshot ?? null;
  const sample = analysis?.mode.places === "mock" || matches?.some((m) => m.provider === "mock");
  const hoursField = analysis?.listings.fields.find((f) => f.field === "hours");

  return (
    <div className={`${ui.root} ${s.page}`}>
      <header className={s.top}>
        <button type="button" className={s.wordmark} onClick={startOver} aria-label="MainStreet AI, start over">
          <span className={s.mark} aria-hidden="true" />
          MainStreet AI
        </button>
        <span className={ui.tiny} aria-live="polite">
          {STEP_LABEL[step]}
        </span>
      </header>
      <div className={s.progress} aria-hidden="true">
        <span style={{ width: `${({ find: 12, reading: 20, check: 45, problems: 75, tools: 100 } as const)[step]}%` }} />
      </div>

      <main className={s.main}>
        {sample && <p className={s.notice}>This is a fictional sample business. Nothing here is real.</p>}
        {error && (
          <p className={s.errorBox} role="alert">
            {error}
          </p>
        )}

        {/* ================= Find ================= */}
        {step === "find" && (
          <>
            <section className={s.intro}>
              <h1 className={ui.display}>See what may be costing your business customers.</h1>
              <p className={s.lead}>We read your public listings, website and reviews. Every finding links to where we saw it, and every dollar figure shows its math.</p>
            </section>

            <section className={`${ui.panel} ${ui.pad}`}>
              <form
                className={s.searchRow}
                onSubmit={(e) => {
                  e.preventDefault();
                  void search();
                }}
              >
                <label className={ui.field}>
                  <span className={ui.label}>Business name</span>
                  <input className={ui.input} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="organization" />
                </label>
                <label className={ui.field}>
                  <span className={ui.label}>Town or ZIP</span>
                  <input className={ui.input} value={near} onChange={(e) => setNear(e.target.value)} placeholder="Optional" />
                </label>
                <button className={ui.btn} type="submit" disabled={busy}>
                  {busy ? "Searching" : "Find my business"}
                </button>
              </form>

              {matches && (
                <ul className={s.results} aria-live="polite">
                  {matches.length === 0 && <li className={ui.small}>No match. Check the spelling or try a nearby town.</li>}
                  {matches.map((m) => (
                    <li key={m.placeId}>
                      <button type="button" className={s.result} onClick={() => void analyze(m.placeId)}>
                        <span>
                          <strong>{m.name}</strong>
                          <span className={ui.small} style={{ display: "block" }}>
                            {m.address}
                          </span>
                        </span>
                        <span className={ui.tiny}>{m.provider === "public_snapshot" ? "Public data" : m.rating !== null ? `★ ${m.rating} (${m.reviewCount})` : ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className={s.tryReal}>
                <span className={ui.small}>Try a real Maryland business:</span>
                <div className={ui.row}>
                  {REAL.map((r) => (
                    <button
                      key={r.q}
                      type="button"
                      className={ui.chipBtn}
                      onClick={() => {
                        setQ(r.q);
                        setNear("");
                        void search(r.q, "");
                      }}
                    >
                      {r.label}, {r.place}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className={`${ui.panel} ${ui.pad} ${s.questions}`}>
              <h2 className={ui.h3}>Three quick questions</h2>
              <label className={ui.field} style={{ maxWidth: 220 }}>
                <span className={ui.label}>Monthly budget for new tools</span>
                <span className={s.money}>
                  <span aria-hidden="true">$</span>
                  <input className={`${ui.input} ${ui.num}`} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ""))} />
                </span>
              </label>
              <fieldset className={s.fieldset}>
                <legend className={ui.label}>Want someone to set things up for you?</legend>
                <div className={ui.row}>
                  <button type="button" className={ui.chipBtn} aria-pressed={needsHelp === true} onClick={() => setNeedsHelp(true)}>
                    Yes, please
                  </button>
                  <button type="button" className={ui.chipBtn} aria-pressed={needsHelp === false} onClick={() => setNeedsHelp(false)}>
                    I&apos;ll do it myself
                  </button>
                </div>
              </fieldset>
              <fieldset className={s.fieldset}>
                <legend className={ui.label}>What matters most? Pick up to two.</legend>
                <div className={ui.row}>
                  {GOALS.map((g) => (
                    <button
                      key={g.key}
                      type="button"
                      className={ui.chipBtn}
                      aria-pressed={goals.includes(g.key)}
                      onClick={() => setGoals((cur) => (cur.includes(g.key) ? cur.filter((x) => x !== g.key) : [...cur, g.key].slice(-2)))}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </section>
          </>
        )}

        {/* ================= Reading ================= */}
        {step === "reading" && (
          <section className={`${ui.panel} ${ui.pad} ${ui.stack}`} aria-busy="true">
            <h1 className={ui.h2}>
              <span className={s.spinner} aria-hidden="true" /> Reading public information
            </h1>
            <ul className={s.checklist}>
              <li>Listings on Google and directories</li>
              <li>Your website</li>
              <li>Customer reviews</li>
              <li>Tools your website uses</li>
            </ul>
            <div>
              <button className={ui.btnQuiet} type="button" onClick={startOver}>
                Cancel
              </button>
            </div>
          </section>
        )}

        {/* ================= Check ================= */}
        {step === "check" && analysis && view && (
          <>
            <section className={s.intro}>
              <h1 className={ui.display}>{view.business.name.value}</h1>
              <p className={s.lead}>{view.business.address.value?.formatted}</p>
              {snap && <Provenance snap={snap} />}
            </section>

            {analysis.warnings
              .filter((w) => !/mock mode|real public data/i.test(w))
              .map((w) => (
                <p key={w} className={s.notice}>
                  {w}
                </p>
              ))}

            <section className={`${ui.panel} ${ui.pad} ${ui.stack}`} style={{ gap: 18 }}>
              <div>
                <h2 className={ui.h2}>Is this right?</h2>
                <p className={ui.small}>Fix anything that&apos;s wrong. Your answer always wins.</p>
              </div>
              <div className={s.facts}>
                <FactField label="Phone" fact={view.business.phone} onSave={(v) => correct("phone", v)} />
                <FactField label="Website" fact={view.business.website} format={(v) => String(v).replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")} onSave={(v) => correct("website", v)} />
                <FactField label="Type of business" fact={view.business.category} onSave={(v) => correct("category", v)} />
                <div className={ui.field}>
                  <div className={ui.row}>
                    <span className={ui.tiny}>Hours</span>
                    <SourceChip source={view.business.hours.source} />
                  </div>
                  <span className={ui.body} style={{ fontWeight: 550 }}>
                    {view.business.hours.value?.join(", ") || "Not found"}
                  </span>
                </div>
              </div>
              {view.business.hours.needsOwnerInput && hoursField && hoursField.values.length > 1 && (
                <div className={s.ask}>
                  <p className={ui.body} style={{ fontWeight: 600 }}>
                    Your listings show different hours. Which is right?
                  </p>
                  <div className={ui.row}>
                    {hoursField.values.map((v) => (
                      <button key={v.display} type="button" className={ui.chipBtn} aria-pressed={view.business.hours.value?.[0] === v.display} onClick={() => chooseHours(v.display)}>
                        {v.display}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {snap && snap.about.length > 0 && (
                <dl className={s.about}>
                  {snap.about.map((a) => (
                    <div key={a.label}>
                      <dt className={ui.tiny}>{a.label}</dt>
                      <dd>
                        <a className={s.quietLink} href={a.url} target="_blank" rel="noreferrer noopener">
                          {a.value}
                        </a>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>

            <section className={`${ui.panel} ${ui.pad} ${ui.stack}`} style={{ gap: 16 }}>
              <div>
                <h2 className={ui.h2}>Where you&apos;re listed</h2>
                <p className={ui.small}>
                  {analysis.listings.issues.length === 0
                    ? `${analysis.listings.listings.length} listings checked. They agree.`
                    : `${analysis.listings.listings.length} listings checked. ${analysis.listings.issues.length} thing${analysis.listings.issues.length === 1 ? "" : "s"} don't match.`}
                </p>
              </div>
              <ListingsMatrix check={analysis.listings} />
              {analysis.listings.issues.length > 0 && (
                <ul className={s.issues}>
                  {analysis.listings.issues.map((i) => (
                    <li key={i.kind + i.headline}>{i.headline}</li>
                  ))}
                </ul>
              )}
            </section>

            <section className={`${ui.panel} ${ui.pad} ${ui.stack}`} style={{ gap: 16 }}>
              <div>
                <h2 className={ui.h2}>What customers say</h2>
                <p className={ui.small}>
                  {analysis.reviews.reviewCount} reviews read
                  {analysis.reviews.complaints.length === 0 ? ". No repeated complaints found." : "."}
                </p>
              </div>
              <StrengthBars strengths={analysis.reviews.praise.map((t) => ({ label: t.label, mentions: t.mentions }))} />
              {analysis.reviews.complaints.length > 0 && (
                <div className={ui.stack} style={{ gap: 6 }}>
                  <h3 className={ui.h3}>Complaints</h3>
                  {analysis.reviews.complaints.map((t) => (
                    <p key={t.key} className={ui.small}>
                      {t.label}: {t.mentions} review{t.mentions === 1 ? "" : "s"}
                    </p>
                  ))}
                </div>
              )}
              <details>
                <summary className={ui.small} style={{ cursor: "pointer" }}>
                  What we can and can&apos;t see
                </summary>
                <ul className={ui.small}>
                  {analysis.reviews.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </details>
            </section>

            <section className={`${ui.panel} ${ui.pad} ${ui.stack}`} style={{ gap: 14 }}>
              <h2 className={ui.h2}>Tools you use</h2>
              {analysis.technology.detected.length > 0 ? (
                <ul className={s.toolList}>
                  {analysis.technology.detected.map((t) => (
                    <li key={t.id}>
                      <strong>{t.name}</strong>
                      <span className={ui.tiny}>
                        {t.evidence[0]?.kind === "listing" ? "Seen on your listings" : t.evidence[0]?.kind === "places" ? "On Google" : "Found on your website"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={ui.small}>We didn&apos;t find any tools we could confirm.</p>
              )}
              {analysis.technology.askOwnerAbout.length > 0 && (
                <fieldset className={s.fieldset}>
                  <legend className={ui.label}>Do you use any of these? We can&apos;t see them from outside.</legend>
                  <div className={ui.row}>
                    {analysis.technology.askOwnerAbout.map((name) => (
                      <button
                        key={name}
                        type="button"
                        className={ui.chipBtn}
                        aria-pressed={tools.includes(name)}
                        onClick={() => setTools((cur) => (cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name]))}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
            </section>

            <div className={s.actions}>
              <button className={ui.btn} type="button" disabled={busy} onClick={() => void confirmProfile()}>
                {busy ? "Looking for problems" : "Looks right. Find problems"}
              </button>
              <button className={ui.btnQuiet} type="button" onClick={startOver}>
                Start over
              </button>
            </div>
          </>
        )}

        {/* ================= Problems ================= */}
        {step === "problems" && discovery && profile && (
          <>
            <section className={s.intro}>
              <p className={ui.small}>{profile.business.name.value}</p>
              <h1 className={ui.display}>{discovery.overview.headline}.</h1>
              {snap && <Provenance snap={snap} />}
            </section>

            {found.some((p) => p.impact) && (
              <section className={`${ui.panel} ${ui.pad} ${ui.stack}`} style={{ gap: 18 }}>
                <div className={s.split}>
                  <div>
                    <h2 className={ui.h2}>Where the money may be</h2>
                    <p className={ui.small}>Estimated each month. The bar shows the likely range.</p>
                  </div>
                  <div className={s.total}>
                    <span className={`${ui.amount} ${ui.num}`}>{fmt.usd(discovery.summary.estimatedMonthlyOpportunity.expected)}</span>
                    <span className={ui.tiny}>est. per month, not proven</span>
                  </div>
                </div>
                <OpportunityChart problems={found} />
                <p className={ui.tiny}>{discovery.disclaimer}</p>
                {dirty && (
                  <div>
                    <button className={ui.btnQuiet} type="button" disabled={busy} onClick={() => void discover(profile)}>
                      Update with my numbers
                    </button>
                  </div>
                )}
              </section>
            )}

            {discovery.overview.strengths.length > 0 && (
              <section className={`${ui.panel} ${ui.pad} ${ui.stack}`} style={{ gap: 14 }}>
                <div>
                  <h2 className={ui.h2}>What&apos;s working</h2>
                  <p className={ui.small}>What customers praise most in the reviews we read.</p>
                </div>
                <StrengthBars strengths={discovery.overview.strengths} />
              </section>
            )}

            <section className={ui.panel}>
              <div className={ui.pad} style={{ paddingBottom: 6 }}>
                <h2 className={ui.h2}>Found with evidence</h2>
                <p className={ui.small}>{found.length === 0 ? "Nothing with direct evidence yet." : "Ranked by how sure we are and what it may be worth. Open one to see the proof and the math."}</p>
              </div>
              <ul className={ui.ledger}>
                {found.map((p, i) => (
                  <ProblemCardView
                    key={p.id}
                    problem={p}
                    industry={industry}
                    defaultOpen={i === 0}
                    onAssumptions={(key, o) => {
                      setAssumptions((a) => ({ ...a, [key]: o }));
                      setDirty(true);
                    }}
                  />
                ))}
              </ul>
            </section>

            {toCheck.length > 0 && (
              <section className={ui.panel}>
                <div className={ui.pad} style={{ paddingBottom: 6 }}>
                  <h2 className={ui.h2}>Worth checking</h2>
                  <p className={ui.small}>Common for businesses like yours, but we have no direct evidence. They aren&apos;t in the totals. Tell us if they apply.</p>
                </div>
                <ul className={ui.ledger}>
                  {toCheck.map((p) => (
                    <ProblemCardView key={p.id} problem={p} industry={industry} onConfirmHypothesis={(k, yes) => void answer(k, yes)} />
                  ))}
                </ul>
              </section>
            )}

            <section className={s.next}>
              {recInput?.ok ? (
                <>
                  <div className={s.actions}>
                    <button className={ui.btn} type="button" disabled={busy} onClick={() => void getTools()}>
                      {busy ? "Finding tools" : `See tools for ${recInput.request.problems.length === 1 ? "this problem" : `these ${recInput.request.problems.length} problems`}`}
                    </button>
                    <button className={ui.btnQuiet} type="button" onClick={() => setStep("check")}>
                      Back
                    </button>
                  </div>
                  {recInput.omitted.length > 0 && (
                    <details>
                      <summary className={ui.small} style={{ cursor: "pointer" }}>
                        Not included, and why
                      </summary>
                      <ul className={ui.small}>
                        {recInput.omitted.map((o) => (
                          <li key={o.key}>{o.reason}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              ) : (
                <p className={s.notice}>To suggest tools we still need: {recInput && !recInput.ok ? recInput.missing.join(", ") : "nothing"}.</p>
              )}
            </section>
          </>
        )}

        {/* ================= Tools (Part 4) ================= */}
        {step === "tools" && recs && (
          <>
            <section className={s.intro}>
              <p className={ui.small}>{recs.forBusiness}</p>
              <h1 className={ui.display}>Tools that fit.</h1>
              <p className={s.lead}>From the recommendation engine{recs.sampleData ? ", using a sample tool catalog" : ""}. Each option passed the safety check.</p>
            </section>
            {recs.problems.map((pr) => (
              <section key={pr.problem.id} className={`${ui.panel} ${ui.pad} ${ui.stack}`} style={{ gap: 4 }}>
                <h2 className={ui.h2}>{pr.problem.title}</h2>
                {pr.options.length === 0 && <p className={ui.small}>No tools in the catalog fit this yet.</p>}
                <ul className={s.options}>
                  {pr.options.map((o) => (
                    <li key={o.kind}>
                      <span className={`${ui.tag} ${o.kind === "already-have" ? ui.tagFree : ""}`}>{OPTION_LABEL[o.kind] ?? o.title}</span>
                      <span className={s.optionMain}>
                        <strong>{o.choices.map((c) => c.tool.name).join(" + ")}</strong>
                        <span className={ui.small}>{o.choices[0]?.why ?? o.description}</span>
                      </span>
                      <span className={`${ui.num} ${s.price}`}>{o.monthlyPrice === 0 ? "Included" : `${fmt.usd(o.monthlyPrice)}/mo`}</span>
                    </li>
                  ))}
                </ul>
                {pr.excluded.length > 0 && (
                  <details>
                    <summary className={ui.small} style={{ cursor: "pointer" }}>
                      {pr.excluded.length} ruled out by the safety check
                    </summary>
                    <ul className={ui.small}>
                      {pr.excluded.map((x) => (
                        <li key={x.toolId}>
                          {x.toolName}: {x.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            ))}
            <div className={s.actions}>
              <button className={ui.btnQuiet} type="button" onClick={() => setStep("problems")}>
                Back to problems
              </button>
              <button className={ui.btnQuiet} type="button" onClick={startOver}>
                Try another business
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/** Where the data came from and when. Always visible for real businesses. */
function Provenance({ snap }: { snap: NonNullable<OnboardingAnalysis["snapshot"]> }) {
  return (
    <details className={s.provenance}>
      <summary>
        <span className={s.realDot} aria-hidden="true" />
        Real public data, captured {dateLabel(snap.capturedAt)}. {snap.sources.length} sources
      </summary>
      <p className={ui.small} style={{ margin: "10px 0" }}>
        {snap.note}
      </p>
      <ul className={s.sources}>
        {snap.sources.map((src) => (
          <li key={src.url}>
            <a className={ui.link} href={src.url} target="_blank" rel="noreferrer noopener">
              {src.label}
            </a>
            <span className={ui.tiny}>
              {src.usedFor}
              {src.via === "search_index" ? " (from search-engine text)" : ""}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
