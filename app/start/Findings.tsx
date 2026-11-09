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
  onDraft,
}: {
  business: string;
  placeholder?: string;
  suggestions: ChallengeSuggestion[];
  /** What the owner has added so far, one per line. */
  text: string;
  picks: string[];
  onText: (t: string) => void;
  onPicks: (ids: string[]) => void;
  /** The words in the box that haven't been added yet (so Continue can add them too). */
  onDraft?: (d: string) => void;
}) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [draft, setDraftState] = useState("");
  const setDraft = (d: string) => {
    setDraftState(d);
    onDraft?.(d);
  };
  const typed = text.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  const add = () => {
    const items = draft.split(/\n+/).map((x) => x.trim()).filter(Boolean);
    if (!items.length) return;
    onText([...typed, ...items.filter((x) => !typed.includes(x))].join("\n"));
    setDraft("");
  };
  const shown = useMemo(() => {
    const exclude = [...picks, ...dismissed];
    const near = matchSuggestions(suggestions, draft, exclude, 5);
    return near.length ? near : matchSuggestions(suggestions, "", exclude, 4);
  }, [suggestions, draft, picks, dismissed]);
  const picked = picks.map((id) => suggestions.find((x) => x.id === id)).filter((x): x is ChallengeSuggestion => Boolean(x));

  return (
    <div className={s.challenge}>
      <form
        className={s.addRow}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label htmlFor="challenges" className={s.sr}>
          What's taking up too much of your time?
        </label>
        <textarea
          id="challenges"
          className={cx(s.textarea, s.challengeBox)}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              add();
            }
          }}
          placeholder={typed.length || picked.length ? "Anything else? Type it and press Add" : placeholder}
          maxLength={400}
          rows={2}
          autoFocus
        />
        <button type="submit" className={cx(s.btn, s.secondary)} disabled={!draft.trim()}>
          + Add
        </button>
      </form>

      {(typed.length > 0 || picked.length > 0) && (
        <div className={s.col} style={{ gap: 8 }}>
          <span className={s.sub}>You added</span>
          <ul className={s.picked}>
            {typed.map((x) => (
              <li key={`t-${x}`}>
                <span>✓ {x}</span>
                <button type="button" className={s.pickedX} onClick={() => onText(typed.filter((y) => y !== x).join("\n"))} aria-label={`Remove “${x}”`}>
                  ✕
                </button>
              </li>
            ))}
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
          <span className={s.sub}>{draft.trim() ? "Does any of these fit?" : `Suggestions for ${business}`}</span>
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

export function FindingCard({ f, onOpen, selected, onToggle }: { f: Finding; onOpen: (f: Finding, el: HTMLButtonElement) => void; selected?: boolean; onToggle?: () => void }) {
  return (
    <article className={cx(s.card, s.finding, selected && s.findingOn)}>
      <div className={s.findingTop}>
        <span className={cx(s.badge, f.group === "yours" ? s.ok : s.warn)}>{f.group === "yours" ? "You told us" : f.evidence.some((e) => e.isQuote) ? "From your reviews" : "We noticed"}</span>
        {f.group !== "yours" && <span className={s.small}>{f.confidence.label}</span>}
      </div>
      <h3 className={s.h3}>{f.title}</h3>
      {f.connection && <p className={s.connectionSmall}>{f.connection.replace(/^This may be bigger than you thought: /, "Also in reviews: ")}</p>}
      {f.ai && <span className={cx(s.aiTag, f.ai.level === "no" && s.aiTagNo)}>{AI_LABEL[f.ai.level]}</span>}
      <div className={s.findingFoot}>
        {f.toolsFor && onToggle ? (
          <label className={s.toolsPick}>
            <input type="checkbox" checked={Boolean(selected)} onChange={onToggle} />
            Find tools for this
          </label>
        ) : (
          <span className={s.small}>{f.ai?.level === "no" ? "Free fix" : f.whatToDo ? "Free first step in details" : "No tool for this yet"}</span>
        )}
        <button type="button" className={cx(s.link, s.findingMore)} aria-haspopup="dialog" onClick={(e) => onOpen(f, e.currentTarget)}>
          Details
        </button>
      </div>
    </article>
  );
}

export function FindingsView({
  findings,
  industry,
  onOpen,
  selected,
  onToggle,
}: {
  findings: Findings;
  industry: string;
  onOpen: (f: Finding, el: HTMLButtonElement) => void;
  selected?: Set<string>;
  onToggle?: (toolsFor: string) => void;
}) {
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
              <FindingCard key={f.id} f={f} onOpen={onOpen} selected={Boolean(f.toolsFor && selected?.has(f.toolsFor))} onToggle={f.toolsFor && onToggle ? () => onToggle(f.toolsFor!) : undefined} />
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
              <FindingCard key={f.id} f={f} onOpen={onOpen} selected={Boolean(f.toolsFor && selected?.has(f.toolsFor))} onToggle={f.toolsFor && onToggle ? () => onToggle(f.toolsFor!) : undefined} />
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
                <FindingCard key={f.id} f={f} onOpen={onOpen} selected={Boolean(f.toolsFor && selected?.has(f.toolsFor))} onToggle={f.toolsFor && onToggle ? () => onToggle(f.toolsFor!) : undefined} />
              ))}
            </div>
          </div>
        </details>
      )}
    </>
  );
}
