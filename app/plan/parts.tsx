/**
 * Plan pieces shared by the owner's plan (app/start/PlanScreen) and the advisor's
 * read-only copy (app/plan): the 30 days, ready-to-use words and free money and help.
 * No hooks here, so they render on the server too.
 */
import type { ReadyText } from "@/lib/plan/content.ts";
import type { Plan } from "@/lib/plan/plan.ts";
import s from "../start/start.module.css";
import t from "../start/tools.module.css";
import { CopyButton } from "./Copy.tsx";

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function Weeks({ plan }: { plan: Plan }) {
  if (!plan.weeks.length) return null;
  return (
    <section className={s.card} aria-labelledby="weeks-h">
      <div className={s.cardTop}>
        <h2 className={s.h3} id="weeks-h">
          Your first 30 days
        </h2>
        <span className={s.small}>Free fixes first, then one tool at a time, each checked two weeks after you set it up.</span>
      </div>
      <ol className={s.weeks}>
        {plan.weeks.map((w) => (
          <li key={w.week} className={s.week}>
            <b>{w.label}</b>
            <span className={s.small}>{w.steps.length === 0 ? "Nothing new: let the last change settle." : w.minutes ? `About ${w.minutes} minutes` : "Time depends on you"}</span>
            {w.steps.length > 0 && (
              <ul>
                {w.steps.map((st) => (
                  <li key={st.stepId}>
                    {st.tool ? `${st.tool}: ` : ""}
                    {st.title}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ReadyWords({ items, title = "Words ready to use" }: { items: ReadyText[]; title?: string }) {
  if (!items.length) return null;
  return (
    <section className={s.card} aria-labelledby="ready-h">
      <div className={s.cardTop}>
        <h2 className={s.h3} id="ready-h">
          {title}
        </h2>
        <span className={s.small}>Made from your business details. Fill in anything in [brackets] before you use it.</span>
      </div>
      <div className={s.ready}>
        {items.map((it) => (
          <div key={it.id} className={s.readyItem}>
            <div className={s.readyHead}>
              <span className={s.optionText}>
                <b>{it.title}</b>
                <span>{it.use}</span>
              </span>
              <CopyButton text={it.text} />
            </div>
            <p className={s.readyText}>{it.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function FreeHelp({ plan }: { plan: Plan }) {
  return (
    <section className={s.card} aria-labelledby="help-h">
      <div className={s.cardTop}>
        <h2 className={s.h3} id="help-h">
          Free help, money and classes
        </h2>
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
      {plan.resources.map((r) => (
        <a key={r.id} className={t.helpRow} href={r.url} target="_blank" rel="noreferrer">
          <b>
            {r.name}
            <span className={s.weekChip}>{r.kind === "money" ? "Money" : r.kind === "training" ? "Classes" : "Local"}</span>
          </b>
          <span>{r.detail}</span>
          <span className={t.chev} aria-hidden="true">
            ›
          </span>
        </a>
      ))}
      <p className={s.hint}>
        Links checked {shortDate(plan.resourcesChecked)}. Programs change, so check you qualify on each page. We don't apply for anything for you.
      </p>
    </section>
  );
}
