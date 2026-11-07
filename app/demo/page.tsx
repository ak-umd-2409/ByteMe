"use client";

/**
 * Demo of the Parts 2 & 3 flow, wired to the real API:
 *   Find → Reading → Check → Problems → Tools (Part 4's /api/recommend)
 * Works with no API keys (sample businesses). Not the final UI — see docs/FRONTEND_HANDOFF.md.
 */
import { useRef, useState } from "react";
import { EvidenceList, FactField, SourceChip } from "@/components/parts23/primitives.tsx";
import { ProblemCardView } from "@/components/parts23/ProblemCardView.tsx";
import ui from "@/components/parts23/parts23.module.css";
import type { ProfileCorrections } from "@/lib/business/profile.ts";
import type { BusinessMatch, Fact, Goal } from "@/lib/business/types.ts";
import { api, ApiError, fmt, type DiscoveryResult, type OnboardingAnalysis, type OnboardingProfile, type ProblemKey, type RecommendationInputResult } from "@/lib/client/parts23.ts";
import type { RecommendationResult } from "@/lib/recommend/types.ts";
import s from "./demo.module.css";

type Step = "find" | "reading" | "check" | "problems" | "tools";
const STEPS: { key: Step; label: string }[] = [
  { key: "find", label: "1 Find" },
  { key: "check", label: "2 Check" },
  { key: "problems", label: "3 Problems" },
  { key: "tools", label: "4 Tools" },
];
const SAMPLES = [
  { q: "Mike's Heating", near: "Frederick, MD", label: "Mike's Heating (HVAC)" },
  { q: "Glow Studio", near: "Annapolis, MD", label: "Glow Studio (salon)" },
  { q: "Bean There", near: "Baltimore, MD", label: "Bean There (café)" },
  { q: "Garrett Farm", near: "Oakland, MD", label: "Garrett farm (no website)" },
];
const GOALS: { key: Goal; label: string }[] = [
  { key: "more_customers", label: "More customers" },
  { key: "save_time", label: "Save time" },
  { key: "better_reviews", label: "Better reviews" },
  { key: "get_paid_faster", label: "Get paid faster" },
];

const ownerFact = <T,>(fact: Fact<T>, value: T): Fact<T> => ({ ...fact, value, source: "owner", confidence: "high", evidence: "You corrected this" });

export default function DemoPage() {
  const [step, setStep] = useState<Step>("find");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  // Find
  const [q, setQ] = useState("");
  const [near, setNear] = useState("");
  const [matches, setMatches] = useState<BusinessMatch[] | null>(null);
  const [budget, setBudget] = useState("200");
  const [needsHelp, setNeedsHelp] = useState<boolean | null>(null);
  const [goals, setGoals] = useState<Goal[]>(["more_customers"]);
  const [pasted, setPasted] = useState("");

  // Check / problems / tools
  const [analysis, setAnalysis] = useState<OnboardingAnalysis | null>(null);
  const [profileView, setProfileView] = useState<OnboardingProfile | null>(null);
  const [corrections, setCorrections] = useState<ProfileCorrections>({});
  const [tools, setTools] = useState<string[]>([]);
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [recInput, setRecInput] = useState<RecommendationInputResult | null>(null);
  const [assumptions, setAssumptions] = useState<Partial<Record<ProblemKey, Record<string, number>>>>({});
  const [assumptionsDirty, setAssumptionsDirty] = useState(false);
  const [dismissed, setDismissed] = useState<ProblemKey[]>([]);
  const [recs, setRecs] = useState<RecommendationResult | null>(null);

  const sample = analysis?.mode.places === "mock" || matches?.some((m) => m.provider === "mock");

  async function run<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
    abort.current?.abort();
    abort.current = new AbortController();
    setBusy(true);
    setError(null);
    try {
      return await task(abort.current.signal);
    } catch (e) {
      if ((e as Error).name === "AbortError") return null;
      setError(e instanceof ApiError ? (e.status === 429 ? `Too many tries. Wait ${e.retryAfterSec ?? 30} seconds.` : e.message) : "Something went wrong.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function search(query = q, town = near) {
    if (query.trim().length < 2) return setError("Type at least 2 letters of the business name.");
    const res = await run((signal) => api.search(query.trim(), town.trim() || undefined, signal));
    if (res) setMatches(res.matches);
  }

  async function analyze(placeId: string) {
    setStep("reading");
    const res = await run((signal) =>
      api.analyze(
        {
          placeId,
          pastedReviews: pasted.trim() || undefined,
          owner: {
            monthlyBudget: Number(budget) || 0,
            goals,
            ...(needsHelp === null ? {} : { techComfort: needsHelp ? "needs_help" : "self_serve" }),
          },
        },
        signal,
      ),
    );
    if (!res) return setStep("find");
    setAnalysis(res);
    setProfileView(res.profile);
    setCorrections({});
    setTools([]);
    setStep("check");
  }

  function correctBusiness(key: "name" | "phone" | "website" | "category", value: string) {
    if (!profileView) return;
    setCorrections((c) => ({ ...c, business: { ...c.business, [key]: value } }));
    setProfileView({ ...profileView, business: { ...profileView.business, [key]: ownerFact(profileView.business[key] as Fact<string>, value) } });
  }

  async function discover(nextProfile: OnboardingProfile, nextAssumptions = assumptions) {
    if (!analysis) return;
    const res = await run((signal) =>
      api.discover({ profile: nextProfile, reviews: analysis.reviews, website: analysis.website, assumptions: nextAssumptions }, signal),
    );
    if (!res) return;
    setDiscovery(res.discovery);
    setRecInput(res.recommendationInput);
    setAssumptionsDirty(false);
  }

  async function confirmProfile() {
    if (!analysis) return;
    const allCorrections: ProfileCorrections = { ...corrections, ...(tools.length ? { currentTools: tools } : {}) };
    const res = await run((signal) => api.confirm({ profile: analysis.profile, corrections: allCorrections }, signal));
    if (!res) return;
    setProfile(res.profile);
    await discover(res.profile);
    setStep("problems");
  }

  async function answerHypothesis(key: ProblemKey, applies: boolean) {
    if (!applies || !profile) return setDismissed((d) => [...d, key]);
    // "Yes" is recorded as something the owner told us — it never becomes "found evidence".
    const reported = [...(profile.owner.reportedProblems.value ?? []), key] as ProblemKey[];
    const res = await run((signal) => api.confirm({ profile, corrections: { owner: { reportedProblems: reported } } }, signal));
    if (!res) return;
    setProfile(res.profile);
    await discover(res.profile);
  }

  async function getTools() {
    if (!recInput?.ok) return;
    const res = await run(async (signal) => {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(recInput.request),
        signal,
      });
      if (!response.ok) throw new ApiError(response.status, null, null);
      return (await response.json()) as RecommendationResult;
    });
    if (res) {
      setRecs(res);
      setStep("tools");
    }
  }

  function startOver() {
    abort.current?.abort();
    setStep("find");
    setMatches(null);
    setAnalysis(null);
    setDiscovery(null);
    setRecs(null);
    setAssumptions({});
    setDismissed([]);
    setError(null);
  }

  const industry = profile?.business.industry.value ?? analysis?.profile.business.industry.value ?? "other";
  const evidenced = discovery?.problems.filter((p) => p.status !== "hypothesis" && p.useCase) ?? [];
  const maybe = discovery?.problems.filter((p) => p.status === "hypothesis" && !dismissed.includes(p.key)) ?? [];
  const quickFixes = discovery?.problems.filter((p) => p.status !== "hypothesis" && !p.useCase) ?? [];
  const stepIndex = STEPS.findIndex((x) => x.key === (step === "reading" ? "find" : step));

  return (
    <div className={`${ui.root} ${s.page}`}>
      <header className={s.top}>
        <div className={s.brand}>
          MainStreet <span>AI</span>
        </div>
        <ol className={s.steps} aria-label="Progress">
          {STEPS.map((x, i) => (
            <li key={x.key} aria-current={i === stepIndex ? "step" : undefined} className={i < stepIndex ? s.done : undefined}>
              {x.label}
            </li>
          ))}
        </ol>
      </header>
      {sample && <div className={s.banner}>You&apos;re looking at a sample business. Nothing here is real data.</div>}

      <main className={s.main}>
        {error && (
          <div className={s.errorBox} role="alert">
            {error}
          </div>
        )}

        {/* ---------------- 1. Find ---------------- */}
        {step === "find" && (
          <>
            <div>
              <h1 className={s.h1}>Let&apos;s find your business</h1>
              <p className={s.lead}>We&apos;ll read your Google listing, website and reviews, then show you what might be costing you customers.</p>
            </div>

            <section className={ui.card} style={{ display: "grid", gap: 16 }}>
              <form
                className={s.grid2}
                onSubmit={(e) => {
                  e.preventDefault();
                  void search();
                }}
              >
                <label className={ui.field}>
                  <span className={ui.label}>Business name</span>
                  <input className={ui.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Mike's Heating" />
                </label>
                <label className={ui.field}>
                  <span className={ui.label}>Town or ZIP (optional)</span>
                  <input className={ui.input} value={near} onChange={(e) => setNear(e.target.value)} placeholder="e.g. Frederick, MD" />
                </label>
                <div>
                  <button className={ui.button} type="submit" disabled={busy}>
                    {busy ? "Searching…" : "Search"}
                  </button>
                </div>
              </form>
              <div className={ui.stack} style={{ gap: 8 }}>
                <span className={ui.meta}>Or try a sample business:</span>
                <div className={s.chips}>
                  {SAMPLES.map((x) => (
                    <button
                      key={x.q}
                      className={s.chip}
                      type="button"
                      onClick={() => {
                        setQ(x.q);
                        setNear(x.near);
                        void search(x.q, x.near);
                      }}
                    >
                      {x.label}
                    </button>
                  ))}
                </div>
              </div>

              {matches && (
                <div className={ui.stack} style={{ gap: 8 }} aria-live="polite">
                  {matches.length === 0 && <div className={s.notice}>No match found. Check the spelling, or try a nearby town.</div>}
                  {matches.map((m) => (
                    <button key={m.placeId} className={s.result} type="button" onClick={() => void analyze(m.placeId)}>
                      <strong>{m.name}</strong>
                      <span className={ui.meta}>{m.address}</span>
                      <span className={ui.meta}>
                        {m.category}
                        {m.rating !== null && ` · ★ ${m.rating} (${m.reviewCount})`}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className={ui.card} style={{ display: "grid", gap: 16 }}>
              <h2 className={s.h2}>Three quick questions</h2>
              <label className={ui.field} style={{ maxWidth: 260 }}>
                <span className={ui.label}>Monthly budget for new tools</span>
                <input className={`${ui.input} ${ui.num}`} type="number" min={0} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
              </label>
              <div className={ui.field}>
                <span className={ui.label}>Do you want someone to set it up for you?</span>
                <div className={s.chips}>
                  <button type="button" className={s.chip} aria-pressed={needsHelp === true} onClick={() => setNeedsHelp(true)}>
                    Yes, please
                  </button>
                  <button type="button" className={s.chip} aria-pressed={needsHelp === false} onClick={() => setNeedsHelp(false)}>
                    I&apos;ll do it myself
                  </button>
                </div>
              </div>
              <div className={ui.field}>
                <span className={ui.label}>What matters most? (pick up to 2)</span>
                <div className={s.chips}>
                  {GOALS.map((g) => (
                    <button
                      key={g.key}
                      type="button"
                      className={s.chip}
                      aria-pressed={goals.includes(g.key)}
                      onClick={() =>
                        setGoals((cur) => (cur.includes(g.key) ? cur.filter((x) => x !== g.key) : [...cur, g.key].slice(-2)))
                      }
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
              <details>
                <summary className={ui.disclosure}>Paste reviews from Yelp or Facebook (optional)</summary>
                <textarea
                  className={ui.input}
                  style={{ width: "100%", minHeight: 110, padding: 10, marginTop: 8 }}
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder={"★★☆☆☆ Called twice, nobody picks up.\n\n5/5 Great job, fair price."}
                />
                <span className={ui.meta}>Leave a blank line between reviews.</span>
              </details>
            </section>
          </>
        )}

        {/* ---------------- Reading ---------------- */}
        {step === "reading" && (
          <section className={ui.card} style={{ display: "grid", gap: 16 }} aria-busy="true">
            <h1 className={s.h2}>
              <span className={s.spinner} aria-hidden="true" /> Reading your business…
            </h1>
            <ul className={s.checklist}>
              <li>Your Google listing</li>
              <li>Your website (up to 6 pages)</li>
              <li>Customer reviews</li>
              <li>Tools on your website</li>
            </ul>
            <p className={ui.meta}>This usually takes a few seconds.</p>
            <div>
              <button className={ui.ghost} type="button" onClick={startOver}>
                Cancel
              </button>
            </div>
          </section>
        )}

        {/* ---------------- 2. Check ---------------- */}
        {step === "check" && analysis && profileView && (
          <>
            <div>
              <h1 className={s.h1}>Is this right?</h1>
              <p className={s.lead}>Fix anything that&apos;s wrong. Every item says where we found it.</p>
            </div>
            {analysis.warnings.filter((w) => !/mock mode/i.test(w)).map((w) => (
              <div key={w} className={s.notice}>
                {w}
              </div>
            ))}

            <section className={ui.card} style={{ display: "grid", gap: 18 }}>
              <h2 className={s.h2}>Your business</h2>
              <div className={s.grid2}>
                <FactField label="Name" fact={profileView.business.name} onSave={(v) => correctBusiness("name", v)} />
                <FactField label="Category" fact={profileView.business.category} onSave={(v) => correctBusiness("category", v)} />
                <FactField label="Phone" fact={profileView.business.phone} onSave={(v) => correctBusiness("phone", v)} />
                <FactField label="Website" fact={profileView.business.website} onSave={(v) => correctBusiness("website", v)} />
              </div>
              <div className={ui.field}>
                <div className={ui.row}>
                  <span className={ui.label}>Hours</span>
                  <SourceChip source={profileView.business.hours.source} />
                </div>
                {profileView.business.hours.value?.length ? (
                  <ul className={s.hours}>
                    {profileView.business.hours.value.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                ) : (
                  <span className={ui.meta}>We couldn&apos;t find your hours</span>
                )}
                {analysis.website?.hours[0] && (
                  <span className={ui.meta}>
                    Your website says: “{analysis.website.hours[0].evidence.snippet}”
                  </span>
                )}
              </div>
            </section>

            <section className={ui.card} style={{ display: "grid", gap: 14 }}>
              <h2 className={s.h2}>What customers say</h2>
              <p className={ui.meta} style={{ margin: 0 }}>
                {analysis.reviews.reviewCount} reviews read
                {analysis.reviews.averageRating !== null && ` · average ★ ${analysis.reviews.averageRating}`}
              </p>
              {analysis.reviews.complaints.length === 0 && analysis.reviews.praise.length === 0 && (
                <p className={ui.meta}>No reviews to read. Paste some on the first screen if you have them.</p>
              )}
              {[...analysis.reviews.complaints.slice(0, 3), ...analysis.reviews.praise.slice(0, 1)].map((t) => (
                <div key={t.key} className={ui.stack} style={{ gap: 6 }}>
                  <strong>
                    {t.polarity === "praise" ? "👍 " : ""}
                    {t.label} <span className={ui.meta}>· {t.mentions} review{t.mentions === 1 ? "" : "s"}</span>
                  </strong>
                  <blockquote className={ui.quote}>
                    “{t.evidence[0]?.quote}”
                    {t.evidence[0]?.author && <div className={ui.meta}>{t.evidence[0].author}</div>}
                  </blockquote>
                </div>
              ))}
              {analysis.reviews.limitations.map((l) => (
                <p key={l} className={ui.meta} style={{ margin: 0 }}>
                  {l}
                </p>
              ))}
            </section>

            <section className={ui.card} style={{ display: "grid", gap: 14 }}>
              <h2 className={s.h2}>Tools you use</h2>
              {analysis.technology.detected.length > 0 ? (
                <div className={s.chips}>
                  {analysis.technology.detected.map((t) => (
                    <span key={t.id} className={ui.sourceChip} style={{ fontSize: 14, padding: "4px 12px" }} title={t.evidence[0]?.matched}>
                      {t.name} · {t.evidence[0]?.kind === "places" ? "on Google" : "found on your website"}
                    </span>
                  ))}
                </div>
              ) : (
                <p className={ui.meta}>We didn&apos;t see any tools on your website.</p>
              )}
              {analysis.technology.askOwnerAbout.length > 0 && (
                <div className={ui.field}>
                  <span className={ui.label}>Do you use any of these? We can&apos;t see them from outside.</span>
                  <div className={s.chips}>
                    {analysis.technology.askOwnerAbout.map((name) => (
                      <button
                        key={name}
                        type="button"
                        className={s.chip}
                        aria-pressed={tools.includes(name)}
                        onClick={() => setTools((cur) => (cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name]))}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <div className={s.actions}>
              <button className={ui.button} type="button" disabled={busy} onClick={() => void confirmProfile()}>
                {busy ? "Looking for problems…" : "Looks right"}
              </button>
              <button className={ui.ghost} type="button" onClick={startOver}>
                Start over
              </button>
            </div>
          </>
        )}

        {/* ---------------- 3. Problems ---------------- */}
        {step === "problems" && discovery && profile && (
          <>
            <div>
              <h1 className={s.h1}>What might be costing you</h1>
              <p className={s.lead}>Ranked by how sure we are and how much it might matter.</p>
            </div>

            <section className={ui.card} style={{ display: "grid", gap: 8 }}>
              <p className={s.summary}>
                {(() => {
                  const parts = [
                    discovery.summary.confirmed ? `${discovery.summary.confirmed} confirmed` : null,
                    discovery.summary.likely ? `${discovery.summary.likely} likely` : null,
                  ].filter(Boolean);
                  const total = discovery.summary.confirmed + discovery.summary.likely;
                  return total === 0 ? "We didn't find problems with direct evidence." : <>We found <strong>{parts.join(" and ")}</strong> problem{total === 1 ? "" : "s"}.</>;
                })()}
                {discovery.summary.estimatedMonthlyOpportunity.expected > 0 && (
                  <>
                    {" "}
                    Together they may be worth about{" "}
                    <strong className={ui.num}>{fmt.usd(discovery.summary.estimatedMonthlyOpportunity.expected)}/month</strong> in missed business
                    <span className={`${ui.meta} ${ui.num}`}> (could be {fmt.range(discovery.summary.estimatedMonthlyOpportunity)})</span>
                    {discovery.summary.estimatedMonthlyTimeValue.expected > 0 && (
                      <>
                        , plus about <strong className={ui.num}>{fmt.usd(discovery.summary.estimatedMonthlyTimeValue.expected)}/month</strong> of your time
                      </>
                    )}
                    .
                  </>
                )}
              </p>
              <p className={ui.meta} style={{ margin: 0 }}>
                {discovery.disclaimer}
              </p>
              {assumptionsDirty && (
                <div>
                  <button className={ui.ghost} type="button" disabled={busy} onClick={() => void discover(profile)}>
                    Update totals with my numbers
                  </button>
                </div>
              )}
            </section>

            {evidenced.length === 0 && <div className={s.notice}>We didn&apos;t find clear problems. Do any of these sound familiar?</div>}
            {evidenced.map((p) => (
              <ProblemCardView
                key={p.id}
                problem={p}
                industry={industry}
                onAssumptions={(key, o) => {
                  setAssumptions((a) => ({ ...a, [key]: o }));
                  setAssumptionsDirty(true);
                }}
              />
            ))}

            {quickFixes.length > 0 && (
              <section className={ui.card} style={{ display: "grid", gap: 10 }}>
                <h2 className={s.h2}>Quick fixes (no new tool needed)</h2>
                {quickFixes.map((p) => (
                  <div key={p.id} className={ui.stack} style={{ gap: 6 }}>
                    <strong>{p.title}</strong>
                    <EvidenceList evidence={p.evidence} limit={2} />
                  </div>
                ))}
              </section>
            )}

            {maybe.length > 0 && (
              <>
                <h2 className={s.h2} style={{ marginTop: 8 }}>
                  Might apply — tell us
                </h2>
                <p className={s.lead} style={{ marginTop: -8 }}>
                  We don&apos;t have direct evidence for these yet. They&apos;re left out of the totals.
                </p>
                {maybe.map((p) => (
                  <ProblemCardView key={p.id} problem={p} industry={industry} onConfirmHypothesis={(k, yes) => void answerHypothesis(k, yes)} />
                ))}
              </>
            )}

            <section className={ui.card} style={{ display: "grid", gap: 10 }}>
              {recInput?.ok ? (
                <>
                  <div className={s.actions}>
                    <button className={ui.button} type="button" disabled={busy} onClick={() => void getTools()}>
                      {busy ? "Finding tools…" : `Show me tools for ${recInput.request.problems.length === 1 ? "this" : `these ${recInput.request.problems.length}`}`}
                    </button>
                    <button className={ui.ghost} type="button" onClick={() => setStep("check")}>
                      Back
                    </button>
                  </div>
                  {recInput.omitted.length > 0 && (
                    <details>
                      <summary className={ui.disclosure}>Not included and why</summary>
                      <ul className={ui.meta}>
                        {recInput.omitted.map((o) => (
                          <li key={o.key}>{o.reason}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              ) : (
                <div className={s.notice}>Before we can suggest tools we need: {recInput && !recInput.ok ? recInput.missing.join(", ") : "—"}</div>
              )}
            </section>
          </>
        )}

        {/* ---------------- 4. Tools (Part 4) ---------------- */}
        {step === "tools" && recs && (
          <>
            <div>
              <h1 className={s.h1}>Tools that fit {recs.forBusiness}</h1>
              <p className={s.lead}>From Part 4&apos;s recommendation engine{recs.sampleData ? ", using sample catalog data" : ""}.</p>
            </div>
            {recs.problems.map((pr) => (
              <section key={pr.problem.id} className={ui.card} style={{ display: "grid", gap: 14 }}>
                <div>
                  <h2 className={s.h2}>{pr.problem.title}</h2>
                  <p className={ui.meta} style={{ margin: "4px 0 0" }}>
                    {pr.problem.evidence.slice(0, 180)}
                    {pr.problem.evidence.length > 180 ? "…" : ""}
                  </p>
                </div>
                {pr.options.length === 0 && (
                  <div className={s.notice}>No tools in the catalog fit this yet{pr.excluded.length ? ", and the safety check ruled some out" : ""}.</div>
                )}
                {pr.options.map((o) => (
                  <div key={o.kind} className={s.option}>
                    <span className={s.kind}>{o.title.toUpperCase()}</span>
                    <div className={ui.row} style={{ justifyContent: "space-between" }}>
                      <strong>{o.choices.map((c) => c.tool.name).join(" + ")}</strong>
                      <span className={s.price}>{o.monthlyPrice === 0 ? "Free / included" : `${fmt.usd(o.monthlyPrice)}/mo`}</span>
                    </div>
                    <span className={ui.meta}>{o.choices[0]?.why ?? o.description}</span>
                    {o.note && <span className={ui.meta}>{o.note}</span>}
                  </div>
                ))}
                {pr.excluded.length > 0 && (
                  <details>
                    <summary className={ui.disclosure}>{pr.excluded.length} tools ruled out by the safety check</summary>
                    <ul className={ui.meta}>
                      {pr.excluded.map((x) => (
                        <li key={x.toolId}>
                          <strong>{x.toolName}:</strong> {x.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            ))}
            <div className={s.actions}>
              <button className={ui.ghost} type="button" onClick={() => setStep("problems")}>
                Back to problems
              </button>
              <button className={ui.ghost} type="button" onClick={startOver}>
                Try another business
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
