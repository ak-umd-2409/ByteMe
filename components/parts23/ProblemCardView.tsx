"use client";

import { useState } from "react";
import type { IndustryKey } from "@/lib/business/types.ts";
import { fmt, type ImpactEstimate, type ProblemCard } from "@/lib/client/parts23.ts";
import { ImpactCalculator } from "./ImpactCalculator.tsx";
import { CounterEvidence, EvidenceList, EvidenceMeter } from "./primitives.tsx";
import s from "./parts23.module.css";

/**
 * One problem as a ledger row. Collapsed: headline, why it matters, evidence meter, effort, amount.
 * Expanded: what we found → what customers say against it → the math → what to do first.
 * Render inside <ul className={s.ledger}>.
 */
export function ProblemCardView({
  problem,
  industry,
  defaultOpen = false,
  onConfirmHypothesis,
  onAssumptions,
}: {
  problem: ProblemCard;
  industry: IndustryKey;
  defaultOpen?: boolean;
  onConfirmHypothesis?: (key: ProblemCard["key"], applies: boolean) => void;
  onAssumptions?: (key: ProblemCard["key"], overrides: Record<string, number>) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [impact, setImpact] = useState<ImpactEstimate | null>(problem.impact);
  const panel = `${problem.id}-detail`;
  const d = problem.display;
  const free = d.effort.kind === "free";
  const guess = problem.status === "hypothesis";

  return (
    <li>
      <button type="button" className={s.rowToggle} aria-expanded={open} aria-controls={panel} onClick={() => setOpen((v) => !v)}>
        <span className={s.rowMain}>
          <span className={s.h3}>{d.headline}</span>
          <span className={s.small}>{d.whyItMatters}</span>
          <span className={s.rowMeta} style={{ marginTop: 6 }}>
            <EvidenceMeter status={problem.status} />
            <span className={`${s.tag} ${free ? s.tagFree : ""}`}>{d.effort.label}</span>
            {guess && problem.counterEvidence && <span className={`${s.tag} ${s.tagCheck}`}>Reviews suggest otherwise</span>}
          </span>
        </span>
        <span className={s.rowAmount}>
          {impact ? (
            <>
              <span className={s.amount} style={{ color: guess ? "var(--ink-2)" : undefined }}>
                {fmt.usd(impact.monthly.expected)}
              </span>
              <span className={s.tiny} style={{ display: "block" }}>
                {impact.kind === "time_cost" ? "time / month, est." : "/ month, est."}
              </span>
            </>
          ) : (
            <span className={s.tiny}>No $ estimate</span>
          )}
        </span>
        <svg className={s.chev} viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div id={panel} className={s.detail}>
          <div className={s.detailBlock}>
            <h4 className={s.detailHead}>{guess ? "Why we're asking" : "What we found"}</h4>
            <p className={s.small}>{problem.confidence.reason}</p>
            <EvidenceList evidence={problem.evidence} />
          </div>

          {problem.counterEvidence && (
            <div className={s.detailBlock}>
              <h4 className={s.detailHead}>What customers say against this</h4>
              <p className={s.small}>{problem.counterEvidence.label}.</p>
              <CounterEvidence counter={problem.counterEvidence} />
            </div>
          )}

          {problem.needsOwnerConfirmation && onConfirmHypothesis && (
            <div className={s.detailBlock}>
              <h4 className={s.detailHead}>Does this happen at your business?</h4>
              <div className={s.row}>
                <button className={s.btnQuiet} type="button" onClick={() => onConfirmHypothesis(problem.key, true)}>
                  Yes, it does
                </button>
                <button className={s.btnQuiet} type="button" onClick={() => onConfirmHypothesis(problem.key, false)}>
                  No, hide it
                </button>
              </div>
            </div>
          )}

          <div className={s.detailBlock}>
            <h4 className={s.detailHead}>What it may be worth</h4>
            {impact ? (
              <ImpactCalculator
                problemKey={problem.key}
                industry={industry}
                initial={impact}
                onChange={(o) => onAssumptions?.(problem.key, o)}
                onEstimate={setImpact}
              />
            ) : (
              <p className={s.small}>{problem.impactNote}</p>
            )}
          </div>

          <div className={s.detailBlock}>
            <h4 className={s.detailHead}>First step</h4>
            <p className={s.body}>{d.nextStep}</p>
          </div>

          <details>
            <summary className={s.small} style={{ cursor: "pointer" }}>
              How we ranked this
            </summary>
            <ul className={`${s.small} ${s.num}`}>
              {problem.rank.explanation.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </li>
  );
}
