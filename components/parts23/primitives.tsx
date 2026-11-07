"use client";

import { useId, useState } from "react";
import type { Fact, FactSource } from "@/lib/business/types.ts";
import type { ProblemCard } from "@/lib/client/parts23.ts";
import s from "./parts23.module.css";

/* ---------- Evidence meter: 3 bars + words, never color alone ---------- */

const STATUS_WORDS: Record<ProblemCard["status"], string> = {
  confirmed: "Strong evidence",
  likely: "Some evidence",
  hypothesis: "Not confirmed",
};

export function EvidenceMeter({ status }: { status: ProblemCard["status"] }) {
  const level = status === "confirmed" ? 3 : status === "likely" ? 2 : 1;
  return (
    <span className={`${s.meter} ${status === "hypothesis" ? s.meterCheck : ""}`}>
      <span className={s.bars} aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <i key={n} data-on={n <= level} />
        ))}
      </span>
      {STATUS_WORDS[status]}
    </span>
  );
}

/** Kept for existing imports; renders the meter. */
export const StatusBadge = EvidenceMeter;

/* ---------- Where a profile fact came from ---------- */

const SOURCE_LABEL: Record<FactSource, string> = {
  google_places: "Google",
  mock_places: "Sample data",
  public_listings: "Public listings",
  website: "Your website",
  tech_signature: "Your website",
  review_analysis: "Reviews",
  owner: "You told us",
  default: "Starting assumption",
  derived: "Worked out",
};

export function SourceChip({ source }: { source: FactSource | null }) {
  if (!source) return null;
  return <span className={s.source}>{SOURCE_LABEL[source]}</span>;
}

/* ---------- Editable profile fact ---------- */

export function FactField({
  label,
  fact,
  format = (v) => String(v),
  onSave,
}: {
  label: string;
  fact: Fact<string> | Fact<number>;
  format?: (value: string | number) => string;
  onSave: (value: string) => void;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fact.value === null ? "" : String(fact.value));
  const missing = fact.value === null || fact.value === "";
  return (
    <div className={s.field}>
      <div className={s.row}>
        <span className={s.tiny} id={`${id}-l`}>
          {label}
        </span>
        {!missing && !editing && <SourceChip source={fact.source} />}
      </div>
      {editing ? (
        <form
          className={s.row}
          style={{ flexWrap: "nowrap" }}
          onSubmit={(e) => {
            e.preventDefault();
            onSave(draft.trim());
            setEditing(false);
          }}
        >
          <input
            className={s.input}
            aria-labelledby={`${id}-l`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
            autoFocus
          />
          <button className={s.btn} type="submit">
            Save
          </button>
        </form>
      ) : (
        <div className={s.row} style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
          <span className={missing ? s.small : s.body} style={{ fontWeight: missing ? 400 : 550, overflowWrap: "anywhere" }}>
            {missing ? "Not found" : format(fact.value as string | number)}
          </span>
          {fact.editable && (
            <button className={s.btnText} type="button" onClick={() => setEditing(true)} aria-describedby={`${id}-l`}>
              {missing ? "Add" : "Edit"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Evidence list ---------- */

const EVIDENCE_SOURCE: Record<ProblemCard["evidence"][number]["source"], string> = {
  google_review: "Google review",
  pasted_review: "Review you pasted",
  sample_review: "Sample review",
  public_review: "Public review",
  listing: "Public listings",
  website: "Your website",
  google_profile: "Your Google listing",
  tech_stack: "Your tools",
  owner_reported: "You told us",
  industry_pattern: "Common in your industry",
};

/** "BBB, Yelp: Open 24/7" → "Open 24/7" (the listings are shown as links underneath). */
const listingValue = (observation: string) => {
  const at = observation.indexOf(": ");
  return at > 0 ? observation.slice(at + 2) : observation;
};

export function EvidenceList({ evidence, limit = 3 }: { evidence: ProblemCard["evidence"]; limit?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? evidence : evidence.slice(0, limit);
  return (
    <div className={s.stack} style={{ gap: 8 }}>
      <ul className={s.evidence}>
        {shown.map((e) => (
          <li key={e.id} className={`${s.ev} ${e.verified ? "" : s.evUnverified}`}>
            <div className={s.stack} style={{ gap: 2 }}>
              {e.quote ? (
                <p className={s.evText}>“{e.quote}”</p>
              ) : e.summary ? (
                <p className={s.evSummary}>{e.summary}</p>
              ) : (
                <p className={s.evText}>{e.source === "listing" && e.links?.length ? listingValue(e.observation) : e.observation}</p>
              )}
              <p className={s.tiny}>
                {e.source === "listing" && e.links?.length ? "Shown on" : e.attribution ? e.attribution : EVIDENCE_SOURCE[e.source]}
                {!e.verified && ". Not seen directly"}
                {(e.links?.length ? e.links : e.reference?.url ? [{ label: "Open source", url: e.reference.url }] : []).map((l, i) => (
                  <span key={l.url + i}>
                    {i === 0 ? ": " : ", "}
                    <a className={s.link} href={l.url} target="_blank" rel="noreferrer noopener">
                      {l.label}
                    </a>
                  </span>
                ))}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {evidence.length > limit && (
        <div>
          <button className={s.btnText} type="button" onClick={() => setAll((v) => !v)} aria-expanded={all}>
            {all ? "Show less" : `Show all ${evidence.length}`}
          </button>
        </div>
      )}
    </div>
  );
}

/** What customers say that argues against a problem. */
export function CounterEvidence({ counter }: { counter: NonNullable<ProblemCard["counterEvidence"]> }) {
  return (
    <ul className={s.evidence}>
      {counter.examples.map((e, i) => (
        <li key={i} className={`${s.ev} ${s.evAgainst}`}>
          <div className={s.stack} style={{ gap: 2 }}>
            {e.isQuote ? <p className={s.evText}>“{e.text}”</p> : <p className={s.evSummary}>{e.text}</p>}
            <p className={s.tiny}>
              {e.attribution ?? "Review"}
              {e.url && (
                <>
                  {": "}
                  <a className={s.link} href={e.url} target="_blank" rel="noreferrer noopener">
                    Open source
                  </a>
                </>
              )}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
