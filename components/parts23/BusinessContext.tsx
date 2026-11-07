"use client";

/**
 * Part 2 context panels for the main site:
 *   <ContextStrip>  where you are (2.9), languages (2.10), internet (2.11), data sensitivity (2.7), policies (2.6)
 *   <RulesPanel>    rules that apply to you (2.8)
 *   <AboutYou>      team size, goals, deal-breakers, "what eats your week?" (the questions we still ask)
 *   <AddProblem>    "Anything else?" (3.5)
 */
import { useState } from "react";
import type { Constraint, Goal } from "@/lib/business/types.ts";
import { PROBLEMS } from "@/lib/problems/catalog.ts";
import type { ProblemKey } from "@/lib/client/parts23.ts";
import type { LiveBusinessApi } from "./LiveBusiness.tsx";
import s from "./parts23.module.css";

type Live = NonNullable<LiveBusinessApi["live"]>;

const POLICY_LABEL = { privacy: "Privacy policy", refund: "Refund or cancellation policy", terms: "Terms of service" } as const;

export function ContextStrip({ live }: { live: Live }) {
  const { location, website } = live.analysis;
  const sens = live.profile.dataSensitivity;
  const siteRead = Boolean(website?.reachable);
  return (
    <div className={`${s.root} ${s.embedded} ${s.contextGrid}`}>
      <section className={`${s.panel} ${s.ctxCard}`}>
        <h3 className={s.ctxHead}>Where you are</h3>
        {location.county ? (
          <>
            <p className={s.body}>
              {location.county === "Baltimore City" ? "Baltimore City" : `${location.county} County`}, {location.stateCode}
            </p>
            {location.rural && (
              <p className={s.small}>
                {location.rural.note}{" "}
                <a className={s.link} href={location.rural.source.url} target="_blank" rel="noreferrer noopener">
                  Source
                </a>
              </p>
            )}
          </>
        ) : (
          <p className={s.small}>We couldn&apos;t place this business in a county.</p>
        )}
      </section>

      <section className={`${s.panel} ${s.ctxCard}`}>
        <h3 className={s.ctxHead}>Free local help</h3>
        {location.sbdc ? (
          <>
            <p className={s.body}>Maryland SBDC, {location.sbdc.name}</p>
            <p className={s.small}>
              Free, confidential business advice.
              {location.sbdc.phone && (
                <>
                  {" "}Call <span style={{ whiteSpace: "nowrap" }}>{location.sbdc.phone}</span>.
                </>
              )}{" "}
              <a className={s.link} href={location.sbdc.url} target="_blank" rel="noreferrer noopener">
                Find your office
              </a>
            </p>
          </>
        ) : (
          <p className={s.small}>Local advisor lookup covers Maryland only for now.</p>
        )}
      </section>

      <section className={`${s.panel} ${s.ctxCard}`}>
        <h3 className={s.ctxHead}>Languages nearby</h3>
        {location.languages ? (
          <p className={s.small}>
            {location.languages.text}{" "}
            <a className={s.link} href={location.languages.source.url} target="_blank" rel="noreferrer noopener">
              {location.languages.source.label}
            </a>
          </p>
        ) : (
          <p className={s.small}>Not available for this county yet.</p>
        )}
      </section>

      <section className={`${s.panel} ${s.ctxCard}`}>
        <h3 className={s.ctxHead}>Internet</h3>
        {location.internet ? (
          <p className={s.small}>
            {location.internet.text}{" "}
            <a className={s.link} href={location.internet.source.url} target="_blank" rel="noreferrer noopener">
              Source
            </a>
          </p>
        ) : (
          <p className={s.small}>Not available for this county yet.</p>
        )}
      </section>

      <section className={`${s.panel} ${s.ctxCard}`}>
        <h3 className={s.ctxHead}>
          Data sensitivity: <span className={sens.level === "high" ? s.diff : sens.level === "medium" ? s.diff : s.same}>{sens.level[0].toUpperCase() + sens.level.slice(1)}</span>
        </h3>
        <ul className={s.ctxList}>
          {sens.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>

      <section className={`${s.panel} ${s.ctxCard}`}>
        <h3 className={s.ctxHead}>Your policies</h3>
        {!website ? (
          <p className={s.small}>No website, so no policies to check.</p>
        ) : !siteRead ? (
          <p className={s.small}>We couldn&apos;t read the website, so policies weren&apos;t checked.</p>
        ) : (
          <ul className={s.ctxList}>
            {(Object.keys(POLICY_LABEL) as (keyof typeof POLICY_LABEL)[]).map((k) => {
              const p = website.policies[k];
              return (
                <li key={k}>
                  {p.present ? (
                    <>
                      <a className={s.link} href={p.url ?? undefined} target="_blank" rel="noreferrer noopener">
                        {POLICY_LABEL[k]}
                      </a>
                      {p.facts?.length ? (
                        <ul className={s.factList}>
                          {p.facts.slice(0, 4).map((f) => (
                            <li key={f.key} title={`“${f.snippet}”`}>
                              {f.label}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className={s.tiny}> found (not read)</span>
                      )}
                    </>
                  ) : (
                    <span className={s.tiny}>{POLICY_LABEL[k]}: not found on the pages we read</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

const STATUS_TEXT = { applies: "Applies to you", may_apply: "May apply", not_applicable: "Doesn't apply" } as const;

export function RulesPanel({ live }: { live: Live }) {
  const report = live.rules;
  const relevant = report.rules.filter((r) => r.status !== "not_applicable");
  const other = report.rules.filter((r) => r.status === "not_applicable");
  return (
    <section className={`${s.root} ${s.embedded} ${s.panel} ${s.pad} ${s.stack}`} style={{ gap: 14 }}>
      <div>
        <h3 className={s.h3}>{report.headline}</h3>
        <p className={s.small}>We check these before suggesting any tool. Tools that would break them never appear in your options.</p>
      </div>
      <ul className={s.ruleList}>
        {relevant.map((r) => (
          <li key={r.id} className={s.rule}>
            <div className={s.row} style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <strong>{r.title}</strong>
              <span className={`${s.tag} ${r.status === "applies" ? s.tagCheck : ""}`}>{STATUS_TEXT[r.status]}</span>
            </div>
            <p className={s.small} style={{ color: "var(--ink)" }}>
              {r.plain}
            </p>
            <p className={s.small}>
              <strong>Why: </strong>
              {r.why} <strong>What we do: </strong>
              {r.effect}
            </p>
            <p className={s.tiny}>
              <a className={s.link} href={r.source.url} target="_blank" rel="noreferrer noopener">
                {r.source.label}
              </a>
              {r.effective !== "In force" ? `. Effective ${r.effective}` : ""}
            </p>
          </li>
        ))}
      </ul>
      {other.length > 0 && (
        <details>
          <summary className={s.small} style={{ cursor: "pointer" }}>
            {other.length} rule{other.length === 1 ? "" : "s"} that don&apos;t apply to you
          </summary>
          <ul className={s.ctxList} style={{ marginTop: 8 }}>
            {other.map((r) => (
              <li key={r.id}>
                <strong>{r.title}.</strong> <span className={s.small}>{r.why}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className={s.tiny}>
        {report.disclaimer} Checked {report.checkedAt}.
      </p>
    </section>
  );
}

const GOALS: { key: Goal; label: string }[] = [
  { key: "more_customers", label: "More customers" },
  { key: "save_time", label: "Save time" },
  { key: "better_reviews", label: "Better reviews" },
  { key: "get_paid_faster", label: "Get paid faster" },
];
const DEAL_BREAKERS: { key: Constraint; label: string }[] = [
  { key: "no_contract", label: "No contracts" },
  { key: "no_recording", label: "No call recording" },
  { key: "spanish_required", label: "Must speak Spanish" },
  { key: "offline_required", label: "Must work offline" },
];

/** The short questions the spec says we still ask. Saving re-runs problems and recommendations. */
export function AboutYou({ biz, onSaved }: { biz: LiveBusinessApi; onSaved?: (next: NonNullable<LiveBusinessApi["live"]>) => void }) {
  const live = biz.live!;
  const o = live.profile.owner;
  const [team, setTeam] = useState(o.teamSize.value ? String(o.teamSize.value) : "");
  const [goals, setGoals] = useState<Goal[]>(o.goals.value ?? []);
  const [breakers, setBreakers] = useState<Constraint[]>(o.constraints.value ?? []);
  const [timeSink, setTimeSink] = useState(o.biggestTimeSink.value ?? "");
  const [bigList, setBigList] = useState<boolean | null>(o.handlesLargeCustomerList.source === "owner" ? o.handlesLargeCustomerList.value : null);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <form
      className={`${s.root} ${s.embedded} ${s.panel} ${s.pad} ${s.stack}`}
      style={{ gap: 18 }}
      onSubmit={async (e) => {
        e.preventDefault();
        const teamSize = Number(team);
        const next = await biz.updateOwner({
          owner: {
            ...(team && Number.isFinite(teamSize) && teamSize > 0 ? { teamSize } : {}),
            goals,
            constraints: breakers,
            ...(timeSink.trim() ? { biggestTimeSink: timeSink.trim() } : {}),
            ...(bigList !== null ? { handlesLargeCustomerList: bigList } : {}),
          },
        });
        if (next) onSaved?.(next);
      }}
    >
      <div>
        <h3 className={s.h3}>A bit about you</h3>
        <p className={s.small}>Optional. Your answers sharpen the problems and the options below.</p>
      </div>
      <div className={s.aboutGrid}>
        <label className={s.field}>
          <span className={s.label}>People on your team</span>
          <input className={`${s.input} ${s.num}`} inputMode="numeric" value={team} onChange={(e) => setTeam(e.target.value.replace(/\D/g, ""))} style={{ maxWidth: 120 }} />
        </label>
        <fieldset className={s.fieldsetBare}>
          <legend className={s.label}>Keep data on 35,000+ customers?</legend>
          <div className={s.row}>
            <button type="button" className={s.chipBtn} aria-pressed={bigList === false} onClick={() => setBigList(false)}>
              No
            </button>
            <button type="button" className={s.chipBtn} aria-pressed={bigList === true} onClick={() => setBigList(true)}>
              Yes
            </button>
          </div>
        </fieldset>
      </div>
      <fieldset className={s.fieldsetBare}>
        <legend className={s.label}>What matters most?</legend>
        <div className={s.row}>
          {GOALS.map((g) => (
            <button key={g.key} type="button" className={s.chipBtn} aria-pressed={goals.includes(g.key)} onClick={() => setGoals((x) => toggle(x, g.key))}>
              {g.label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className={s.fieldsetBare}>
        <legend className={s.label}>Deal-breakers</legend>
        <div className={s.row}>
          {DEAL_BREAKERS.map((d) => (
            <button key={d.key} type="button" className={s.chipBtn} aria-pressed={breakers.includes(d.key)} onClick={() => setBreakers((x) => toggle(x, d.key))}>
              {d.label}
            </button>
          ))}
        </div>
      </fieldset>
      <label className={s.field}>
        <span className={s.label}>What eats most of your week?</span>
        <input className={s.input} value={timeSink} onChange={(e) => setTimeSink(e.target.value)} placeholder="e.g. writing quotes at night, chasing invoices" maxLength={300} />
      </label>
      <div>
        <button className={s.btn} type="submit" disabled={biz.busy !== null}>
          {biz.busy === "update" ? "Updating" : "Update my results"}
        </button>
      </div>
    </form>
  );
}

/** Spec 3.5: "Anything else?" — tap a problem the scan didn't find. Recorded as owner-reported. */
export function AddProblem({ biz }: { biz: LiveBusinessApi }) {
  const live = biz.live!;
  const shown = new Set(live.discovery.problems.filter((p) => p.status !== "hypothesis").map((p) => p.key));
  const options = (Object.keys(PROBLEMS) as ProblemKey[]).filter((k) => !shown.has(k));
  if (options.length === 0) return null;
  return (
    <section className={`${s.root} ${s.embedded} ${s.panel} ${s.pad} ${s.stack}`} style={{ gap: 12 }}>
      <div>
        <h3 className={s.h3}>Anything else?</h3>
        <p className={s.small}>Tap anything that happens at your business. It&apos;s added as something you told us.</p>
      </div>
      <div className={s.row}>
        {options.map((k) => (
          <button key={k} type="button" className={s.chipBtn} disabled={biz.busy !== null} onClick={() => void biz.confirmProblem(k)}>
            + {PROBLEMS[k].title}
          </button>
        ))}
      </div>
    </section>
  );
}
