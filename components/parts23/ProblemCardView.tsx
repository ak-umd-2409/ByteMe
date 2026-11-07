"use client";

import { useState } from "react";
import type { IndustryKey } from "@/lib/business/types.ts";
import { fmt, type ImpactEstimate, type ProblemCard } from "@/lib/client/parts23.ts";
import { ImpactCalculator } from "./ImpactCalculator.tsx";
import { EvidenceList, StatusBadge } from "./primitives.tsx";
import s from "./parts23.module.css";

/**
 * One problem, collapsed to a single readable line by default:
 *   rank · title · status · monthly estimate
 * Expanding shows evidence first, then the calculator, then the ranking breakdown.
 */
export function ProblemCardView({
  problem,
  industry,
  onConfirmHypothesis,
  onAssumptions,
}: {
  problem: ProblemCard;
  industry: IndustryKey;
  onConfirmHypothesis?: (key: ProblemCard["key"], applies: boolean) => void;
  onAssumptions?: (key: ProblemCard["key"], overrides: Record<string, number>) => void;
}) {
  const [open, setOpen] = useState(problem.rank.position === 1);
  const [impact, setImpact] = useState<ImpactEstimate | null>(problem.impact);
  const panelId = `${problem.id}-panel`;
  return (
    <article className={`${s.root} ${s.card}`} aria-labelledby={`${problem.id}-title`}>
      <header className={s.row} style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div className={s.stack} style={{ gap: 4, flex: "1 1 340px" }}>
          <div className={s.row}>
            <span className={`${s.meta} ${s.num}`}>#{problem.rank.position}</span>
            <StatusBadge status={problem.status} />
            <span className={s.meta}>{problem.category.label}</span>
          </div>
          <h3 className={s.title} id={`${problem.id}-title`}>
            {problem.title}
          </h3>
          <p style={{ margin: 0 }}>{problem.explanation}</p>
          <p className={s.meta} style={{ margin: 0 }}>
            {problem.confidence.reason}
          </p>
        </div>
        {impact && (
          <div style={{ minWidth: 120 }}>
            <div className={s.amount} style={{ fontSize: 22 }}>
              {fmt.usd(impact.monthly.expected)}
            </div>
            <div className={s.meta}>{impact.kind === "time_cost" ? "time / month" : "opportunity / month"}</div>
          </div>
        )}
      </header>

      {problem.needsOwnerConfirmation && onConfirmHypothesis && (
        <div className={s.row} style={{ marginTop: 16 }}>
          <span>Does this happen at your business?</span>
          <button className={s.ghost} type="button" onClick={() => onConfirmHypothesis(problem.key, true)}>
            Yes, it does
          </button>
          <button className={s.ghost} type="button" onClick={() => onConfirmHypothesis(problem.key, false)}>
            No
          </button>
        </div>
      )}

      <button className={s.disclosure} type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)} style={{ marginTop: 12 }}>
        {open ? "Hide details" : "Why we think this"}
      </button>

      {open && (
        <div id={panelId} className={s.stack} style={{ marginTop: 12, gap: 24 }}>
          <section className={s.stack}>
            <h4 className={s.label} style={{ margin: 0 }}>
              What we found
            </h4>
            <EvidenceList evidence={problem.evidence} />
          </section>

          {problem.impact ? (
            <ImpactCalculator
              problemKey={problem.key}
              industry={industry}
              initial={problem.impact}
              onChange={(o) => onAssumptions?.(problem.key, o)}
              onEstimate={setImpact}
            />
          ) : (
            problem.impactNote && <p className={s.meta}>{problem.impactNote}</p>
          )}

          <details>
            <summary className={s.disclosure}>How we ranked this</summary>
            <ul className={`${s.meta} ${s.num}`}>
              {problem.rank.explanation.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </article>
  );
}
