/**
 * The MainStreet AI homepage. Research behind every section: docs/RESEARCH.md.
 *
 * Trust rules: no testimonials or customer logos (we have no customers yet); every quote is
 * word for word, dated and linked, from people who are not our customers; every figure names
 * its survey; illustrative examples are labelled; no security or certification claims.
 */
import s from "../start/start.module.css";
import h from "./home.module.css";
import type { Example, HomeData } from "./data.ts";
import type { ToolCard } from "@/lib/advisor/types.ts";

const usd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const monthYear = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return d ? `${months[(m ?? 1) - 1]} ${d}, ${y}` : `${months[(m ?? 1) - 1]} ${y}`;
};

function Brand() {
  return (
    <a className={s.brand} href="/" style={{ textDecoration: "none" }} aria-label="MainStreet AI home">
      MainStreet AI
    </a>
  );
}

function NameForm({ id, cta = "Find AI opportunities for my business" }: { id: string; cta?: string }) {
  return (
    <form className={h.nameForm} action="/start" method="get" role="search" aria-label="Find your business">
      <div className={h.fields}>
        <label className={h.field}>
          <span>Your business name</span>
          <input id={`${id}-name`} name="q" required maxLength={120} placeholder="e.g. Frederick Heating" autoComplete="organization" />
        </label>
        <label className={`${h.field} ${h.town}`}>
          <span>Town (optional)</span>
          <input id={`${id}-town`} name="town" maxLength={80} placeholder="e.g. Frederick, MD" autoComplete="address-level2" />
        </label>
      </div>
      <button type="submit" className={h.primary}>
        {cta} <span aria-hidden="true">→</span>
      </button>
    </form>
  );
}

function ToolMini({ t }: { t: ToolCard }) {
  return (
    <div className={h.toolMini}>
      <span className={h.toolLogo} aria-hidden="true">
        {t.name.slice(0, 2).toUpperCase()}
      </span>
      <span className={h.toolText}>
        <b>{t.name}</b>
        <span>
          {t.category} · {t.monthlyUsd === null ? "price not public" : `from ${usd(t.monthlyUsd)}/mo`}
        </span>
      </span>
      <span className={h.verified}>✓ Checked</span>
    </div>
  );
}

function ExampleCard({ e }: { e: Example }) {
  return (
    <article className={h.example}>
      <div className={h.exampleHead}>
        <h3>{e.label}</h3>
        <span className={e.kind === "real" ? h.tagReal : h.tagIllustrative}>{e.kind === "real" ? "Real finding · public data" : "Illustrative"}</span>
      </div>
      <dl className={h.exampleList}>
        <dt>The problem</dt>
        <dd>{e.problem}</dd>
        <dt>What AI can do</dt>
        <dd>{e.aiCan}</dd>
        <dt>What stays human</dt>
        <dd>{e.keepHuman}</dd>
      </dl>
      {e.tool ? (
        <a className={h.exampleTool} href={`/tools/${e.tool.id}`}>
          <ToolMini t={e.tool} />
        </a>
      ) : (
        <p className={h.small}>{e.noTool}</p>
      )}
    </article>
  );
}

export function Home({ data }: { data: HomeData }) {
  const p = data.preview;
  return (
    <div className={`${s.app} ${h.home}`}>
      <a className={h.skip} href="#main">
        Skip to content
      </a>
      <header className={h.top}>
        <div className={h.topInner}>
          <Brand />
          <nav className={h.nav} aria-label="Main">
            <a href="#how">How it works</a>
            <a href="#trust">Why trust it</a>
            <a href="/tools">Checked tools</a>
            <a href="/advisor">Ask the advisor</a>
            <a className={h.navCta} href="/start">
              Get started
            </a>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* 1 · Hero */}
        <section className={h.hero} aria-labelledby="hero-title">
          <div className={h.heroCopy}>
            <span className={h.eyebrow}>For Maryland small businesses</span>
            <h1 id="hero-title" className={h.heroTitle}>
              Find the AI that actually <em>fits your business.</em>
            </h1>
            <p className={h.lead}>
              Type your business name. We read your public listing, website and reviews, show you what&apos;s costing you time or customers, and match you only with tools a person
              has checked. We&apos;ll also tell you when a free fix is enough.
            </p>
            <NameForm id="hero" />
            <p className={h.fine}>
              Free · about 3 minutes · no sign-up · <a href="/start?example=1">or see a real example first</a>
            </p>
          </div>

          {p && (
            <figure className={h.preview} aria-label={`A real result for ${p.name}, from saved public data`}>
              <div className={h.previewTop}>
                <span className={h.tagReal}>Real result · public data</span>
                <span className={h.small}>saved {monthYear(p.capturedAt)}</span>
              </div>
              <div className={h.previewBiz}>
                <b>{p.name}</b>
                <span>{p.subtitle}</span>
              </div>
              <div className={h.previewBlock}>
                <span className={h.kicker}>What we read</span>
                <ul className={h.learned}>
                  {p.learned.map((l) => (
                    <li key={l.text}>{l.text}</li>
                  ))}
                </ul>
              </div>
              <div className={h.previewBlock}>
                <span className={h.kicker}>What&apos;s holding it back</span>
                {p.problems.map((x) => (
                  <div key={x.headline} className={h.problem}>
                    <b>{x.headline}</b>
                    <span className={h.status}>{x.status}</span>
                    <span className={h.proof}>
                      {x.proof}
                      {x.source ? ` · ${x.source}` : ""}
                    </span>
                  </div>
                ))}
              </div>
              {p.fix && (
                <div className={h.previewBlock}>
                  <span className={h.kicker}>A checked fix for “{p.fix.problem.toLowerCase()}”</span>
                  <ToolMini t={p.fix.tool} />
                </div>
              )}
              <figcaption className={h.small}>This business isn&apos;t a customer. We saved its public details to show how a result looks.</figcaption>
            </figure>
          )}
        </section>

        {/* 2 · The problem, in owners' words */}
        <section className={h.section} aria-labelledby="problem-title">
          <div className={h.sectionHead}>
            <span className={h.eyebrow}>The problem</span>
            <h2 id="problem-title" className={h.h2}>
              Small businesses aren&apos;t short on AI. They&apos;re short on answers that fit.
            </h2>
            <p className={h.sub}>Owners told researchers the same things again and again: they don&apos;t know where to start, don&apos;t trust the answers, and don&apos;t want to lose the personal side of their business.</p>
          </div>
          <div className={h.figures}>
            {data.figures.map((f) => (
              <a key={f.id} className={h.figure} href={f.url} target="_blank" rel="noreferrer">
                <b>{f.value}</b>
                <span>{f.text}</span>
                <small>
                  {f.source}, {monthYear(f.date)} ↗
                </small>
              </a>
            ))}
          </div>
          <div className={h.quotes}>
            {data.quotes.map((q) => (
              <figure key={q.id} className={h.quote}>
                <span className={h.pain}>{q.pain}</span>
                <blockquote>“{q.quote}”</blockquote>
                <figcaption>
                  <b>{q.who}</b>
                  <span>{q.where}</span>
                  <a href={q.url} target="_blank" rel="noreferrer">
                    {q.outlet} · {monthYear(q.date)} · {q.type} ↗
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
          <p className={h.small}>
            Quotes are word for word from published research and news, checked {monthYear(data.researchChecked)}. None of these people are MainStreet AI customers.
          </p>
        </section>

        {/* 3 · How MainStreet AI helps */}
        <section className={h.section} aria-labelledby="helps-title">
          <div className={h.sectionHead}>
            <span className={h.eyebrow}>How MainStreet AI helps</span>
            <h2 id="helps-title" className={h.h2}>
              We start with your business, not with AI.
            </h2>
          </div>
          <div className={h.pillars}>
            <div className={h.pillar}>
              <span className={h.num}>01</span>
              <h3>Understand your business</h3>
              <p>We read what&apos;s already public: your Google listing, up to 6 website pages, reviews and the software your site uses. No long form.</p>
            </div>
            <div className={h.pillar}>
              <span className={h.num}>02</span>
              <h3>Find what&apos;s costing you</h3>
              <p>Missed calls, slow quotes, listings that disagree. Each problem shows its proof, and dollar figures use only numbers you give us.</p>
            </div>
            <div className={h.pillar}>
              <span className={h.num}>03</span>
              <h3>Tools a person has checked</h3>
              <p>Only tools that passed our safety checks and a human review, with real prices, what they work with, and what they do with your data.</p>
            </div>
            <div className={h.pillar}>
              <span className={h.num}>04</span>
              <h3>A plan you can follow</h3>
              <p>A 30-day plan with free fixes first, words ready to copy, and a link to send it to your free local SBDC advisor.</p>
            </div>
          </div>
        </section>

        {/* 4 · How it works */}
        <section id="how" className={h.section} aria-labelledby="how-title">
          <div className={h.sectionHead}>
            <span className={h.eyebrow}>How it works</span>
            <h2 id="how-title" className={h.h2}>
              About three minutes, start to plan.
            </h2>
          </div>
          <ol className={h.steps}>
            <li>
              <b>Find your business</b>
              <span>Type the name. Not listed? Add it by hand.</span>
            </li>
            <li>
              <b>Check what we found</b>
              <span>Every detail shows where it came from. Fix anything that&apos;s wrong.</span>
            </li>
            <li>
              <b>Answer up to 4 questions</b>
              <span>Only what we can&apos;t look up: budget, setup help, a yes or no on a few problems. Skip any of them.</span>
            </li>
            <li>
              <b>Get problems, fixes and a plan</b>
              <span>Then ask the advisor anything about your results.</span>
            </li>
          </ol>
        </section>

        {/* 5 · Trust and transparency */}
        <section id="trust" className={h.section} aria-labelledby="trust-title">
          <div className={h.sectionHead}>
            <span className={h.eyebrow}>Trust and transparency</span>
            <h2 id="trust-title" className={h.h2}>
              What we check, how we choose, and what we do with your information.
            </h2>
          </div>
          <div className={h.trust}>
            <div className={h.trustCol}>
              <h3>How a tool gets checked</h3>
              <ol>
                <li>Eight automatic checks: who&apos;s behind it, how long its website has existed, its privacy policy, what it does with your data, where data is kept, clear prices, security basics and red flags.</li>
                <li>A person reviews the results. Tools that copy a brand name or have no privacy policy are blocked.</li>
                <li>Every approved tool is due for a re-check every 90 days.</li>
              </ol>
              <p className={h.small}>
                {data.approved} real tools approved so far. <a href="/tools">See every one</a>.
              </p>
            </div>
            <div className={h.trustCol}>
              <h3>How we pick a recommendation</h3>
              <ul>
                <li>Only approved tools, never &quot;listed&quot; or blocked ones.</li>
                <li>Ranked by fit with your problem, whether it works with software you use, your budget, how hard it is to set up, and reviews.</li>
                <li>The same rules for every tool, shown in plain words on every pick.</li>
                <li>If no checked tool fits, we say so, and give you the free fix.</li>
              </ul>
            </div>
            <div className={h.trustCol}>
              <h3>Your information</h3>
              <ul>
                <li>We read only public information, plus what you choose to tell us.</li>
                <li>No account. Your answers stay with your browser session, not in a profile on our servers.</li>
                <li>A plan you choose to share is kept for 30 days. When AI features are on, we save AI answers about public pages for up to a week so we don&apos;t pay twice.</li>
                <li>We never log into your accounts. You sign up with each tool yourself.</li>
              </ul>
              <p className={h.small}>MainStreet AI is a student prototype. We hold no security certification and don&apos;t claim one.</p>
            </div>
          </div>
        </section>

        {/* 6 · Examples by industry */}
        <section className={h.section} aria-labelledby="examples-title">
          <div className={h.sectionHead}>
            <span className={h.eyebrow}>Examples</span>
            <h2 id="examples-title" className={h.h2}>
              What this looks like for businesses like yours.
            </h2>
            <p className={h.sub}>The HVAC example comes from a real business&apos;s public data. The others are illustrative. Every tool named is a real, checked tool with its published starting price.</p>
          </div>
          <div className={h.examples}>
            {data.examples.map((e) => (
              <ExampleCard key={e.key} e={e} />
            ))}
          </div>
        </section>

        {/* 7 · The advisor */}
        <section className={h.section} aria-labelledby="advisor-title">
          <div className={h.advisor}>
            <div className={h.advisorCopy}>
              <span className={h.eyebrow}>MainStreet Business Advisor</span>
              <h2 id="advisor-title" className={h.h2}>
                Ask anything. Get answers from checked tools, not guesses.
              </h2>
              <p className={h.sub}>
                The advisor knows your results, your budget and the software you use. It answers from our checked catalog with real prices, tells you what to keep human, and says
                when you don&apos;t need AI at all.
              </p>
              <div className={h.askList}>
                {["How can I use AI in my HVAC business?", "Can AI help me respond to customer enquiries?", "I don't understand AI. What should I start with?"].map((q) => (
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
                  {data.advisorSample.reply.answer.split(/\n{2,}/).slice(0, 2).map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                  {data.advisorSample.reply.tools.slice(0, 2).map((t) => (
                    <ToolMini key={t.id} t={t} />
                  ))}
                </div>
                <figcaption className={h.small}>A real answer for a heating and cooling business, from the advisor&apos;s rules and our checked catalog.</figcaption>
              </figure>
            )}
          </div>
        </section>

        {/* 8 · Final call to action */}
        <section className={h.final} aria-labelledby="final-title">
          <h2 id="final-title" className={h.h2}>
            See what&apos;s costing your business time or customers.
          </h2>
          <p className={h.sub}>Free, about three minutes, and nothing to install. You stay in charge of every step.</p>
          <NameForm id="final" />
        </section>
      </main>

      <footer className={h.footer}>
        <div className={h.footerInner}>
          <Brand />
          <nav aria-label="More">
            <a href="/tools">Checked tools</a>
            <a href="/advisor">Business Advisor</a>
            <a href="/submit">Make an AI tool? Apply to be listed</a>
            <a href="/admin">For reviewers</a>
          </nav>
          <p className={h.small}>Built by Team ByteMe, University of Maryland. A prototype, not affiliated with the Maryland SBDC, SCORE or any tool we list. Not legal advice.</p>
        </div>
      </footer>
    </div>
  );
}
