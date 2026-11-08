"use client";

/**
 * MainStreet Business Advisor (docs/ADVISOR.md). One conversation component, used full-page at
 * /advisor and as a side panel inside the guided journey. Answers come from /api/advisor, which
 * uses only the owner's results and the checked catalog. Nothing is stored: the conversation
 * lives in this component and disappears when the page closes.
 */
import { useEffect, useRef, useState } from "react";
import { starters } from "@/lib/advisor/compose.ts";
import type { AdvisorReply, AdvisorTurn, ToolCard } from "@/lib/advisor/types.ts";
import a from "./advisor.module.css";

export type Known = { business?: string | null; industry?: string | null; firstProblem?: string | null; budget?: number | null };

type Message = { role: "owner"; text: string } | { role: "advisor"; reply: AdvisorReply } | { role: "error"; text: string };

const INDUSTRIES: [string, string][] = [
  ["hvac", "Heating, cooling, plumbing"],
  ["restaurant", "Restaurant or café"],
  ["salon", "Salon or spa"],
  ["retail", "Retail shop"],
  ["professional_services", "Office or services"],
  ["other", "Something else"],
];

const usd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const day = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

function Tool({ t }: { t: ToolCard }) {
  return (
    <article className={a.tool}>
      <div className={a.toolHead}>
        <span className={a.toolLogo} aria-hidden="true">
          {t.name.slice(0, 2).toUpperCase()}
        </span>
        <div className={a.toolName}>
          <b>{t.name}</b>
          <span>{t.category}</span>
        </div>
        <span className={a.toolPrice}>
          {t.monthlyUsd === null ? (
            <small>Price not public</small>
          ) : (
            <>
              {usd(t.monthlyUsd)}
              <small>/mo</small>
            </>
          )}
        </span>
      </div>
      <p className={a.toolWhat}>{t.what}</p>
      {(t.alreadyHave || t.worksWithYours.length > 0) && (
        <div className={a.chips}>
          {t.alreadyHave && <span className={a.chipOk}>In software you already use</span>}
          {t.worksWithYours.map((w) => (
            <span key={w.product} className={a.chipOk}>
              Works with your {w.product} ({w.how})
            </span>
          ))}
        </div>
      )}
      {t.limits.length > 0 && (
        <ul className={a.limits}>
          {t.limits.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      <div className={a.toolFoot}>
        <span>✓ Checked by a person · {day(t.checkedOn)}</span>
        <span className={a.toolLinks}>
          <a href={t.detailPath}>Our review</a>
          <a href={t.officialUrl} target="_blank" rel="noreferrer">
            Official site ↗
          </a>
        </span>
      </div>
    </article>
  );
}

function Answer({ r, onAsk }: { r: AdvisorReply; onAsk: (q: string) => void }) {
  return (
    <div className={a.answer}>
      {r.notice && <p className={a.notice}>{r.notice}</p>}
      <div className={a.prose}>
        {r.answer.split(/\n{2,}/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      {r.budgetPlan && r.budgetPlan.picks.length > 0 && (
        <div className={a.box}>
          <span className={a.eyebrow}>Fits in {usd(r.budgetPlan.budget)} a month</span>
          <ul className={a.planList}>
            {r.budgetPlan.picks.map((p) => (
              <li key={p.name}>
                <span>{p.name}</span>
                <b>{usd(p.monthlyUsd)}</b>
              </li>
            ))}
            <li className={a.planTotal}>
              <span>Total at starting prices</span>
              <b>{usd(r.budgetPlan.total)}</b>
            </li>
          </ul>
        </div>
      )}

      {r.freeFirst.length > 0 && (
        <div className={a.box}>
          <span className={a.eyebrow}>Start free, this week</span>
          {r.freeFirst.map((f) => (
            <p key={f.title}>
              <b>{f.title}.</b> {f.detail}
            </p>
          ))}
        </div>
      )}

      {r.tools.length > 0 && (
        <div className={a.tools}>
          <span className={a.eyebrow}>Checked tools that fit</span>
          {r.tools.map((t) => (
            <Tool key={t.id} t={t} />
          ))}
        </div>
      )}

      {r.notNeeded && (
        <p className={a.when}>
          <b>When you don&apos;t need AI:</b> {r.notNeeded}
        </p>
      )}

      {r.nextSteps.length > 0 && (
        <div>
          <span className={a.eyebrow}>Next steps</span>
          <ol className={a.steps}>
            {r.nextSteps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      )}

      <p className={a.source}>
        {r.usedContext ? `Based on your results for ${r.business} and our checked catalog.` : "Based on our checked catalog. Find your business for answers about your own reviews and website."}{" "}
        {r.mode === "ai" ? "Written by AI from these facts; every tool, price and name was checked before you saw it." : "Written from our rules (the AI advisor is off or couldn't answer this one)."}
      </p>

      {r.followUps.length > 0 && (
        <div className={a.chips} aria-label="Ask next">
          {r.followUps.map((q) => (
            <button key={q} type="button" className={a.suggest} onClick={() => onAsk(q)}>
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdvisorChat({
  context = null,
  known = {},
  initialQuestion = null,
  variant = "page",
}: {
  context?: string | null;
  known?: Known;
  initialQuestion?: string | null;
  variant?: "page" | "panel";
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [industry, setIndustry] = useState<string | null>(known.industry ?? null);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const asked = useRef(false);

  // Show the start of each new answer (answers can be long); while waiting, show the "checking" line.
  const last = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (busy) end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    else last.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [messages, busy]);

  async function ask(question: string) {
    const q = question.trim().slice(0, 600);
    if (!q || busy) return;
    const history: AdvisorTurn[] = messages
      .flatMap((m): AdvisorTurn[] => (m.role === "owner" ? [{ role: "owner", text: m.text }] : m.role === "advisor" ? [{ role: "advisor", text: m.reply.answer.slice(0, 1_500) }] : []))
      .slice(-6);
    setMessages((m) => [...m, { role: "owner", text: q }]);
    setDraft("");
    setBusy(true);
    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: q, history, ...(context ? { context } : {}), ...(!context && industry ? { industry } : {}) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(res.status === 429 ? "You're asking quickly! Give it a few seconds and try again." : (body?.error?.message ?? "Something went wrong."));
      setMessages((m) => [...m, { role: "advisor", reply: body as AdvisorReply }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "error", text: e instanceof Error ? e.message : "Something went wrong. Please try again." }]);
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }

  useEffect(() => {
    if (initialQuestion && !asked.current) {
      asked.current = true;
      void ask(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  // Four good questions are easier to pick from than eight.
  const list = starters({ industry: industry ?? known.industry, firstProblem: known.firstProblem, budget: known.budget }).slice(0, 4);

  return (
    <div className={`${a.chat} ${variant === "panel" ? a.panelChat : ""}`}>
      <div className={a.thread} aria-live="polite">
        {messages.length === 0 && (
          <div className={a.welcome}>
            <h2 className={a.welcomeTitle}>{known.business ? `Ask me anything about ${known.business}.` : "Ask where AI could help your business."}</h2>
            <p>
              {known.business
                ? "I've read your results. I'll answer from them and from tools a person has checked, and I'll tell you when AI isn't worth it."
                : "I answer only from tools a person has checked, with real prices and links. I'll also tell you when you don't need AI at all."}
            </p>
            {!context && (
              <div className={a.pick}>
                <span className={a.eyebrow}>What kind of business?</span>
                <div className={a.chips}>
                  {INDUSTRIES.map(([key, label]) => (
                    <button key={key} type="button" className={a.choice} aria-pressed={industry === key} onClick={() => setIndustry(industry === key ? null : key)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <span className={a.eyebrow}>Try asking</span>
            <div className={a.starters}>
              {list.map((q) => (
                <button key={q} type="button" className={a.starter} onClick={() => void ask(q)}>
                  {q}
                  <span aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} ref={i === messages.length - 1 ? last : undefined} className={a.turn}>
            {m.role === "owner" ? (
              <div className={a.owner}>
                <p>{m.text}</p>
              </div>
            ) : m.role === "advisor" ? (
              <Answer r={m.reply} onAsk={(q) => void ask(q)} />
            ) : (
              <p className={a.error} role="alert">
                {m.text}
              </p>
            )}
          </div>
        ))}
        {busy && (
          <p className={a.thinking}>
            <span className={a.dot} />
            Checking {known.business ? "your results and " : ""}our checked catalog…
          </p>
        )}
        <div ref={end} />
      </div>

      <form
        className={a.composer}
        onSubmit={(e) => {
          e.preventDefault();
          void ask(draft);
        }}
      >
        <label htmlFor={`advisor-input-${variant}`} className={a.srOnly}>
          Your question
        </label>
        <textarea
          id={`advisor-input-${variant}`}
          ref={input}
          rows={2}
          maxLength={600}
          value={draft}
          placeholder="Ask about calls, quotes, bookings, reviews, a budget…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(draft);
            }
          }}
        />
        <button type="submit" className={a.send} disabled={busy || !draft.trim()}>
          Ask
        </button>
      </form>
      <p className={a.fine}>Not legal or financial advice. We never log into your accounts, and this conversation isn&apos;t saved.</p>
    </div>
  );
}
