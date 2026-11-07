"use client";

import { useEffect, useRef, useState } from "react";
import type { IndustryKey } from "@/lib/business/types.ts";
import { api, ApiError, fmt, type ImpactEstimate, type ProblemKey } from "@/lib/client/parts23.ts";
import s from "./parts23.module.css";

/**
 * Shows an estimate's inputs, lets the owner replace any of them, and recalculates on the server.
 * The browser never does the math: the number shown always comes from /api/problems/impact.
 */
export function ImpactCalculator({
  problemKey,
  industry,
  initial,
  onChange,
}: {
  problemKey: ProblemKey;
  industry: IndustryKey;
  initial: ImpactEstimate;
  /** Called with the owner's overrides so the page can send them to /api/problems/discover later. */
  onChange?: (overrides: Record<string, number>) => void;
}) {
  const [estimate, setEstimate] = useState(initial);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (Object.keys(overrides).length === 0) return;
    const timer = setTimeout(async () => {
      controller.current?.abort();
      controller.current = new AbortController();
      setPending(true);
      try {
        const result = await api.impact({ problemKey, industry, overrides }, controller.current.signal);
        setEstimate(result.impact);
        setErrors([]);
        onChange?.(overrides);
      } catch (error) {
        if (error instanceof ApiError) setErrors(error.details.length ? error.details : [error.message]);
      } finally {
        setPending(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [overrides, problemKey, industry, onChange]);

  const editable = estimate.inputs.filter((i) => i.source !== "derived");
  const derived = estimate.inputs.filter((i) => i.source === "derived");

  return (
    <section className={s.stack} aria-labelledby={`${problemKey}-impact`}>
      <div>
        <p className={s.meta} id={`${problemKey}-impact`} style={{ margin: 0 }}>
          {estimate.label}
        </p>
        <p className={s.amount} aria-live="polite" style={{ margin: 0, opacity: pending ? 0.6 : 1 }}>
          {fmt.usd(estimate.monthly.expected)}
          <span className={s.meta} style={{ fontWeight: 400, fontSize: 16 }}>
            {" "}
            / month
          </span>
        </p>
        {estimate.monthly.low !== estimate.monthly.high && (
          <p className={`${s.meta} ${s.num}`} style={{ margin: 0 }}>
            Could be {fmt.range(estimate.monthly)} depending on the starting assumptions below
          </p>
        )}
      </div>

      <div className={s.stack}>
        {editable.map((input) => {
          const percent = input.unit === "percent";
          const value = overrides[input.key] ?? input.value;
          const invalid = errors.some((e) => e.startsWith(input.key));
          return (
            <label key={input.key} className={s.field}>
              <span className={s.row}>
                <span className={s.label}>{input.label}</span>
                <span className={s.sourceChip}>{input.source === "owner" ? "Your number" : "Starting assumption"}</span>
              </span>
              <input
                className={`${s.input} ${s.num}`}
                type="number"
                inputMode="decimal"
                aria-invalid={invalid}
                min={percent ? input.min * 100 : input.min}
                max={percent ? input.max * 100 : input.max}
                step={percent ? 1 : input.unit === "usd" ? 10 : 1}
                value={percent ? Math.round(value * 100) : value}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  if (Number.isNaN(raw)) return;
                  setOverrides((o) => ({ ...o, [input.key]: percent ? raw / 100 : raw }));
                }}
              />
            </label>
          );
        })}
        {derived.map((input) => (
          <p key={input.key} className={s.meta} style={{ margin: 0 }}>
            {input.label}: <span className={s.num}>{input.value}</span>. {input.note}
          </p>
        ))}
      </div>

      {errors.length > 0 && (
        <p className={s.error} role="alert">
          {errors.join(" ")}
        </p>
      )}

      <p className={`${s.calcLine} ${s.num}`}>{estimate.calculation}</p>
      <details>
        <summary className={s.disclosure}>What this assumes</summary>
        <ul className={s.meta}>
          {estimate.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
