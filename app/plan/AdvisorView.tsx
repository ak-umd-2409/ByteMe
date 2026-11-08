/**
 * The read-only plan an owner sends to their SBDC advisor (spec §5.4): who the business
 * is, what's holding it back and why we think so, what the owner told us, the 30-day
 * plan and what's worth talking through. No hooks, so it renders on the server too.
 */
import type { AdvisorView as View } from "@/lib/plan/share.ts";
import s from "../start/start.module.css";
import { FreeHelp, ReadyWords, Weeks } from "./parts.tsx";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export function AdvisorView({ view }: { view: View }) {
  const b = view.business;
  const facts: [string, string | null][] = [
    ["Address", b.address],
    ["Phone", b.phone],
    ["Website", b.website],
    ["Hours", b.hours],
  ];
  return (
    <>
      <header className={s.intro}>
        <span className={s.small}>Plan shared by the owner · made {day(view.createdAt)}</span>
        <h1 className={s.title}>{b.name}</h1>
        <p className={s.lead}>{b.subtitle}. The owner made this with MainStreet AI and shared it so you can look before you meet.</p>
        <span className={s.small}>
          Read-only.{view.expiresAt ? ` This link works until ${day(view.expiresAt)}.` : " This link holds the plan itself, so it doesn't expire."}
        </span>
      </header>

      <section className={s.card}>
        <div className={s.cardTop}>
          <h2 className={s.h3}>The business</h2>
        </div>
        <dl className={s.factList}>
          {facts.map(([k, val]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt>{k}</dt>
              <dd>{val ?? "Not found"}</dd>
            </div>
          ))}
        </dl>
      </section>

      {view.talkAbout.length > 0 && (
        <section className={s.card}>
          <div className={s.cardTop}>
            <h2 className={s.h3}>Worth talking through</h2>
          </div>
          <ul className={s.talk}>
            {view.talkAbout.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      )}

      <section className={s.card}>
        <div className={s.cardTop}>
          <h2 className={s.h3}>What's holding it back</h2>
          <span className={s.small}>From public reviews and listings, and what the owner told us. Most important first.</span>
        </div>
        {view.problems.length === 0 && <p>We didn't find a clear problem.</p>}
        <ol className={s.planList}>
          {view.problems.map((p) => (
            <li key={p.headline} className={s.optionText}>
              <b>
                {p.headline}
                <span className={s.weekChip}>{p.statusLabel}</span>
              </b>
              <span>{p.whyItMatters}</span>
              {p.evidence.map((e, i) => (
                <span key={i}>
                  {e.isQuote ? `“${e.text}”` : e.text} ·{" "}
                  {e.url ? (
                    <a href={e.url} target="_blank" rel="noreferrer">
                      {e.sourceLabel}
                    </a>
                  ) : (
                    e.sourceLabel
                  )}
                </span>
              ))}
              {p.impact && (
                <span className={s.hint}>
                  {p.impact.label}: {p.impact.math}
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      {(view.youToldUs.length > 0 || view.assumptions.length > 0) && (
        <section className={s.card}>
          <div className={s.cardTop}>
            <h2 className={s.h3}>What the owner told us</h2>
          </div>
          {view.youToldUs.length > 0 && (
            <dl className={s.factList}>
              {view.youToldUs.map((x) => (
                <div key={x.label} style={{ display: "contents" }}>
                  <dt>{x.label}</dt>
                  <dd>{x.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {view.assumptions.length > 0 && <p className={s.small}>Skipped, so we assumed: {view.assumptions.join(" ")}</p>}
        </section>
      )}

      <Weeks plan={view.plan} />

      <section className={s.card}>
        <div className={s.cardTop}>
          <h2 className={s.h3}>Every step</h2>
        </div>
        {view.plan.notes.map((n) => (
          <p key={n} className={s.banner}>
            {n}
          </p>
        ))}
        <ol className={s.planList}>
          {view.plan.sections.map((sec) => (
            <li key={sec.id} className={s.optionText}>
              <b>
                {sec.tool ? `${sec.tool.name}: ${sec.heading.toLowerCase()}` : sec.heading}
                <span className={s.weekChip}>{sec.summary}</span>
              </b>
              {sec.steps.map((st) => (
                <span key={st.id}>
                  Week {st.week > 4 ? "5+" : st.week} · {st.title}: {st.detail}
                  {st.link && (
                    <>
                      {" "}
                      <a href={st.link.url} target="_blank" rel="noreferrer">
                        {st.link.label}
                      </a>
                    </>
                  )}
                </span>
              ))}
            </li>
          ))}
        </ol>
      </section>

      <ReadyWords items={view.content} title="Words we wrote for the owner" />
      <FreeHelp plan={view.plan} />

      <p className={s.hint}>
        MainStreet AI doesn't connect to the owner's accounts or sell tools. Prices and rules come from public pages; confirm before buying. Not legal advice.
      </p>
    </>
  );
}
