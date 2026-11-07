"use client";

import { useId, useState } from "react";
import type { Fact, FactSource } from "@/lib/business/types.ts";
import type { ProblemCard } from "@/lib/client/parts23.ts";
import s from "./parts23.module.css";

/* ---------- Status badge: text + glyph, never color alone ---------- */

const STATUS: Record<ProblemCard["status"], { label: string; glyph: string; className: string }> = {
  confirmed: { label: "Confirmed", glyph: "●", className: s.confirmed },
  likely: { label: "Likely", glyph: "◐", className: s.likely },
  hypothesis: { label: "Not confirmed", glyph: "○", className: s.hypothesis },
};

export function StatusBadge({ status }: { status: ProblemCard["status"] }) {
  const meta = STATUS[status];
  return (
    <span className={`${s.badge} ${meta.className}`}>
      <span aria-hidden="true">{meta.glyph}</span>
      {meta.label}
    </span>
  );
}

/* ---------- Source chip for profile facts ---------- */

const SOURCE_LABEL: Record<FactSource, string> = {
  google_places: "From Google",
  mock_places: "Sample data",
  website: "From your website",
  tech_signature: "Found on your website",
  review_analysis: "From reviews",
  owner: "You told us",
  default: "Starting assumption",
  derived: "Worked out",
};

export function SourceChip({ source }: { source: FactSource | null }) {
  if (!source) return null;
  return <span className={s.sourceChip}>{SOURCE_LABEL[source]}</span>;
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
  const missing = fact.value === null;
  return (
    <div className={s.field}>
      <div className={s.row}>
        <span className={s.label} id={`${id}-label`}>
          {label}
        </span>
        {!missing && <SourceChip source={fact.source} />}
      </div>
      {editing ? (
        <form
          className={s.row}
          onSubmit={(e) => {
            e.preventDefault();
            onSave(draft.trim());
            setEditing(false);
          }}
        >
          <input className={s.input} aria-labelledby={`${id}-label`} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
          <button className={s.button} type="submit">
            Save
          </button>
          <button className={s.ghost} type="button" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <div className={s.row}>
          <span className={missing ? s.meta : undefined}>{missing ? "We couldn't find this" : format(fact.value as string | number)}</span>
          {fact.editable && (
            <button className={s.disclosure} type="button" onClick={() => setEditing(true)} aria-describedby={`${id}-label`}>
              {missing ? "Add" : "Edit"}
            </button>
          )}
        </div>
      )}
      {fact.evidence && !editing && <span className={s.meta}>{fact.evidence}</span>}
    </div>
  );
}

/* ---------- Evidence list ---------- */

const EVIDENCE_SOURCE: Record<ProblemCard["evidence"][number]["source"], string> = {
  google_review: "Google review",
  pasted_review: "Review you pasted",
  sample_review: "Sample review",
  website: "Your website",
  google_profile: "Your Google listing",
  tech_stack: "Your tools",
  owner_reported: "You told us",
  industry_pattern: "Common in your industry",
};

export function EvidenceList({ evidence, limit = 3 }: { evidence: ProblemCard["evidence"]; limit?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? evidence : evidence.slice(0, limit);
  return (
    <div className={s.stack}>
      <ul className={s.evidence}>
        {shown.map((e) => (
          <li key={e.id}>
            <blockquote className={`${s.quote} ${e.verified ? "" : s.unverified}`}>
              {e.quote ? <p style={{ margin: 0 }}>“{e.quote}”</p> : <p style={{ margin: 0 }}>{e.observation}</p>}
              <div className={s.meta}>
                {EVIDENCE_SOURCE[e.source]}
                {!e.verified && " · not directly observed"}
                {e.reference?.url && (
                  <>
                    {" · "}
                    <a href={e.reference.url} target="_blank" rel="noreferrer noopener" style={{ textDecoration: "underline" }}>
                      view page
                    </a>
                  </>
                )}
              </div>
            </blockquote>
          </li>
        ))}
      </ul>
      {evidence.length > limit && (
        <button className={s.disclosure} type="button" onClick={() => setAll((v) => !v)} aria-expanded={all}>
          {all ? "Show less" : `Show all ${evidence.length} signals`}
        </button>
      )}
    </div>
  );
}
