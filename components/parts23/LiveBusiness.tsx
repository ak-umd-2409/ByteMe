"use client";

/**
 * Plugs the Parts 2 & 3 backend into any page:
 *   useLiveBusiness()   search → analyze → confirm → discover, plus "yes, this applies" answers
 *   <BusinessFinder>    search box, results, and one-click real businesses
 *   <ProblemsOverview>  evidence-backed problems, the math, and "worth checking"
 * Everything comes from the API; the browser never invents or calculates figures.
 */
import { useCallback, useRef, useState } from "react";
import type { BusinessMatch, OnboardingProfile } from "@/lib/business/types.ts";
import {
  api,
  ApiError,
  fmt,
  type DiscoveryResult,
  type OnboardingAnalysis,
  type ProblemKey,
  type RecommendationInputResult,
  type RulesReport,
} from "@/lib/client/parts23.ts";
import type { ProfileCorrections } from "@/lib/business/profile.ts";
import { OpportunityChart, StrengthBars } from "./charts.tsx";
import { ProblemCardView } from "./ProblemCardView.tsx";
import s from "./parts23.module.css";

export interface LiveBusiness {
  analysis: OnboardingAnalysis;
  profile: OnboardingProfile;
  discovery: DiscoveryResult;
  recommendationInput: RecommendationInputResult;
  rules: RulesReport;
}

export const REAL_BUSINESSES = [
  { query: "Dave's Cooling & Heating", label: "Dave's Cooling & Heating", place: "Frederick, MD" },
  { query: "Frederick Heating & Air Conditioning", label: "Frederick Heating & Air Conditioning", place: "Jefferson, MD" },
];

export function useLiveBusiness() {
  const [live, setLive] = useState<LiveBusiness | null>(null);
  const [matches, setMatches] = useState<BusinessMatch[] | null>(null);
  const [busy, setBusy] = useState<"search" | "analyze" | "update" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assumptions, setAssumptions] = useState<Partial<Record<ProblemKey, Record<string, number>>>>({});
  const abort = useRef<AbortController | null>(null);

  const run = useCallback(async <T,>(kind: "search" | "analyze" | "update", task: (signal: AbortSignal) => Promise<T>) => {
    abort.current?.abort();
    abort.current = new AbortController();
    setBusy(kind);
    setError(null);
    try {
      return await task(abort.current.signal);
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setError(e instanceof ApiError ? (e.status === 429 ? `Too many tries. Wait ${e.retryAfterSec ?? 30} seconds.` : e.message) : "Something went wrong. Try again.");
      return null;
    } finally {
      setBusy(null);
    }
  }, []);

  const search = useCallback(
    async (query: string) => {
      if (query.trim().length < 2) return setError("Type at least two letters of the business name.");
      const res = await run("search", (signal) => api.search(query.trim(), undefined, signal));
      if (res) setMatches(res.matches);
      return res?.matches ?? null;
    },
    [run],
  );

  /** Read the business, confirm the profile as found, and discover problems. */
  const choose = useCallback(
    async (placeId: string, owner: { monthlyBudget: number; needsHelp: boolean | null }, pastedReviews?: string) =>
      run("analyze", async (signal) => {
        const analysis = await api.analyze(
          {
            placeId,
            ...(pastedReviews?.trim() ? { pastedReviews: pastedReviews.trim() } : {}),
            owner: {
              monthlyBudget: owner.monthlyBudget,
              goals: ["more_customers"],
              ...(owner.needsHelp === null ? {} : { techComfort: owner.needsHelp ? "needs_help" : "self_serve" }),
            },
          },
          signal,
        );
        const { profile } = await api.confirm({ profile: analysis.profile }, signal);
        const { discovery, recommendationInput, rules } = await api.discover(
          { profile, reviews: analysis.reviews, website: analysis.website, listings: analysis.listings },
          signal,
        );
        const next = { analysis, profile, discovery, recommendationInput, rules };
        setLive(next);
        setMatches(null);
        setAssumptions({});
        return next;
      }),
    [run],
  );

  /** Re-run discovery, e.g. after the owner confirms a problem or changes numbers. */
  const refresh = useCallback(
    async (profile: OnboardingProfile, nextAssumptions = assumptions) => {
      if (!live) return null;
      return run("update", async (signal) => {
        const { discovery, recommendationInput, rules } = await api.discover(
          { profile, reviews: live.analysis.reviews, website: live.analysis.website, listings: live.analysis.listings, assumptions: nextAssumptions },
          signal,
        );
        const next = { ...live, profile, discovery, recommendationInput, rules };
        setLive(next);
        return next;
      });
    },
    [live, assumptions, run],
  );

  /** "Yes, it does" is recorded as something the owner told us, never as found evidence. */
  const confirmProblem = useCallback(
    async (key: ProblemKey) => {
      if (!live) return null;
      const reported = [...(live.profile.owner.reportedProblems.value ?? []), key] as ProblemKey[];
      const res = await run("update", (signal) => api.confirm({ profile: live.profile, corrections: { owner: { reportedProblems: reported } } }, signal));
      return res ? refresh(res.profile) : null;
    },
    [live, refresh, run],
  );

  /** Apply owner answers (team size, goals, deal-breakers, time sink, added problems) and re-run discovery. */
  const updateOwner = useCallback(
    async (corrections: ProfileCorrections) => {
      if (!live) return null;
      const res = await run("update", (signal) => api.confirm({ profile: live.profile, corrections }, signal));
      return res ? refresh(res.profile) : null;
    },
    [live, refresh, run],
  );

  const reset = useCallback(() => {
    abort.current?.abort();
    setLive(null);
    setMatches(null);
    setError(null);
  }, []);

  return { live, matches, busy, error, search, choose, refresh, confirmProblem, updateOwner, reset, assumptions, setAssumptions };
}

export type LiveBusinessApi = ReturnType<typeof useLiveBusiness>;

/** Search box, results, and the real businesses captured from public data. */
export function BusinessFinder({ biz, onChoose }: { biz: LiveBusinessApi; onChoose: (placeId: string, pastedReviews?: string) => void }) {
  const [query, setQuery] = useState("");
  const [pasted, setPasted] = useState("");
  return (
    <div className={`${s.root} ${s.embedded} ${s.panel} ${s.pad} ${s.stack}`} style={{ gap: 16 }}>
      <form
        className={s.finderRow}
        onSubmit={(e) => {
          e.preventDefault();
          void biz.search(query);
        }}
      >
        <label className={s.field}>
          <span className={s.label}>Find a business</span>
          <input className={s.input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Business name" autoComplete="organization" />
        </label>
        <button className={s.btn} type="submit" disabled={biz.busy !== null}>
          {biz.busy === "search" ? "Searching" : "Search"}
        </button>
      </form>
      <div className={s.stack} style={{ gap: 8 }}>
        <span className={s.small}>Or check a real Maryland business, captured from public listings, its website and reviews:</span>
        <div className={s.row}>
          {REAL_BUSINESSES.map((r) => (
            <button
              key={r.query}
              type="button"
              className={s.chipBtn}
              disabled={biz.busy !== null}
              onClick={async () => {
                setQuery(r.query);
                const found = await biz.search(r.query);
                if (found?.[0]) onChoose(found[0].placeId, pasted);
              }}
            >
              {r.label}, {r.place}
            </button>
          ))}
        </div>
      </div>
      <details>
        <summary className={s.small} style={{ cursor: "pointer" }}>
          Paste more reviews (optional)
        </summary>
        <div className={s.field} style={{ marginTop: 8 }}>
          <span className={s.tiny}>From Yelp, Facebook or anywhere else. Leave a blank line between reviews; star ratings like “4/5” are read too.</span>
          <textarea className={s.input} style={{ minHeight: 110, padding: 10 }} value={pasted} onChange={(e) => setPasted(e.target.value)} />
        </div>
      </details>
      {biz.matches && biz.busy !== "analyze" && (
        <ul className={s.matchList} aria-live="polite">
          {biz.matches.length === 0 && <li className={s.small}>No match. Try one of the businesses above.</li>}
          {biz.matches.map((m) => (
            <li key={m.placeId}>
              <button type="button" className={s.match} onClick={() => onChoose(m.placeId, pasted)}>
                <span>
                  <strong>{m.name}</strong>
                  <span className={s.small} style={{ display: "block" }}>
                    {m.address}
                  </span>
                </span>
                <span className={s.tiny}>{m.provider === "public_snapshot" ? "Real public data" : m.provider === "mock" ? "Sample" : "Google"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {biz.busy === "analyze" && (
        <p className={s.small} aria-live="polite">
          <span className={s.spinner} aria-hidden="true" /> Reading listings, website and reviews…
        </p>
      )}
      {biz.error && (
        <p className={s.error} role="alert">
          {biz.error}
        </p>
      )}
    </div>
  );
}

/** Where the data came from and when. */
export function Provenance({ snapshot }: { snapshot: NonNullable<OnboardingAnalysis["snapshot"]> }) {
  const date = new Date(`${snapshot.capturedAt}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return (
    <details className={s.provenance}>
      <summary>
        <span className={s.realDot} aria-hidden="true" />
        Real public data, captured {date}. {snapshot.sources.length} sources
      </summary>
      <p className={s.small} style={{ margin: "10px 0" }}>
        {snapshot.note}
      </p>
      <ul className={s.sourceList}>
        {snapshot.sources.map((src) => (
          <li key={src.url}>
            <a className={s.link} href={src.url} target="_blank" rel="noreferrer noopener">
              {src.label}
            </a>
            <span className={s.tiny}>
              {src.usedFor}
              {src.via === "search_index" ? " (from search-engine text)" : ""}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The problems found for the chosen business, evidence first. */
export function ProblemsOverview({ biz }: { biz: LiveBusinessApi }) {
  const live = biz.live;
  const [hidden, setHidden] = useState<ProblemKey[]>([]);
  if (!live) return null;
  const { discovery, profile, analysis } = live;
  const industry = profile.business.industry.value ?? "other";
  const found = discovery.problems.filter((p) => p.status !== "hypothesis");
  const toCheck = discovery.problems.filter((p) => p.status === "hypothesis" && !hidden.includes(p.key));
  const dirty = Object.keys(biz.assumptions).length > 0;
  return (
    <div className={`${s.root} ${s.embedded} ${s.stack}`} style={{ gap: 20 }}>
      <div className={s.stack} style={{ gap: 8 }}>
        <p className={s.overviewHead}>{discovery.overview.headline}.</p>
        {analysis.snapshot && <Provenance snapshot={analysis.snapshot} />}
      </div>

      <div className={s.overviewGrid}>
        {found.some((p) => p.impact) && (
          <section className={`${s.panel} ${s.pad} ${s.stack}`} style={{ gap: 16 }}>
            <div className={s.row} style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h3 className={s.h3}>Where the money may be</h3>
                <p className={s.small}>Estimated each month. The bar is the likely range.</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <span className={`${s.amount} ${s.num}`}>{fmt.usd(discovery.summary.estimatedMonthlyOpportunity.expected)}</span>
                <span className={s.tiny} style={{ display: "block" }}>
                  est. per month, not proven
                </span>
              </div>
            </div>
            <OpportunityChart problems={found} />
            {dirty && (
              <div>
                <button className={s.btnQuiet} type="button" disabled={biz.busy !== null} onClick={() => void biz.refresh(profile)}>
                  Update with my numbers
                </button>
              </div>
            )}
          </section>
        )}
        {discovery.overview.strengths.length > 0 && (
          <section className={`${s.panel} ${s.pad} ${s.stack}`} style={{ gap: 14 }}>
            <div>
              <h3 className={s.h3}>What customers praise</h3>
              <p className={s.small}>From the {analysis.reviews.reviewCount} reviews we could read.</p>
            </div>
            <StrengthBars strengths={discovery.overview.strengths} />
          </section>
        )}
      </div>

      <section className={s.panel}>
        <div className={s.pad} style={{ paddingBottom: 6 }}>
          <h3 className={s.h3}>Found with evidence</h3>
          <p className={s.small}>Open one to see the proof, what it may be worth, and the first step.</p>
        </div>
        <ul className={s.ledger}>
          {found.length === 0 && (
            <li className={s.pad}>
              <p className={s.small}>Nothing with direct evidence yet.</p>
            </li>
          )}
          {found.map((p, i) => (
            <ProblemCardView
              key={p.id}
              problem={p}
              industry={industry}
              defaultOpen={i === 0}
              onAssumptions={(key, o) => biz.setAssumptions((a) => ({ ...a, [key]: o }))}
            />
          ))}
        </ul>
      </section>

      {toCheck.length > 0 && (
        <section className={s.panel}>
          <div className={s.pad} style={{ paddingBottom: 6 }}>
            <h3 className={s.h3}>Worth checking</h3>
            <p className={s.small}>Common for businesses like this, but no direct evidence. Not in the totals. Say yes if one applies and it joins the recommendations.</p>
          </div>
          <ul className={s.ledger}>
            {toCheck.map((p) => (
              <ProblemCardView
                key={p.id}
                problem={p}
                industry={industry}
                onConfirmHypothesis={(key, yes) => (yes ? void biz.confirmProblem(key) : setHidden((h) => [...h, key]))}
              />
            ))}
          </ul>
        </section>
      )}
      <p className={s.tiny}>{discovery.disclaimer}</p>
    </div>
  );
}
