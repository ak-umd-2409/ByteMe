"use client";

/**
 * The catalog browse page. Only ✓ Verified tools are ever recommended; tools a
 * person hasn't reviewed yet are shown here with "Not yet reviewed"; blocked
 * tools appear only under "Why we hid these" (docs/FEATURE_SPEC.md §1).
 */
import { useMemo, useState } from "react";
import type { CatalogRecord } from "@/lib/catalog/types.ts";
import { USE_CASES, type UseCase } from "@/lib/recommend/types.ts";
import s from "../start/start.module.css";
import { blockReason, Logo, SafetyBadge } from "../start/ToolScreens.tsx";
import c from "./catalog.module.css";
import { USE_CASE_LABEL } from "./labels.ts";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");
const PRICES = [25, 50, 100, 200];

const priceOf = (r: CatalogRecord) => (typeof r.pricing.small.monthlyUsd === "number" ? r.pricing.small.monthlyUsd : null);

export function Catalog({ records, industries }: { records: CatalogRecord[]; industries: { key: string; label: string }[] }) {
  const [q, setQ] = useState("");
  const [useCase, setUseCase] = useState<UseCase | "">("");
  const [industry, setIndustry] = useState("");
  const [worksWith, setWorksWith] = useState("");
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const shown = records.filter((r) => r.badge !== "blocked");
  const blocked = records.filter((r) => r.badge === "blocked");
  const products = useMemo(
    () => [...new Set(shown.flatMap((r) => r.worksWith.filter((w) => w.type !== "none").map((w) => w.product)))].sort((a, b) => a.localeCompare(b)),
    [shown],
  );
  const usedCases = USE_CASES.filter((u) => shown.some((r) => r.useCases.includes(u)));

  const results = shown
    .filter((r) => !verifiedOnly || r.badge === "verified")
    .filter((r) => !useCase || r.useCases.includes(useCase))
    .filter((r) => !industry || r.industries.includes("any") || r.industries.includes(industry as never))
    .filter((r) => !worksWith || r.worksWith.some((w) => w.type !== "none" && w.product === worksWith))
    .filter((r) => maxPrice === null || (priceOf(r) !== null && priceOf(r)! <= maxPrice))
    .filter((r) => {
      const t = q.trim().toLowerCase();
      return !t || [r.name, r.category, r.description, r.vendor.company].some((x) => x.toLowerCase().includes(t));
    })
    .sort((a, b) => Number(b.badge === "verified") - Number(a.badge === "verified") || a.name.localeCompare(b.name));

  const verified = shown.filter((r) => r.badge === "verified").length;
  const filtered = Boolean(q || useCase || industry || worksWith || maxPrice !== null || verifiedOnly);
  const clear = () => {
    setQ("");
    setUseCase("");
    setIndustry("");
    setWorksWith("");
    setMaxPrice(null);
    setVerifiedOnly(false);
  };

  return (
    <>
      <header className={s.intro}>
        <h1 className={s.title}>Browse AI tools</h1>
        <p className={s.lead}>
          Every tool we know about for small businesses, with its Safety Check. We only ever recommend <b>✓ Verified</b> tools: they passed the automatic checks and a person
          reviewed them.
        </p>
        <span className={s.small}>
          {verified} verified · {shown.length - verified} waiting for a person · {blocked.length} hidden
        </span>
      </header>

      <section className={c.filters} aria-label="Filter tools">
        <div className={cx(s.field, c.search)}>
          <label htmlFor="q">Search</label>
          <input id="q" className={s.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. receptionist, invoices" />
        </div>
        <div className={s.field}>
          <label htmlFor="uc">Problem</label>
          <select id="uc" className={cx(s.input, c.select)} value={useCase} onChange={(e) => setUseCase(e.target.value as UseCase | "")}>
            <option value="">Any problem</option>
            {usedCases.map((u) => (
              <option key={u} value={u}>
                {USE_CASE_LABEL[u]}
              </option>
            ))}
          </select>
        </div>
        <div className={s.field}>
          <label htmlFor="ind">Business type</label>
          <select id="ind" className={cx(s.input, c.select)} value={industry} onChange={(e) => setIndustry(e.target.value)}>
            <option value="">Any business</option>
            {industries.map((i) => (
              <option key={i.key} value={i.key}>
                {i.label}
              </option>
            ))}
          </select>
        </div>
        <div className={s.field}>
          <label htmlFor="ww">Works with</label>
          <select id="ww" className={cx(s.input, c.select)} value={worksWith} onChange={(e) => setWorksWith(e.target.value)}>
            <option value="">Anything</option>
            {products.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className={c.filterRow}>
          <span className={s.label}>Price a month</span>
          <div className={s.row}>
            {PRICES.map((p) => (
              <button key={p} type="button" className={s.chipsel} aria-pressed={maxPrice === p} onClick={() => setMaxPrice(maxPrice === p ? null : p)}>
                {maxPrice === p ? "✓ " : ""}Up to ${p}
              </button>
            ))}
            <button type="button" className={s.chipsel} aria-pressed={verifiedOnly} onClick={() => setVerifiedOnly(!verifiedOnly)}>
              {verifiedOnly ? "✓ " : ""}Verified only
            </button>
          </div>
        </div>
      </section>

      <div className={c.resultsHead} aria-live="polite">
        <span className={s.sub}>{results.length === 1 ? "1 tool" : `${results.length} tools`}</span>
        {filtered && (
          <button type="button" className={s.link} onClick={clear}>
            Clear filters
          </button>
        )}
      </div>

      {results.length === 0 ? (
        <p className={s.notice}>No tools match. Try fewer filters, or tell us about a tool on the home page and we'll check it.</p>
      ) : (
        <div className={c.grid}>
          {results.map((r) => {
            const price = priceOf(r);
            const ww = r.worksWith.filter((w) => w.type !== "none").slice(0, 3);
            return (
              <a key={r.id} href={`/tools/${r.id}`} className={c.tool}>
                <div className={c.toolTop}>
                  <Logo id={r.id} name={r.name} />
                  <div className={c.toolName}>
                    <b>{r.name}</b>
                    <span>{r.category}</span>
                  </div>
                  <span className={c.price}>{price !== null ? `$${price}` : "Price?"}
                    {price !== null && <small>/mo</small>}
                  </span>
                </div>
                <div className={s.row} style={{ gap: 6 }}>
                  <SafetyBadge badge={r.badge} />
                  {r.sample && <span className={s.chip}>Sample</span>}
                </div>
                <p className={c.desc}>{r.description.replace(/^Sample (scam-style )?tool \(fictional\)[.,]?\s*/i, "")}</p>
                <div className={c.chips}>
                  {r.useCases.slice(0, 2).map((u) => (
                    <span key={u} className={s.chip}>
                      {USE_CASE_LABEL[u]}
                    </span>
                  ))}
                  {ww.map((w) => (
                    <span key={w.product} className={s.chip}>
                      Works with {w.product}
                    </span>
                  ))}
                </div>
                <span className={c.more}>
                  {r.badge === "verified" ? `Checked ${r.reviewedAt ?? r.lastChecked}` : "A person hasn't reviewed it yet. We don't recommend it until they do."}
                  <span aria-hidden="true"> ›</span>
                </span>
              </a>
            );
          })}
        </div>
      )}

      {blocked.length > 0 && (
        <details className={s.disc}>
          <summary>
            Why we hid {blocked.length === 1 ? "1 tool" : `${blocked.length} tools`}
          </summary>
          <div className={s.discBody}>
            <p className={s.small}>These failed our Safety Check or a reviewer blocked them. We never show them to owners or recommend them.</p>
            <ul className={c.hidden}>
              {blocked.map((r) => (
                <li key={r.id}>
                  <span className={cx(s.badge, s.bad)}>⚠ Blocked</span>
                  <span>
                    <b>{r.name}</b> ({r.vendor.domain}): {blockReason(r)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}

      <section className={c.apply}>
        <div>
          <h2 className={s.h3}>Make an AI tool for small businesses?</h2>
          <p className={s.small}>Apply to be listed. Every tool gets the same Safety Check, then a person reviews it.</p>
        </div>
        <a className={cx(s.btn, s.secondary)} href="/submit">
          Apply to be listed
        </a>
      </section>
    </>
  );
}
