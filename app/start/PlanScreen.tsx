"use client";

/**
 * Step 6 · Your plan (spec §5): the first 30 days week by week, free fixes first, then one
 * chosen tool per problem with its setup steps, words ready to copy, free help and money,
 * and a read-only link for the owner's SBDC advisor. Built by lib/plan (no AI). Printable.
 */
import { useEffect, useMemo, useState } from "react";
import type { CatalogRecord } from "@/lib/catalog/types.ts";
import type { ImpactView, JourneyAnswerResponse } from "@/lib/journey/types.ts";
import { readyContent } from "@/lib/plan/content.ts";
import { buildPlan, PHASE_LABEL, planText } from "@/lib/plan/plan.ts";
import type { ProblemKey } from "@/lib/problems/types.ts";
import type { RecommendationResult } from "@/lib/recommend/types.ts";
import { ToolLogo } from "@/components/ToolLogo.tsx";
import s from "./start.module.css";
import { SampleTag } from "./ToolScreens.tsx";
import { CostPayback } from "./CostPayback.tsx";
import d from "./dash.module.css";
import { breakEven } from "@/lib/plan/roi.ts";
import { INDUSTRIES } from "@/lib/business/industry.ts";
import { CostTable } from "../plan/CostTable.tsx";
import { costSummary } from "@/lib/plan/roi.ts";
import { CopyButton } from "../plan/Copy.tsx";
import { FreeHelp, ReadyWords } from "../plan/parts.tsx";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const keyOf = (problemId: string) => problemId.replace(/^problem-/, "") as ProblemKey;
const hours = (min: number) => (min < 60 ? `${min} minutes` : `${Math.round((min / 60) * 2) / 2} hours`);

export function PlanScreen({
  answer,
  recs,
  catalog,
  currentTools,
  needsHelp = false,
  chosenTools = {},
  back,
}: {
  answer: JourneyAnswerResponse;
  recs: RecommendationResult | null;
  catalog: CatalogRecord[];
  currentTools: string[];
  /** The owner asked for help setting tools up: show where to get it. */
  needsHelp?: boolean;
  /** What the owner chose on the tools screen (Part 4 problem id → tool id). Empty = suggest the best fit. */
  chosenTools?: Record<string, string>;
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
  const fromToolsScreen = Object.keys(chosenTools).length > 0;
  const [choices, setChoices] = useState<Partial<Record<ProblemKey, string>>>(() =>
    fromToolsScreen
      ? // Exactly what the owner chose; everything else starts with its free first step.
        Object.fromEntries(Object.entries(chosenTools).map(([id, tool]) => [keyOf(id), tool]))
      : Object.fromEntries(Object.entries(options).map(([k, list]) => [k, list?.[0]?.id]).filter(([, v]) => v)),
  );

  // Everything else the owner told us, and problems from reviews, so the plan covers all of it.
  const extraKey = (id: string) => (id.startsWith("yours-") ? `owner-${id.slice(6)}` : id.startsWith("noticed-ri") ? `issue-${id.slice(8)}` : id);
  const ownFindings = [...(answer.findings?.yours ?? []), ...(answer.findings?.noticed ?? [])].filter((f) => !f.problemKey);
  const extras = ownFindings.map((f) => ({ key: extraKey(f.id), heading: f.title, firstStep: f.whatToDo, aiHow: f.ai && f.ai.level !== "no" ? f.ai.how : null }));
  // What each problem costs the owner (only when they gave the numbers), by plan section, for the payback card.
  const impactFor: Record<string, ImpactView | null> = {
    ...Object.fromEntries(ownFindings.map((f) => [`tool-${extraKey(f.id)}`, f.impact])),
    ...Object.fromEntries(answer.opportunities.map((o) => [`tool-${o.problemKey}`, o.impact])),
  };
  // Kit tools that don't match one of the problems still go in the plan, as their own section.
  for (const [id, tool] of Object.entries(chosenTools)) {
    if (!id.startsWith("kit-")) continue;
    const r = catalog.find((x) => x.id === tool);
    if (r) extras.push({ key: id, heading: `${r.category} (starter kit)`, firstStep: null, aiHow: null });
  }
  const plan = buildPlan({ answer, choices, catalog, currentTools, extras, needsHelp });

  // Ticked steps, remembered in this browser for this business.
  const doneKey = `mainstreet.plan.done.${plan.business}`;
  const [done, setDone] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      setDone(new Set(JSON.parse(localStorage.getItem(doneKey) ?? "[]") as string[]));
    } catch {
      /* storage blocked: ticks just won't be remembered */
    }
  }, [doneKey]);
  const toggleDone = (id: string) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(doneKey, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  const words = readyContent(answer.business, plan, catalog);
  const [share, setShare] = useState<{ url: string; stored: boolean; expiresAt: string | null } | { error: string } | "busy" | null>(null);
  // A link shows the plan as it was when made: changing a tool means making a new one.
  useEffect(() => setShare(null), [choices]);
  // A printed or saved PDF shows every "How we calculated this" and "Change the assumptions" box open.
  useEffect(() => {
    const open = () => document.querySelectorAll("main details").forEach((d) => ((d as HTMLDetailsElement).open = true));
    window.addEventListener("beforeprint", open);
    return () => window.removeEventListener("beforeprint", open);
  }, []);

  async function makeLink() {
    setShare("busy");
    try {
      const res = await fetch("/api/plan/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ context: answer.context, choices: Object.fromEntries(Object.entries(choices).filter(([, v]) => v)), currentTools }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "We couldn't make a link.");
      setShare({ url: new URL(body.path, window.location.origin).toString(), stored: body.stored, expiresAt: body.expiresAt });
    } catch (e) {
      setShare({ error: e instanceof Error ? e.message : "We couldn't make a link." });
    }
  }
  const link = share && typeof share === "object" && "url" in share ? share : null;
  const advisor = plan.help[0]!;
  const mail = (subject: string, body: string) => `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const allSteps = plan.sections.flatMap((sec) => sec.steps.map((st) => st.id));
  const stepCount = allSteps.length;
  const doneCount = allSteps.filter((id) => done.has(id)).length;
  // Dashboard summary (presentation only: the same plan, costs and break-even as below).
  const costs = costSummary(plan, catalog);
  const industryName = answer.recommendation.ready ? answer.recommendation.request.business.industry.trim().toLowerCase() : "";
  const typical = Object.values(INDUSTRIES).find((i) => i.key === industryName || i.label.toLowerCase() === industryName) ?? INDUSTRIES.other;
  const be = costs.tools.length ? breakEven(costs.totals.monthly, typical.defaults.averageJobValue, typical.defaults.hourlyValueOfOwnerTime, 0) : null;
  const stepById = new Map(plan.sections.flatMap((sec) => sec.steps.map((st) => [st.id, { st, sec }] as const)));

  return (
    <>
      <section hidden className={cx(s.card, s.printShow)} aria-label="Report cover">
        <span className={s.small}>Technology plan · prepared {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} with MainStreet AI</span>
        <b>{plan.business}</b>
        <span className={s.small}>
          Problems: {plan.sections.map((sec) => sec.heading).join("; ") || "none listed"}.
          {" "}Tools: {costSummary(plan, catalog).tools.map((t) => t.name).join(", ") || "none yet"}.
        </span>
        <span className={s.small}>Prices come from each company&apos;s own pricing page, checked on the date shown. Savings are estimates, not promises. Not legal or financial advice.</span>
      </section>
      <header className={s.intro}>
        <h1 className={s.title}>Your plan for {plan.business}</h1>
        <p className={s.lead}>Free fixes first, then one tool at a time. Print it, copy the ready-made words, or send it to a free advisor.</p>
        <span className={s.small}>
          {stepCount} {stepCount === 1 ? "step" : "steps"}
          {doneCount > 0 && ` · ${doneCount} done`}
          {plan.totals.monthly > 0 && ` · ${usd(plan.totals.monthly)} a month${plan.totals.unknownPrices ? " plus prices that aren't public" : ""}`}
          {plan.totals.setupMinutes > 0 && ` · about ${hours(plan.totals.setupMinutes)} of setup`}
        </span>
      </header>

      <section className={d.stats} aria-label="Plan at a glance">
        <div className={d.stat}><small>Problems</small><b>{plan.sections.filter((sec) => !sec.id.includes("kit-")).length}</b></div>
        <div className={d.stat}><small>Tools</small><b>{costs.tools.length}</b><small>{costs.tools.length ? costs.tools.map((x) => x.name).join(", ") : "None yet"}</small></div>
        <div className={d.stat}><small>Each month · first year</small><b>{usd(costs.totals.monthly)}</b><small>{usd(costs.totals.firstYear)} first year</small></div>
        <div className={d.stat}><small>Breaks even at</small><b>{be ? be.customers : "—"}</b><small>{be ? `extra ${be.customers === 1 ? "customer" : "customers"} a month (typical order)` : "no paid tools"}</small></div>
        <div className={d.stat}><small>Steps done</small><b>{doneCount} / {stepCount}</b></div>
      </section>

      <p className={cx(s.small, s.noPrint)}>
        Want a different tool?{" "}
        <button type="button" className={s.link} style={{ padding: 0, minHeight: 0 }} onClick={back}>
          Change it on the tools screen
        </button>
      </p>

      <div className={d.grid}>
      <div className={d.main}>
      {plan.notes.length > 0 && (
        <div className={s.banner}>
          {plan.notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      )}

      {plan.weeks.map((w, wi) => {
        const rows = w.steps.map((x) => stepById.get(x.stepId)).filter((x): x is NonNullable<typeof x> => Boolean(x));
        const phaseDone = rows.filter((x) => done.has(x.st.id)).length;
        return (
          <details key={w.week} className={d.phase} open={wi < 2}>
            <summary>
              <h2 className={s.h3}>{w.label}</h2>
              <span className={d.count}>{phaseDone} / {rows.length} done</span>
              {w.minutes > 0 && <span className={s.small}>about {w.minutes} min</span>}
            </summary>
            <div className={d.phaseBody}>
              <ul className={s.planSteps}>
                {rows.map(({ st, sec }) => (
                  <li key={st.id} className={done.has(st.id) ? s.stepDoneRow : undefined}>
                    <input type="checkbox" className={s.tick2} id={`step-${st.id}`} checked={done.has(st.id)} onChange={() => toggleDone(st.id)} aria-label={`Done: ${st.title}`} />
                    <span className={s.optionText}>
                      <span className={s.small} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {sec.tool && <ToolLogo id={sec.tool.id} name={sec.tool.name} size={20} />}
                        {sec.tool ? `${sec.tool.name} · for ${sec.heading.toLowerCase()}` : sec.heading}
                        {sec.tool?.sample && <SampleTag />}
                      </span>
                      <b>
                        {st.title}
                        {st.minutes ? <span className={s.small}> · {st.minutes} min</span> : null}
                      </b>
                      <span>{st.detail}</span>
                      {st.who && <span className={s.small}>Who: {st.who}</span>}
                      {st.outcome && <span className={s.small}>{/^Test:/.test(st.outcome) ? st.outcome : `Done when: ${st.outcome}`}</span>}
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
            </div>
          </details>
        );
      })}
      </div>

      <div className={d.side}>
      <CostPayback plan={plan} catalog={catalog} impactFor={impactFor} industry={answer.recommendation.ready ? answer.recommendation.request.business.industry : null} />

      <ReadyWords items={words} />

      <div hidden className={s.printShow}>
        <CostTable costs={costSummary(plan, catalog)} title="Sources and prices" />
      </div>

      <section className={cx(s.card, s.noPrint)} aria-labelledby="send-h">
        <div className={s.cardTop}>
          <h2 className={s.h3} id="send-h">
            Share your plan
          </h2>
          <span className={s.small}>
            Send it to yourself, or to someone helping you. {advisor.name} advises for free{advisor.phone ? ` (${advisor.phone})` : ""}: send them the link so they can look before you meet.
          </span>
        </div>
        <div className={s.shareBox}>
          {!link && (
            <button type="button" className={cx(s.btn, s.primary)} style={{ justifySelf: "start" }} onClick={makeLink} disabled={share === "busy"}>
              {share === "busy" ? "Making your link…" : "Make a link to share"}
            </button>
          )}
          {share && typeof share === "object" && "error" in share && <p className={s.banner}>{share.error}</p>}
          {link && (
            <>
              <div className={s.shareLink}>
                <input readOnly value={link.url} aria-label="Link to your plan" onFocus={(e) => e.currentTarget.select()} />
                <CopyButton text={link.url} label="Copy link" />
                <a
                  className={cx(s.btn, s.primary)}
                  href={mail(`My plan for ${plan.business}`, `Hi,\n\nI'd like help with my business, ${plan.business}. Here's the plan I made with MainStreet AI, so you can look before we meet:\n\n${link.url}\n\nThank you!`)}
                >
                  Email it to my advisor
                </a>
              </div>
              <p className={s.hint}>
                {link.stored && link.expiresAt
                  ? `Read-only. Anyone with the link can see it until ${new Date(link.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}.`
                  : "Read-only. This link holds your whole plan, so it's long: if an email cuts it off, print the plan and bring it instead."}
              </p>
            </>
          )}
        </div>
        <a className={s.link} style={{ justifySelf: "start", paddingLeft: 0 }} href={mail(`My plan for ${plan.business}`, planText(plan, link?.stored ? link.url : null))}>
          Email the plan to myself
        </a>
      </section>

      {needsHelp && <FreeHelp plan={plan} title="Find help setting this up" />}
      </div>
      </div>

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
