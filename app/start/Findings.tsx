"use client";

/**
 * Listen first, then show what we found.
 * - ChallengeStep: "What's taking up too much of your time?" with suggestions made for this
 *   business that narrow as the owner types.
 * - FindingsView: what the owner told us, what we also noticed, what's worth considering, and
 *   what customers already like, each finding with its evidence behind "Evidence and details".
 */
import { useMemo, useState } from "react";
import { matchSuggestions, type ChallengeSuggestion } from "@/lib/challenges/match.ts";
import type { Finding, Findings } from "@/lib/journey/types.ts";
import s from "./start.module.css";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

const SOURCE_TAG: Record<ChallengeSuggestion["source"], string> = {
  reviews: "From your reviews",
  website: "From your website",
  listings: "From your listings",
  services: "From your services",
  industry: "Common for businesses like yours",
};

export function ChallengeStep({
  business,
  placeholder,
  suggestions,
  text,
  picks,
  onText,
  onPicks,
}: {
  business: string;
  placeholder?: string;
  suggestions: ChallengeSuggestion[];
  text: string;
  picks: string[];
  onText: (t: string) => void;
  onPicks: (ids: string[]) => void;
}) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  // Narrow by the line being written, so suggestions follow the owner's current thought.
  const current = text.split(/\n/).at(-1) ?? "";
  const shown = useMemo(() => {
    const exclude = [...picks, ...dismissed];
    const near = matchSuggestions(suggestions, current, exclude, 5);
    return near.length ? near : matchSuggestions(suggestions, "", exclude, 4);
  }, [suggestions, current, picks, dismissed]);
  const picked = picks.map((id) => suggestions.find((x) => x.id === id)).filter((x): x is ChallengeSuggestion => Boolean(x));

  return (
    <div className={s.challenge}>
      <label htmlFor="challenges" className={s.sr}>
        What's taking up too much of your time?
      </label>
      <textarea
        id="challenges"
        className={cx(s.textarea, s.challengeBox)}
        value={text}
        onChange={(e) => onText(e.target.value)}
        placeholder={placeholder}
        maxLength={1500}
        rows={4}
        autoFocus
      />
      <span className={s.hint}>One thing per line is easiest, but any way works.</span>

      {picked.length > 0 && (
        <div className={s.col} style={{ gap: 8 }}>
          <span className={s.sub}>You added</span>
          <ul className={s.picked}>
            {picked.map((p) => (
              <li key={p.id}>
                <span>✓ {p.text}</span>
                <button type="button" className={s.pickedX} onClick={() => onPicks(picks.filter((x) => x !== p.id))} aria-label={`Remove “${p.text}”`}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {shown.length > 0 && (
        <div className={s.col} style={{ gap: 8 }} aria-live="polite">
          <span className={s.sub}>{current.trim() ? "Does any of these fit?" : `Suggestions for ${business}`}</span>
          <ul className={s.suggestList}>
            {shown.map((x) => (
              <li key={x.id} className={s.suggest}>
                <button type="button" className={s.suggestAdd} onClick={() => onPicks([...picks, x.id])}>
                  <span className={s.suggestPlus} aria-hidden="true">
                    +
                  </span>
                  <span className={s.optionText}>
                    <b>{x.text}</b>
                    <span>
                      {SOURCE_TAG[x.source]}
                      {x.source !== "industry" && x.why ? ` · ${x.why}` : ""}
                    </span>
                  </span>
                </button>
                <button type="button" className={s.suggestX} onClick={() => setDismissed((d) => [...d, x.id])} aria-label={`Not for me: ${x.text}`} title="Not for me">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const GROUP_TAG: Record<Finding["group"], string> = { yours: "You told us", noticed: "We noticed", consider: "Worth considering" };
const AI_LABEL = { yes: "AI can help", partly: "AI can partly help", no: "No AI needed" } as const;

export function FindingCard({ f, onOpen }: { f: Finding; onOpen: (f: Finding, el: HTMLButtonElement) => void }) {
  return (
    <article className={cx(s.card, s.finding, f.group === "consider" && s.findingSoft)}>
      <div className={s.findingTop}>
        <span className={cx(s.badge, f.group === "yours" ? s.ok : f.group === "noticed" ? s.warn : s.grey)}>{GROUP_TAG[f.group]}</span>
        <span className={s.small}>{f.confidence.label}</span>
      </div>
      <h3 className={s.h3}>{f.title}</h3>
      {f.ownerWords.length > 0 && <p className={s.ownerWords}>“{f.ownerWords.join("” · “")}”</p>}
      {f.connection && <p className={s.connection}>{f.connection}</p>}
      {/* Rule-read challenges only have the owner's words, already quoted above. */}
      {f.whatsHappening.startsWith("In your words") ? f.whyItMatters && <p className={s.clamp}>{f.whyItMatters}</p> : <p className={s.clamp}>{f.whatsHappening}</p>}
      {f.impact && (
        <p className={s.money}>
          <span className={s.small}>{f.impact.kind === "time_cost" ? "Your time: about" : "Might be worth about"}</span> <b className={s.num}>{usd(f.impact.monthly.expected)} a month</b>
        </p>
      )}
      {f.whatToDo && (
        <p className={s.firstStep}>
          <b>What to do:</b> {f.whatToDo}
        </p>
      )}
      {f.ai && (
        <p className={cx(s.aiLine, f.ai.level === "no" && s.aiNo)}>
          <b>{AI_LABEL[f.ai.level]}.</b> {f.ai.how}
        </p>
      )}
      <button type="button" className={cx(s.link, s.findingMore)} aria-haspopup="dialog" onClick={(e) => onOpen(f, e.currentTarget)}>
        {f.evidence.length ? `Evidence and details (${f.evidence.length + f.moreEvidence})` : "Details"}
      </button>
    </article>
  );
}

export function FindingsView({ findings, industry, onOpen }: { findings: Findings; industry: string; onOpen: (f: Finding, el: HTMLButtonElement) => void }) {
  const { yours, noticed, consider, strengths, reviewsRead } = findings;
  const read = reviewsRead.count
    ? `Based on ${reviewsRead.count} ${reviewsRead.count === 1 ? "review" : "reviews"} we read${reviewsRead.sources.length ? ` (${reviewsRead.sources.map((x) => `${x.count} from ${x.name}`).join(", ")})` : ""}.`
    : "We had no reviews to read for this business.";
  return (
    <>
      {yours.length > 0 && (
        <section className={s.col} aria-labelledby="yours-h">
          <h2 className={s.h2} id="yours-h">
            What you told us
          </h2>
          <div className={s.oppGrid}>
            {yours.map((f) => (
              <FindingCard key={f.id} f={f} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}

      {noticed.length > 0 && (
        <section className={s.col} aria-labelledby="noticed-h">
          <div className={s.intro}>
            <h2 className={s.h2} id="noticed-h">
              {yours.length ? "We also noticed" : "What we noticed"}
            </h2>
            <span className={s.small}>From your public information. You didn't mention these, so check whether they ring true.</span>
          </div>
          <div className={s.oppGrid}>
            {noticed.map((f) => (
              <FindingCard key={f.id} f={f} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}

      {(strengths.length > 0 || reviewsRead.count > 0) && (
        <section className={cx(s.card, s.strengths)} aria-labelledby="well-h">
          <h2 className={s.h3} id="well-h">
            What you're already doing well
          </h2>
          {strengths.length ? (
            <ul className={s.strengthList}>
              {strengths.map((x) => (
                <li key={x.label}>
                  <b>{x.label}</b> <span className={s.small}>{x.countLabel}</span>
                  {x.example && (
                    <span className={s.small}>
                      {" "}
                      · “{x.example.text}”{x.example.who ? ` (${x.example.who})` : ""}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className={s.small}>The reviews we read didn't single out anything yet.</p>
          )}
          <span className={s.hint}>{read}</span>
        </section>
      )}

      {consider.length > 0 && (
        <details className={s.disc}>
          <summary>
            Worth considering for {industry} businesses ({consider.length})
          </summary>
          <div className={s.discBody}>
            <span className={s.small}>Common for businesses like yours. We haven't seen evidence of these for you, so they don't count unless you add them.</span>
            <div className={s.oppGrid}>
              {consider.map((f) => (
                <FindingCard key={f.id} f={f} onOpen={onOpen} />
              ))}
            </div>
          </div>
        </details>
      )}
    </>
  );
}
