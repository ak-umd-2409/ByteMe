"use client";

/**
 * Step 6 · Your plan (spec §5.1, 5.2, 5.5): free fixes first, then one chosen tool per
 * problem with its setup steps, then who helps. Built by lib/plan (no AI). Printable.
 */
import { useMemo, useState } from "react";
import type { CatalogRecord } from "@/lib/catalog/types.ts";
import type { JourneyAnswerResponse } from "@/lib/journey/types.ts";
import { buildPlan } from "@/lib/plan/plan.ts";
import type { ProblemKey } from "@/lib/problems/types.ts";
import type { RecommendationResult } from "@/lib/recommend/types.ts";
import s from "./start.module.css";
import t from "./tools.module.css";
import { SampleTag } from "./ToolScreens.tsx";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const keyOf = (problemId: string) => problemId.replace(/^problem-/, "") as ProblemKey;
const hours = (min: number) => (min < 60 ? `${min} minutes` : `${Math.round((min / 60) * 2) / 2} hours`);

export function PlanScreen({
  answer,
  recs,
  catalog,
  currentTools,
  back,
}: {
  answer: JourneyAnswerResponse;
  recs: RecommendationResult | null;
  catalog: CatalogRecord[];
  currentTools: string[];
  back: () => void;
}) {
  const byId = new Map(catalog.map((r) => [r.id, r]));
  // For each problem: the tools the engine recommended (best fit first), Verified only.
  const options = useMemo(() => {
    const out: Partial<Record<ProblemKey, { id: string; name: string; price: number }[]>> = {};
    for (const p of recs?.problems ?? []) {
      const seen = new Set<string>();
      out[keyOf(p.problem.id)] = p.options
        .filter((o) => o.kind !== "starter-kit")
        .flatMap((o) => o.choices)
        .filter((c) => c.tool.status === "verified" && !seen.has(c.tool.id) && seen.add(c.tool.id))
        .map((c) => ({ id: c.tool.id, name: c.tool.name, price: c.tool.monthlyPrice }));
    }
    return out;
  }, [recs]);
  const [choices, setChoices] = useState<Partial<Record<ProblemKey, string>>>(() =>
    Object.fromEntries(Object.entries(options).map(([k, list]) => [k, list?.[0]?.id]).filter(([, v]) => v)),
  );

  const plan = buildPlan({ answer, choices, catalog, currentTools });
  const toolProblems = answer.opportunities.filter((o) => o.fix.kind !== "free" && (options[o.problemKey]?.length ?? 0) > 0);
  const stepCount = plan.sections.reduce((n, sec) => n + sec.steps.length, 0);

  return (
    <>
      <header className={s.intro}>
        <h1 className={s.title}>Your plan for {plan.business}</h1>
        <p className={s.lead}>Free fixes first, then one tool at a time. Print it, or take it to a free advisor if you'd like help.</p>
        <span className={s.small}>
          {stepCount} steps
          {plan.totals.monthly > 0 && ` · ${usd(plan.totals.monthly)} a month${plan.totals.unknownPrices ? " plus prices that aren't public" : ""}`}
          {plan.totals.setupMinutes > 0 && ` · about ${hours(plan.totals.setupMinutes)} of setup`}
        </span>
      </header>

      {toolProblems.length > 0 && (
        <section className={cx(s.card, s.noPrint)}>
          <div className={s.cardTop}>
            <h2 className={s.h3}>Pick one fix for each problem</h2>
            <span className={s.small}>Best fit first. Only ✓ Verified tools.</span>
          </div>
          {toolProblems.map((o) => (
            <div className={s.checkRow} key={o.problemKey}>
              <span className={s.optionText}>
                <b>{o.headline}</b>
              </span>
              <div className={s.row}>
                {options[o.problemKey]!.map((opt) => {
                  const on = choices[o.problemKey] === opt.id;
                  return (
                    <button key={opt.id} type="button" className={s.chipsel} aria-pressed={on} onClick={() => setChoices((c) => ({ ...c, [o.problemKey]: opt.id }))}>
                      {on ? "✓ " : ""}
                      {opt.name} · {usd(opt.price)}/mo{byId.get(opt.id)?.sample ? " (sample)" : ""}
                    </button>
                  );
                })}
                <button type="button" className={s.chipsel} aria-pressed={!choices[o.problemKey]} onClick={() => setChoices((c) => ({ ...c, [o.problemKey]: undefined }))}>
                  {!choices[o.problemKey] ? "✓ " : ""}Decide later
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {plan.notes.length > 0 && (
        <div className={s.banner}>
          {plan.notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      )}

      <ol className={s.planList}>
        {plan.sections.map((sec, i) => (
          <li key={sec.id} className={s.card}>
            <div className={s.cardTop}>
              <span className={s.small}>
                {i + 1} · {sec.summary}
              </span>
              <h2 className={s.h3}>{sec.tool ? sec.tool.name : sec.heading}</h2>
              {sec.tool && (
                <span className={s.row} style={{ gap: 6 }}>
                  <span className={s.small}>For: {sec.heading.toLowerCase()}</span>
                  {sec.tool.sample && <SampleTag />}
                </span>
              )}
            </div>
            <ul className={s.planSteps}>
              {sec.steps.map((st) => (
                <li key={st.id}>
                  <span className={s.box} aria-hidden="true" />
                  <span className={s.optionText}>
                    <b>
                      {st.title}
                      {st.minutes ? <span className={s.small}> · {st.minutes} min</span> : null}
                    </b>
                    <span>{st.detail}</span>
                    {st.why && <span className={s.hint}>{st.why}</span>}
                    {st.link && (
                      <a href={st.link.url} target="_blank" rel="noreferrer">
                        {st.link.label} ↗
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <section className={s.card}>
        <div className={s.cardTop}>
          <h2 className={s.h3}>Free help with any of this</h2>
        </div>
        {plan.help.map((h) => (
          <a key={h.name} className={t.helpRow} href={h.url} target="_blank" rel="noreferrer">
            <b>{h.name}</b>
            <span>
              {h.detail}
              {h.phone ? ` · ${h.phone}` : ""}
            </span>
            <span className={t.chev} aria-hidden="true">
              ›
            </span>
          </a>
        ))}
      </section>

      <p className={s.hint}>
        Estimates and prices come from public pages checked on the dates shown on each tool. Confirm prices with the company before you buy. Not legal advice.
      </p>

      <div className={cx(s.actionBar, s.noPrint)}>
        <button type="button" className={s.link} onClick={back}>
          ‹ Back to ways to fix it
        </button>
        <button type="button" className={cx(s.btn, s.primary)} onClick={() => window.print()}>
          Print or save as PDF
        </button>
      </div>
    </>
  );
}
