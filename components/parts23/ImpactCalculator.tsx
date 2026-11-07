"use client";

import { useEffect, useRef, useState } from "react";
import type { IndustryKey } from "@/lib/business/types.ts";
import { api, ApiError, fmt, type ImpactEstimate, type ProblemKey } from "@/lib/client/parts23.ts";
import s from "./parts23.module.css";

type Term = ImpactEstimate["terms"][number];

const show = (t: Pick<Term, "unit" | "value">) =>
  t.unit === "percent" ? fmt.percent(t.value) : t.unit === "usd" || t.unit === "usd_per_hour" ? fmt.usd(t.value) : String(t.value);

/**
 * The estimate as an equation the owner can read and change:
 *   [6 missed / week] × [25% would hire you] × [$300 avg job] × [4.33 weeks] = [$1,949 / month]
 * Tapping a number asks one plain question. The server does every calculation.
 */
export function ImpactCalculator({
  problemKey,
  industry,
  initial,
  onChange,
  onEstimate,
}: {
  problemKey: ProblemKey;
  industry: IndustryKey;
  initial: ImpactEstimate;
  onChange?: (overrides: Record<string, number>) => void;
  onEstimate?: (estimate: ImpactEstimate) => void;
}) {
  const [estimate, setEstimate] = useState(initial);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<Term | null>(null);
  const [draft, setDraft] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const callbacks = useRef({ onChange, onEstimate });
  useEffect(() => {
    callbacks.current = { onChange, onEstimate };
  });

  useEffect(() => {
    if (Object.keys(overrides).length === 0) return;
    controller.current?.abort();
    controller.current = new AbortController();
    setPending(true);
    api
      .impact({ problemKey, industry, overrides }, controller.current.signal)
      .then((result) => {
        setEstimate(result.impact);
        setErrors([]);
        callbacks.current.onEstimate?.(result.impact);
        callbacks.current.onChange?.(overrides);
      })
      .catch((error) => {
        if (error instanceof ApiError) setErrors(error.details.length ? error.details : [error.message]);
      })
      .finally(() => setPending(false));
  }, [overrides, problemKey, industry]);

  const open = (t: Term) => {
    setEditing(t);
    setDraft(t.unit === "percent" ? String(Math.round(t.value * 100)) : String(t.value));
  };
  const save = () => {
    if (!editing) return;
    const raw = Number(draft);
    if (!Number.isFinite(raw) || draft.trim() === "") return setErrors(["Enter a number."]);
    const value = editing.unit === "percent" ? raw / 100 : raw;
    if (value < editing.min || value > editing.max) {
      return setErrors([`Enter a number between ${show({ ...editing, value: editing.min })} and ${show({ ...editing, value: editing.max })}.`]);
    }
    setOverrides((o) => ({ ...o, [editing.key]: value }));
    setEditing(null);
  };
  const ownCount = estimate.terms.filter((t) => t.source === "owner").length;
  const editable = estimate.terms.filter((t) => t.source !== "constant").length;

  return (
    <section className={s.stack} style={{ gap: 14 }} aria-label="How this estimate is worked out">
      <div className={s.equation} aria-live="polite" style={{ opacity: pending ? 0.6 : 1 }}>
        {estimate.terms.map((t, i) => (
          <span key={t.key} style={{ display: "contents" }}>
            {i > 0 && (
              <span className={s.op} aria-hidden="true">
                ×
              </span>
            )}
            {t.source === "constant" ? (
              <span className={s.termFixed} title="Average weeks in a month">
                <span className={s.termValue}>{t.value}</span>
                <span className={s.termLabel}>{t.short}</span>
              </span>
            ) : (
              <button
                type="button"
                className={s.termBtn}
                data-own={t.source === "owner"}
                aria-label={`${t.short}: ${show(t)}. ${t.source === "owner" ? "Your number." : "Starting assumption."} Change it.`}
                onClick={() => open(t)}
              >
                <span className={s.termValue}>{show(t)}</span>
                <span className={s.termLabel}>{t.short}</span>
              </button>
            )}
          </span>
        ))}
        <span className={s.op} aria-hidden="true">
          =
        </span>
        <span className={s.result}>
          <span className={s.termValue}>{fmt.usd(estimate.monthly.expected)}</span>
          <span className={s.termLabel}>{estimate.kind === "time_cost" ? "of your time / month" : "per month"}</span>
        </span>
      </div>

      {editing && (
        <form
          className={s.popover}
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className={s.field}>
            <span className={s.label}>{editing.question}</span>
            <span className={s.row} style={{ flexWrap: "nowrap" }}>
              {(editing.unit === "usd" || editing.unit === "usd_per_hour") && <span aria-hidden="true">$</span>}
              <input
                className={`${s.input} ${s.num}`}
                style={{ maxWidth: 160 }}
                inputMode="decimal"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                autoFocus
              />
              {editing.unit === "percent" && <span aria-hidden="true">%</span>}
            </span>
          </label>
          <div className={s.row}>
            <button className={s.btn} type="submit">
              Use my number
            </button>
            <button className={s.btnQuiet} type="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {errors.length > 0 && (
        <p className={s.error} role="alert">
          {errors.join(" ")}
        </p>
      )}

      <p className={s.tiny}>
        {estimate.label}.{" "}
        {estimate.monthly.low !== estimate.monthly.high && (
          <span className={s.num}>
            Likely between {fmt.range(estimate.monthly)}.{" "}
          </span>
        )}
        {ownCount === 0
          ? "These are starting assumptions. Tap a number to use yours."
          : `${ownCount} of ${editable} numbers are yours.`}
      </p>
    </section>
  );
}
