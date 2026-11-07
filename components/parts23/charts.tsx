"use client";

import { fmt, type ProblemCard } from "@/lib/client/parts23.ts";
import type { OnboardingAnalysis } from "@/lib/client/parts23.ts";
import s from "./parts23.module.css";

/**
 * Estimated monthly opportunity per problem: a dot for the estimate on a bar for the likely range.
 * One hue (magnitude, not identity); values are labelled directly; hover/focus shows the range.
 */
export function OpportunityChart({ problems }: { problems: ProblemCard[] }) {
  const rows = problems.filter((p) => p.impact && p.status !== "hypothesis");
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((p) => p.impact!.monthly.high));
  const nice = niceCeil(max);
  const x = (v: number) => `${(v / nice) * 100}%`;
  return (
    <figure className={s.chart} style={{ margin: 0 }} aria-label="Estimated monthly opportunity by problem">
      {rows.map((p) => {
        const m = p.impact!.monthly;
        return (
          <div key={p.id} className={s.chartRow}>
            <span className={s.small} style={{ color: "var(--ink)" }}>
              {p.display.headline}
            </span>
            <span
              className={s.track}
              tabIndex={0}
              role="img"
              aria-label={`${p.display.headline}: about ${fmt.usd(m.expected)} a month, likely ${fmt.range(m)}`}
            >
              <span className={s.range} style={{ left: x(m.low), width: `calc(${x(m.high)} - ${x(m.low)})` }} />
              <span className={s.dot} style={{ left: x(m.expected) }} />
              <span className={`${s.tip} ${s.num}`} style={{ left: x(m.expected) }}>
                Likely {fmt.range(m)}
              </span>
            </span>
            <span className={`${s.num}`} style={{ fontWeight: 650, textAlign: "right" }}>
              {fmt.usd(m.expected)}
            </span>
          </div>
        );
      })}
      <div className={`${s.chartRow} ${s.axisRow}`} aria-hidden="true">
        <span />
        <span className={`${s.axis} ${s.num}`}>
          <span>$0</span>
          <span>{fmt.usd(nice / 2)}</span>
          <span>{fmt.usd(nice)}</span>
        </span>
        <span />
      </div>
    </figure>
  );
}

function niceCeil(v: number) {
  if (v <= 0) return 100;
  const mag = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((n) => n >= v) ?? 10 * mag;
}

/** What customers praise most: one bar per theme, labelled with the count. */
export function StrengthBars({ strengths }: { strengths: { label: string; mentions: number }[] }) {
  if (strengths.length === 0) return null;
  const max = Math.max(...strengths.map((x) => x.mentions));
  return (
    <div className={s.stack} style={{ gap: 10 }} role="list" aria-label="What customers praise">
      {strengths.map((t) => (
        <div key={t.label} className={s.strength} role="listitem" aria-label={`${t.label}: ${t.mentions} reviews`}>
          <span>{t.label}</span>
          <span className={s.strengthBar} style={{ width: `${(t.mentions / max) * 100}%` }} />
          <span className={s.num} style={{ textAlign: "right", fontWeight: 650 }}>
            {t.mentions}
          </span>
        </div>
      ))}
    </div>
  );
}

const SERVICE_COLUMNS = [
  { key: "emergency_service", label: "Emergency service" },
  { key: "senior_discount", label: "Senior discount" },
] as const;

/**
 * Where the business is listed and whether the details agree. Rows = listings, columns = details.
 * "Same" = the most common value; "Different" = disagrees with it.
 */
export function ListingsMatrix({ check }: { check: OnboardingAnalysis["listings"] }) {
  const columns = check.fields.filter((f) => f.values.length > 0);
  const serviceCols = SERVICE_COLUMNS.filter((c) => check.listings.some((l) => l.services?.[c.key] !== undefined && l.services?.[c.key] !== null));
  const cell = (fieldIndex: number, listingId: string) => {
    const f = columns[fieldIndex];
    const at = f.values.findIndex((v) => v.listingIds.includes(listingId));
    if (at === -1) return <span className={s.none}>Not shown</span>;
    const value = f.values[at];
    if (f.values.length === 1) return <span className={value.listingIds.length > 1 ? s.same : undefined}>{value.listingIds.length > 1 ? "✓ " : ""}{value.display}</span>;
    return at === 0 ? <span className={s.same}>✓ {value.display}</span> : <span className={s.diff}>≠ {value.display}</span>;
  };
  const fieldLabel = { hours: "Hours", address: "Address", phone: "Phone" } as const;
  return (
    <div className={s.scrollX}>
      <table className={s.matrix}>
        <thead>
          <tr>
            <th scope="col">Listing</th>
            {columns.map((f) => (
              <th key={f.field} scope="col">
                {fieldLabel[f.field]}
              </th>
            ))}
            {serviceCols.map((c) => (
              <th key={c.key} scope="col">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {check.listings.map((l) => (
            <tr key={l.id}>
              <th scope="row">
                {l.url ? (
                  <a className={s.link} href={l.url} target="_blank" rel="noreferrer noopener">
                    {l.label}
                  </a>
                ) : (
                  l.label
                )}
              </th>
              {columns.map((f, i) => (
                <td key={f.field} style={f.field === "phone" ? { whiteSpace: "nowrap" } : undefined}>
                  {cell(i, l.id)}
                </td>
              ))}
              {serviceCols.map((c) => {
                const v = l.services?.[c.key];
                const conflict = typeof v === "boolean" && check.listings.some((o) => o.services?.[c.key] === !v);
                return (
                  <td key={c.key}>
                    {v === true ? (
                      <span className={conflict ? s.diff : s.same}>Yes</span>
                    ) : v === false ? (
                      <span className={conflict ? s.diff : s.same}>No</span>
                    ) : (
                      <span className={s.none}>Not shown</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
