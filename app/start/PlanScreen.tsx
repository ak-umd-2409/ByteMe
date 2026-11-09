"use client";

/**
 * Step 6 · Your plan (spec §5): the first 30 days week by week, free fixes first, then one
 * chosen tool per problem with its setup steps, words ready to copy, free help and money,
 * and a read-only link for the owner's SBDC advisor. Built by lib/plan (no AI). Printable.
 */
import { useEffect, useMemo, useState } from "react";
import type { CatalogRecord } from "@/lib/catalog/types.ts";
import type { JourneyAnswerResponse } from "@/lib/journey/types.ts";
import { readyContent } from "@/lib/plan/content.ts";
import { buildPlan, planText } from "@/lib/plan/plan.ts";
import type { ProblemKey } from "@/lib/problems/types.ts";
import type { RecommendationResult } from "@/lib/recommend/types.ts";
import { ToolLogo } from "@/components/ToolLogo.tsx";
import s from "./start.module.css";
import { SampleTag } from "./ToolScreens.tsx";
import { CopyButton } from "../plan/Copy.tsx";
import { FreeHelp, ReadyWords, Weeks } from "../plan/parts.tsx";

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
  back,
}: {
  answer: JourneyAnswerResponse;
  recs: RecommendationResult | null;
  catalog: CatalogRecord[];
  currentTools: string[];
  /** The owner asked for help setting tools up: show where to get it. */
  needsHelp?: boolean;
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

  // Everything else the owner told us, and problems from reviews, so the plan covers all of it.
  const extras = [...(answer.findings?.yours ?? []), ...(answer.findings?.noticed ?? [])]
    .filter((f) => !f.problemKey)
    .map((f) => ({ key: f.id.startsWith("yours-") ? `owner-${f.id.slice(6)}` : f.id, heading: f.title, firstStep: f.whatToDo, aiHow: f.ai && f.ai.level !== "no" ? f.ai.how : null }));
  const plan = buildPlan({ answer, choices, catalog, currentTools, extras });

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
  const toolProblems = [
    ...answer.opportunities.filter((o) => o.fix.kind !== "free" && (options[o.problemKey]?.length ?? 0) > 0).map((o) => ({ problemKey: o.problemKey as string, headline: o.headline })),
    ...extras.filter((x) => (options[x.key as ProblemKey]?.length ?? 0) > 0).map((x) => ({ problemKey: x.key, headline: x.heading })),
  ];
  const allSteps = plan.sections.flatMap((sec) => sec.steps.map((st) => st.id));
  const stepCount = allSteps.length;
  const doneCount = allSteps.filter((id) => done.has(id)).length;

  return (
    <>
      <header className={s.intro}>
        <h1 className={s.title}>Your plan for {plan.business}</h1>
        <p className={s.lead}>Your first 30 days: free fixes first, then one tool at a time. Print it, copy the ready-made words, or send it to a free advisor.</p>
        <span className={s.small}>
          {stepCount} {stepCount === 1 ? "step" : "steps"}
          {doneCount > 0 && ` · ${doneCount} done`}
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
                {options[o.problemKey as ProblemKey]!.map((opt) => {
                  const on = (choices as Record<string, string | undefined>)[o.problemKey] === opt.id;
                  return (
                    <button key={opt.id} type="button" className={s.chipsel} aria-pressed={on} onClick={() => setChoices((c) => ({ ...c, [o.problemKey]: opt.id }))}>
                      {on ? "✓ " : ""}
                      {opt.name} · {usd(opt.price)}/mo{byId.get(opt.id)?.sample ? " (sample)" : ""}
                    </button>
                  );
                })}
                <button type="button" className={s.chipsel} aria-pressed={!(choices as Record<string, string | undefined>)[o.problemKey]} onClick={() => setChoices((c) => ({ ...c, [o.problemKey]: undefined }))}>
                  {!(choices as Record<string, string | undefined>)[o.problemKey] ? "✓ " : ""}No tool for now
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

      <Weeks plan={plan} />

      <ol className={s.planList}>
        {plan.sections.map((sec, i) => (
          <li key={sec.id} className={s.card}>
            <div className={s.cardTop}>
              <span className={s.small}>
                {i + 1} · {sec.summary}
              </span>
              {sec.tool ? (
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <ToolLogo id={sec.tool.id} name={sec.tool.name} size={32} />
                  <h2 className={s.h3}>{sec.tool.name}</h2>
                </span>
              ) : (
                <h2 className={s.h3}>{sec.heading}</h2>
              )}
              {sec.tool && (
                <span className={s.row} style={{ gap: 6 }}>
                  <span className={s.small}>For: {sec.heading.toLowerCase()}</span>
                  {sec.tool.sample && <SampleTag />}
                </span>
              )}
            </div>
            <ul className={s.planSteps}>
              {sec.steps.map((st) => (
                <li key={st.id} className={done.has(st.id) ? s.stepDoneRow : undefined}>
                  <input type="checkbox" className={s.tick2} id={`step-${st.id}`} checked={done.has(st.id)} onChange={() => toggleDone(st.id)} aria-label={`Done: ${st.title}`} />
                  <span className={s.optionText}>
                    <b>
                      {st.title}
                      {st.minutes ? <span className={s.small}> · {st.minutes} min</span> : null}
                      <span className={s.weekChip}>{st.week > 4 ? "After day 30" : `Week ${st.week}`}</span>
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

      <ReadyWords items={words} />

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
