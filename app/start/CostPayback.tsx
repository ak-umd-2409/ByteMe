"use client";

/**
 * "What it costs and when it pays off" on the plan: every chosen tool's price with its label,
 * source page and date, the monthly and first-year total, and a payback range the owner can
 * change. All math is in lib/plan/roi.ts (code, not AI). Nothing is shown as a figure when
 * we don't have what it needs.
 */
import { useState } from "react";
import type { CatalogRecord } from "@/lib/catalog/types.ts";
import type { ImpactView } from "@/lib/journey/types.ts";
import type { Plan } from "@/lib/plan/plan.ts";
import {
  DEFAULT_FIX_SHARE,
  DEFAULT_SETUP_HOURS,
  DEFAULT_TIME_TO_MONEY,
  breakEven,
  PRICE_LABEL,
  payback,
  priceExtras,
  paybackWords,
  priceOf,
  totals,
  type Scenario,
} from "@/lib/plan/roi.ts";
import { ToolLogo } from "@/components/ToolLogo.tsx";
import { INDUSTRIES } from "@/lib/business/industry.ts";
import s from "./start.module.css";
import c from "./cost.module.css";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");
const usd = (n: number) => `$${(Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const whole = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
/** "missed calls" from "Missed calls", but "I spend…" keeps its capital I. */
const lc = (h: string) => (/^I\b/.test(h) ? h : h.charAt(0).toLowerCase() + h.slice(1));
const SC_WORD: Record<Scenario, string> = { conservative: "If it helps a little", expected: "Expected", optimistic: "If it helps a lot" };

/** A starting value for an hour of the owner's time: theirs if they gave one, else a labelled guess. */
function hourlyFrom(impacts: (ImpactView | null)[]): { value: number; theirs: boolean } {
  for (const i of impacts) {
    const own = i?.yourNumbers.find((n) => /hour/i.test(n.label) && /usd|\$/.test(n.unit));
    if (own) return { value: own.value, theirs: true };
  }
  for (const i of impacts) {
    const a = i?.assumed.find((n) => /hour/i.test(n.label) && /usd|\$/.test(n.unit));
    if (a) return { value: a.value, theirs: false };
  }
  return { value: 30, theirs: false };
}

/** The business type's typical order value and hourly value (labelled estimates), from its label or key. */
function industryDefaults(industry: string | null) {
  const v = (industry ?? "").trim().toLowerCase();
  const found = Object.values(INDUSTRIES).find((i) => i.key === v || i.label.toLowerCase() === v) ?? INDUSTRIES.other;
  return { label: found.key === "other" ? "small business" : found.label.replace(/^[A-Z][a-z]/, (m) => m.toLowerCase()), order: found.defaults.averageJobValue, hourly: found.defaults.hourlyValueOfOwnerTime };
}

export function CostPayback({ plan, catalog, impactFor, industry = null }: { plan: Plan; catalog: CatalogRecord[]; impactFor: Record<string, ImpactView | null>; industry?: string | null }) {
  const byId = new Map(catalog.map((r) => [r.id, r]));
  const rows = plan.sections
    .filter((sec) => sec.tool)
    .map((sec) => ({ sec, r: byId.get(sec.tool!.id) }))
    .filter((x): x is { sec: Plan["sections"][number]; r: CatalogRecord } => Boolean(x.r));
  const typical = industryDefaults(industry);
  const fromImpact = hourlyFrom(rows.map((x) => impactFor[x.sec.id] ?? null));
  const startHourly = fromImpact.theirs || rows.some((x) => impactFor[x.sec.id]) ? fromImpact : { value: typical.hourly, theirs: false };
  const [orderValue, setOrderValue] = useState(typical.order);
  const [hourly, setHourly] = useState(startHourly.value);
  const [setupHours, setSetupHours] = useState(DEFAULT_SETUP_HOURS);
  const [timeToMoney, setTimeToMoney] = useState(DEFAULT_TIME_TO_MONEY);
  const [share, setShare] = useState(DEFAULT_FIX_SHARE);
  /** Owner's own "this problem costs me $X a month", by section, when we had no estimate. */
  const [own, setOwn] = useState<Record<string, string>>({});

  if (!rows.length) return null;
  const sum = totals(rows.map((x) => x.r));

  return (
    <section className={cx(s.card, c.wrap)} aria-labelledby="cost-h">
      <div className={s.cardTop}>
        <h2 className={s.h3} id="cost-h">What it costs and when it pays off</h2>
        <span className={s.small}>Prices come from each company&apos;s own pricing page. Payback is an estimate you can change, never a promise.</span>
      </div>

      <div className={c.totals}>
        <div><small>Each month</small><b>{usd(sum.monthly)}</b></div>
        <div><small>First year</small><b>{usd(sum.firstYear)}</b></div>
        {(() => {
          const be = breakEven(sum.monthly, orderValue, hourly, 0);
          return be ? <div><small>Breaks even at</small><b>{be.customers}</b><small>extra {be.customers === 1 ? "customer" : "customers"} a month</small></div> : <div><small>Tools</small><b>{rows.length}</b></div>;
        })()}
      </div>
      {sum.missing.length > 0 && (
        <p className={s.banner}>Not in the total: {sum.missing.join(", ")}. {sum.missing.length === 1 ? "Its price isn't" : "Their prices aren't"} published. Ask for a written price before you buy.</p>
      )}
      <p className={s.small}>First year = 12 months of the prices below, billed monthly. Setup fees, extra users and going over a plan's limits aren&apos;t included.</p>

      {rows.map(({ sec, r }) => {
        const p = priceOf(r);
        const impact = impactFor[sec.id] ?? null;
        const ownN = Number(own[sec.id]);
        const problemMonthly = impact
          ? impact.monthly
          : own[sec.id] && Number.isFinite(ownN) && ownN > 0
            ? { low: ownN, expected: ownN, high: ownN }
            : null;
        const kind = impact?.kind ?? "time_cost";
        const pb = payback({ problemMonthly, kind, toolMonthly: p.monthly, fixShare: share, setupHours, hourlyValue: hourly, timeToMoney });
        return (
          <article className={c.tool} key={sec.id}>
            <header className={c.toolHead}>
              <ToolLogo id={r.id} name={r.name} size={32} />
              <div>
                <b>{r.name}</b>
                <span className={s.small}>For: {lc(sec.heading)}</span>
              </div>
              <span className={s.price}>{p.monthly === null ? "—" : usd(p.monthly)}<small>{p.monthly === null ? "" : "/mo"}</small></span>
            </header>

            <dl className={c.facts}>
              <div><dt>Price</dt><dd><span className={cx(c.label, c[`l_${p.label}`])}>{PRICE_LABEL[p.label]}</span>{p.plan && ` · ${p.plan}`}</dd></div>
              <div><dt>Per year</dt><dd>{p.monthly === null ? "Not published" : usd(p.monthly * 12)}{p.annualBilled !== null && p.annualBilled !== p.monthly ? ` (${usd(p.annualBilled * 12)} if paid yearly)` : ""}</dd></div>
              <div><dt>Billing</dt><dd>{p.monthlyBilled !== null || p.annualBilled !== null ? [p.monthlyBilled !== null && `${usd(p.monthlyBilled)}/mo monthly`, p.annualBilled !== null && `${usd(p.annualBilled)}/mo yearly`].filter(Boolean).join(" · ") : p.billing === "yearly" ? "Needs a yearly contract" : p.billing === "monthly" ? "Monthly, cancel any month" : "Not confirmed"}</dd></div>
              <div><dt>Free plan or trial</dt><dd>{[p.trialDays !== null && `${p.trialDays}-day free trial`, p.freePlan === "yes" && "Free plan"].filter(Boolean).join(" · ") || (p.freePlan === "no" ? "No" : "Not confirmed")}</dd></div>
            </dl>
            {priceExtras(p).filter((x) => !/free trial|free plan|billed (monthly|yearly)/i.test(x)).length > 0 && (
              <ul className={c.extras}>
                {priceExtras(p).filter((x) => !/free trial|free plan|billed (monthly|yearly)/i.test(x)).map((x) => <li key={x}>{x}</li>)}
              </ul>
            )}
            <p className={s.small}>
              {p.notConfirmed.filter((x) => x !== "free plan or trial" && x !== "monthly or yearly billing").length > 0 && `Not confirmed: ${p.notConfirmed.filter((x) => x !== "free plan or trial" && x !== "monthly or yearly billing").join(", ")}. `}
              {p.sourceUrl && (
                <a href={p.sourceUrl} target="_blank" rel="noreferrer">Source: {new URL(p.sourceUrl).hostname.replace(/^www\./, "")} pricing ↗</a>
              )}{" "}
              · checked {p.checked}
            </p>

            {!pb.ok && !own[sec.id] && p.monthly !== null && (() => {
              const be = breakEven(p.monthly, orderValue, hourly, setupHours);
              if (!be) return null;
              return (
                <div className={c.breakEven}>
                  <p className={c.headline}>
                    Pays for itself with about <b>{be.customers} extra {be.customers === 1 ? "customer" : "customers"} a month</b>
                    {be.firstMonthCustomers > be.customers ? ` (${be.firstMonthCustomers} in the first month, to cover about ${setupHours} hours of setup)` : ""}.
                  </p>
                  <span className={s.small}>
                    Or about {be.hours} hours of your time saved a month. Based on a typical {typical.label} order of about {whole(orderValue)} and your time at {whole(hourly)} an hour: industry estimates, not your numbers. Change them under &ldquo;Change the assumptions&rdquo;.
                  </span>
                </div>
              );
            })()}

            {!impact && p.monthly !== null && (
              <label className={cx(c.field, c.ownField)}>
                <span>Know what &ldquo;{lc(sec.heading)}&rdquo; costs you a month? Add it for a full payback estimate (optional).</span>
                <span className={c.money}>$<input inputMode="decimal" value={own[sec.id] ?? ""} placeholder="e.g. 300" aria-label={`Monthly cost of ${sec.heading}`} onChange={(e) => setOwn((o) => ({ ...o, [sec.id]: e.target.value.replace(/[^\d.]/g, "") }))} /></span>
              </label>
            )}

            {pb.ok ? (
              <>
                <div className={c.scen} role="table" aria-label={`Payback for ${r.name}`}>
                  {pb.scenarios.map((x) => (
                    <div key={x.scenario} className={cx(c.scenCol, x.scenario === "expected" && c.mid)} role="row">
                      <small role="cell">{SC_WORD[x.scenario]}</small>
                      <b role="cell" className={x.net < 0 ? c.neg : undefined}>{whole(x.net)}<small>/mo net</small></b>
                      <span role="cell" className={s.small}>{paybackWords(x.paybackDays)}</span>
                    </div>
                  ))}
                </div>
                {(() => {
                  const e = pb.scenarios[1]!;
                  return (
                    <p className={c.headline}>
                      Estimated payback period: <b>{paybackWords(e.paybackDays).toLowerCase()}</b>.{" "}
                      {kind === "time_cost"
                        ? `About ${e.hoursSaved ?? "?"} hours of your time back a month (worth ${whole(e.timeValue)}); we count ${Math.round(timeToMoney * 100)}% of that as money.`
                        : `About ${whole(e.revenue)} a month in new business is possible, not promised.`}
                    </p>
                  );
                })()}
                <details className={s.disc}>
                  <summary>How we calculated this</summary>
                  <div className={s.discBody}>
                    <ol className={c.steps}>{pb.steps.map((st) => <li key={st}>{st}</li>)}</ol>
                    {impact && <p className={s.small}>Where the problem&apos;s cost comes from: {impact.math}</p>}
                  </div>
                </details>
              </>
            ) : p.monthly === null ? (
              <div className={c.unknown}>
                <p>{pb.reason}</p>
              </div>
            ) : null}
          </article>
        );
      })}

      <details className={s.disc}>
        <summary>Change the assumptions</summary>
        <div className={cx(s.discBody, c.knobs)}>
          <label className={c.field}>
            <span>A typical order or job for you (industry estimate for a {typical.label}: {whole(typical.order)})</span>
            <span className={c.money}>$<input inputMode="decimal" value={orderValue} onChange={(e) => setOrderValue(Number(e.target.value.replace(/[^\d.]/g, "")) || 0)} /></span>
          </label>
          <label className={c.field}>
            <span>What an hour of your time is worth {startHourly.theirs ? "(your number)" : "(a starting guess: change it)"}</span>
            <span className={c.money}>$<input inputMode="decimal" value={hourly} onChange={(e) => setHourly(Number(e.target.value.replace(/[^\d.]/g, "")) || 0)} /></span>
          </label>
          <label className={c.field}>
            <span>Hours to set up each tool (we couldn&apos;t confirm setup times, so this is a guess)</span>
            <input inputMode="decimal" value={setupHours} onChange={(e) => setSetupHours(Number(e.target.value.replace(/[^\d.]/g, "")) || 0)} />
          </label>
          <label className={c.field}>
            <span>Share of saved time that really turns into money: {Math.round(timeToMoney * 100)}%</span>
            <input type="range" min={0} max={100} step={5} value={Math.round(timeToMoney * 100)} onChange={(e) => setTimeToMoney(Number(e.target.value) / 100)} />
          </label>
          {(["conservative", "expected", "optimistic"] as Scenario[]).map((k) => (
            <label className={c.field} key={k}>
              <span>{SC_WORD[k]}: the tool fixes {Math.round(share[k] * 100)}% of the problem</span>
              <input type="range" min={0} max={100} step={5} value={Math.round(share[k] * 100)} onChange={(e) => setShare((x) => ({ ...x, [k]: Number(e.target.value) / 100 }))} />
            </label>
          ))}
          <button type="button" className={s.link} style={{ justifySelf: "start", paddingLeft: 0 }} onClick={() => { setOrderValue(typical.order); setHourly(startHourly.value); setSetupHours(DEFAULT_SETUP_HOURS); setTimeToMoney(DEFAULT_TIME_TO_MONEY); setShare(DEFAULT_FIX_SHARE); }}>
            Reset to our starting numbers
          </button>
        </div>
      </details>
    </section>
  );
}
