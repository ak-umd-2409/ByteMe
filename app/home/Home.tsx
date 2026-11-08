/**
 * The MainStreet AI homepage. Research behind every section: docs/RESEARCH.md; design
 * direction: docs/AUDIT.md §10.
 *
 * Trust rules: no testimonials or customer logos (we have no customers yet); every quote is
 * word for word, dated and linked, from people who are not our customers; every figure names
 * its survey; illustrative examples are labelled; no security or certification claims.
 */
import s from "../start/start.module.css";
import { SiteFooter, SiteHeader } from "../ui/Site.tsx";
import { SiteAdvisor } from "../ui/SiteAdvisor.tsx";
import type { Figure, HomeData, Quote } from "./data.ts";
import h from "./home.module.css";
import { IndustryTabs } from "./IndustryTabs.tsx";
import { ToolMini } from "./ToolMini.tsx";

const monthYear = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return d ? `${months[(m ?? 1) - 1]} ${d}, ${y}` : `${months[(m ?? 1) - 1]} ${y}`;
};

/** Each owner worry: a survey figure, one owner's own words, and what we do about it. */
const PAINS: { title: string; figure: string; quote: string; answer: string }[] = [
  { title: "“Where do I even start?”", figure: "fed-finding-tools", quote: "sbcs-nobody-to-teach", answer: "We start from your business and give you one first step." },
  { title: "“Is AI even for a business like mine?”", figure: "fed-not-applicable", quote: "bitar-lose", answer: "Every fix says what stays human, and when a free fix is enough." },
  { title: "“Can I trust it?”", figure: "fed-accuracy", quote: "sbcs-confidential", answer: "Only tools a person has checked, with sources and what each does with your data." },
];

function NameForm({ id, cta = "Find AI opportunities for my business" }: { id: string; cta?: string }) {
  return (
    <form className={h.nameForm} action="/start" method="get" role="search" aria-label="Find your business">
      <label className={h.field}>
        <span className={s.sr}>Your business name</span>
        <input id={`${id}-name`} name="q" required maxLength={120} placeholder="Your business name" autoComplete="organization" />
      </label>
      <label className={`${h.field} ${h.town}`}>
        <span className={s.sr}>Town (optional)</span>
        <input id={`${id}-town`} name="town" maxLength={80} placeholder="Town (optional)" autoComplete="address-level2" />
      </label>
      <button type="submit" className={h.primary}>
        {cta} <span aria-hidden="true">→</span>
      </button>
    </form>
  );
}

function PainCard({ title, f, q, answer }: { title: string; f: Figure | undefined; q: Quote | undefined; answer: string }) {
  return (
    <article className={h.pain}>
      <h3>{title}</h3>
      {f && (
        <a className={h.stat} href={f.url} target="_blank" rel="noreferrer">
          <b>{f.value}</b>
          <span>{f.text}</span>
          <small>
            Research insight · {f.source}, {monthYear(f.date)} ↗
          </small>
        </a>
      )}
      {q && (
        <figure className={h.quote}>
          <blockquote>“{q.quote}”</blockquote>
          <figcaption>
            <a href={q.url} target="_blank" rel="noreferrer">
              {q.who}, {q.outlet}, {monthYear(q.date)} ↗
            </a>
          </figcaption>
        </figure>
      )}
      <p className={h.answer}>
        <span aria-hidden="true">→</span> {answer}
      </p>
    </article>
  );
}

export function Home({ data }: { data: HomeData }) {
  const p = data.preview;
  const fig = (id: string) => data.figures.find((x) => x.id === id);
  const quo = (id: string) => data.quotes.find((x) => x.id === id);
  return (
    <div className={`${s.app} ${h.home}`}>
      <a className={h.skip} href="#main">
        Skip to content
      </a>
      <SiteHeader current="home" />

      <main id="main">
        {/* Hero: what it is, one action, trust, and the real product */}
        <section className={h.hero} aria-labelledby="hero-title">
          <div className={h.heroCopy}>
            <span className={h.eyebrow}>For Maryland small businesses</span>
            <h1 id="hero-title" className={h.heroTitle}>
              Find the AI that actually <em>fits</em> your business.
            </h1>
            <p className={h.lead}>We read your public listing, website and reviews, show what&apos;s costing you customers, and match you only with tools a person has checked.</p>
            <NameForm id="hero" />
            <p className={h.fine}>
              Free · about 3 minutes · <a href="/start?example=1">See a real example</a>
            </p>
            <ul className={h.trustRow} aria-label="Why you can trust it">
              <li>
                <b>{data.approved}</b>&nbsp;tools checked by a person
              </li>
              <li>Vendor prices, never guessed</li>
              <li>No sign-up</li>
            </ul>
          </div>

          {p && (
            <figure className={h.preview} aria-label={`A real result for ${p.name}, from saved public data`}>
              <div className={h.previewBar}>
                <span className={h.dots} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span>Your results</span>
                <span className={h.tagReal}>Real · public data</span>
              </div>
              <div className={h.previewBody}>
                <div className={h.previewBiz}>
                  <b>{p.name}</b>
                  <span>{p.subtitle}</span>
                </div>
                <span className={h.kicker}>What&apos;s holding it back</span>
                {p.problems.map((x, k) => (
                  <div key={x.headline} className={h.problem}>
                    <span className={h.rank}>{k + 1}</span>
                    <span className={h.problemText}>
                      <b>{x.headline}</b>
                      <span>{x.source ? `Proof: ${x.source}` : x.proof}</span>
                    </span>
                    <span className={h.status}>{x.status}</span>
                  </div>
                ))}
                {p.fix && (
                  <>
                    <span className={h.kicker}>Checked fix</span>
                    <ToolMini t={p.fix.tool} />
                  </>
                )}
              </div>
              <figcaption className={h.caption}>Saved {monthYear(p.capturedAt)} from public pages. This business isn&apos;t a customer.</figcaption>
            </figure>
          )}
        </section>

        {/* Pain points, from research */}
        <section className={h.section} aria-labelledby="pain-title">
          <div className={h.sectionHead}>
            <span className={h.eyebrow}>Why owners get stuck</span>
            <h2 id="pain-title" className={h.h2}>
              Owners aren&apos;t short on AI. They&apos;re short on answers that fit.
            </h2>
          </div>
          <div className={h.pains}>
            {PAINS.map((x) => (
              <PainCard key={x.title} title={x.title} f={fig(x.figure)} q={quo(x.quote)} answer={x.answer} />
            ))}
          </div>
          <p className={h.small}>Quotes are word for word from published research and news, checked {monthYear(data.researchChecked)}. None of these people are our customers.</p>
        </section>

        {/* How it works */}
        <section id="how" className={h.section} aria-labelledby="how-title">
          <div className={h.sectionHead}>
            <span className={h.eyebrow}>How it works</span>
            <h2 id="how-title" className={h.h2}>
              Three steps. About three minutes.
            </h2>
          </div>
          <ol className={h.steps}>
            <li>
              <span className={h.stepIcon} aria-hidden="true">
                1
              </span>
              <b>Type your business name</b>
              <span>We find your listing, website and reviews.</span>
            </li>
            <li>
              <span className={h.stepIcon} aria-hidden="true">
                2
              </span>
              <b>Check what we found</b>
              <span>Every fact shows its source. Answer up to four quick questions.</span>
            </li>
            <li>
              <span className={h.stepIcon} aria-hidden="true">
                3
              </span>
              <b>Get your 30-day plan</b>
              <span>Free fixes first, checked tools next, words ready to copy.</span>
            </li>
          </ol>
        </section>

        {/* Examples by industry (interactive) */}
        <section className={h.section} aria-labelledby="examples-title">
          <div className={h.sectionHead}>
            <span className={h.eyebrow}>Examples</span>
            <h2 id="examples-title" className={h.h2}>
              See it for your kind of business.
            </h2>
          </div>
          <IndustryTabs examples={data.examples} />
        </section>

        {/* The advisor */}
        <section className={h.section} aria-labelledby="advisor-title">
          <div className={h.advisor}>
            <div className={h.advisorCopy}>
              <span className={h.eyebrow}>
                <span aria-hidden="true">✳</span> Business Advisor
              </span>
              <h2 id="advisor-title" className={h.h2}>
                A personal advisor that knows your business.
              </h2>
              <p className={h.sub}>It knows your results, budget and software, and answers only from checked tools. Ask from the button in the corner, on any page.</p>
              <div className={h.askList}>
                {["I have $100 a month. What should I do first?", "Can AI answer calls after hours?", "I don't understand AI. Where do I start?"].map((q) => (
                  <a key={q} className={h.ask} href={`/advisor?q=${encodeURIComponent(q)}`}>
                    {q} <span aria-hidden="true">→</span>
                  </a>
                ))}
              </div>
            </div>
            {data.advisorSample && (
              <figure className={h.chatSample} aria-label="A real answer from the advisor">
                <div className={h.chatQ}>{data.advisorSample.question}</div>
                <div className={h.chatA}>
                  <p>{data.advisorSample.reply.answer.split(/\n{2,}/)[0]}</p>
                  {data.advisorSample.reply.tools.slice(0, 2).map((t) => (
                    <ToolMini key={t.id} t={t} />
                  ))}
                </div>
                <figcaption className={h.caption}>A real answer for a heating and cooling business.</figcaption>
              </figure>
            )}
          </div>
        </section>

        {/* Trust strip */}
        <section id="trust" className={h.section} aria-labelledby="trust-title">
          <div className={h.sectionHead}>
            <span className={h.eyebrow}>Trust</span>
            <h2 id="trust-title" className={h.h2}>
              How a tool earns a place here.
            </h2>
          </div>
          <ul className={h.trust}>
            <li>
              <b>8</b>
              <span>automatic checks: owner, privacy policy, data use, prices, security basics, red flags</span>
            </li>
            <li>
              <b>100%</b>
              <span>of recommended tools approved by a person, not just a script</span>
            </li>
            <li>
              <b>90</b>
              <span>days between re-checks, with the date shown on every tool</span>
            </li>
            <li>
              <b>0</b>
              <span>accounts, logins or profiles. You sign up with each tool yourself</span>
            </li>
          </ul>
          <p className={h.small}>
            Same rules for every tool, and if none fits, we say so. <a href="/tools">See all {data.approved} checked tools</a>. A student prototype with no security certification.
          </p>
        </section>

        {/* Closing CTA */}
        <section className={h.final} aria-labelledby="final-title">
          <h2 id="final-title" className={h.h2}>
            See what&apos;s costing your business customers.
          </h2>
          <NameForm id="final" />
        </section>
      </main>

      <SiteFooter />
      <SiteAdvisor />
    </div>
  );
}
