/**
 * The chosen tools' prices, each with its label, source page and date, plus the monthly and
 * first-year total. No hooks, so it renders on the server (shared link) and in print.
 */
import { PRICE_LABEL, type costSummary } from "@/lib/plan/roi.ts";
import s from "../start/start.module.css";

const usd = (n: number) => `$${(Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function CostTable({ costs, title = "What it costs" }: { costs: ReturnType<typeof costSummary>; title?: string }) {
  if (!costs.tools.length) return null;
  return (
    <section className={s.card} aria-labelledby="costs-h">
      <div className={s.cardTop}>
        <h2 className={s.h3} id="costs-h">{title}</h2>
        <span className={s.small}>
          {usd(costs.totals.monthly)} a month · {usd(costs.totals.firstYear)} in the first year
          {costs.totals.missing.length ? ` · not counted (price not published): ${costs.totals.missing.join(", ")}` : ""}
        </span>
      </div>
      <dl className={s.factList}>
        {costs.tools.map((t) => (
          <div key={t.id} style={{ display: "contents" }}>
            <dt>
              {t.name}
              <br />
              <span className={s.small}>For: {t.heading.toLowerCase()}</span>
            </dt>
            <dd>
              {t.price.monthly === null ? "Not published" : `${usd(t.price.monthly)} a month (${usd(t.price.monthly * 12)} a year)`} · {PRICE_LABEL[t.price.label]}
              {t.price.plan ? ` · ${t.price.plan}` : ""}
              {t.price.billing === "yearly" ? " · needs a yearly contract" : ""}
              <br />
              <span className={s.small}>
                {t.price.sourceUrl ? (
                  <a href={t.price.sourceUrl} target="_blank" rel="noreferrer">
                    Source: {new URL(t.price.sourceUrl).hostname.replace(/^www\./, "")}
                  </a>
                ) : (
                  "No source: sample tool"
                )}{" "}
                · checked {t.price.checked} · not confirmed: {t.price.notConfirmed.join(", ")}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      <p className={s.small}>Setup fees, extra users and usage charges aren&apos;t in the totals because we couldn&apos;t confirm them. Confirm prices with each company before buying.</p>
    </section>
  );
}
