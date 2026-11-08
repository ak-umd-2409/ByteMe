"use client";

/**
 * Screens 5–7 of the approved wireframes (docs/specs/b-wireframes.md):
 *   5 Ways to fix it · 6 Tool detail · 7 Compare
 * Recommendations come from /api/recommend (Fit Score engine); tool facts come
 * from our safety-checked catalog (data/catalog), so every claim has a source.
 */
import { useState } from "react";
import type { CatalogRecord } from "@/lib/catalog/types.ts";
import type { BusinessProfile, Recommendation, RecommendationResult, ToolChoice } from "@/lib/recommend/types.ts";
import s from "./start.module.css";
import t from "./tools.module.css";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const date = (iso?: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const LOGO_COLORS = ["#1f4e79", "#8a4b14", "#2e6b5e", "#4b3f72", "#6b4f2a", "#1d6a8a", "#5a2a2a"];
export function Logo({ id, name, big }: { id: string; name: string; big?: boolean }) {
  const words = name.replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className={cx(t.logo, big && t.logoBig)} style={{ background: LOGO_COLORS[h % LOGO_COLORS.length] }} aria-hidden="true">
      {initials}
    </span>
  );
}

export function SafetyBadge({ badge, big }: { badge: CatalogRecord["badge"]; big?: boolean }) {
  if (badge === "verified") return <span className={cx(s.badge, s.ok, big && s.seal)}>✓ Verified</span>;
  if (badge === "blocked") return <span className={cx(s.badge, s.bad)}>⚠ Blocked</span>;
  return <span className={cx(s.badge, s.grey)}>◷ Not yet reviewed</span>;
}

const KIND_LABEL: Record<Recommendation["kind"], string> = {
  "already-have": "Use what you have",
  "quick-fix": "Quick fix · best fit",
  "starter-kit": "Starter Kit",
  "lowest-cost": "Lowest cost",
  "done-for-you": "Done for you",
};

/** The first plain reason a tool was blocked or held, for "Why not these?". */
export function blockReason(r: CatalogRecord): string {
  if (r.safetyCheck.redFlags.length) return r.safetyCheck.redFlags[0];
  const failed = Object.values(r.safetyCheck.checks).find((c) => c.result === "fail");
  if (r.badge === "listed") return "Waiting for a person to check it. We never recommend tools before that.";
  return failed?.reason ?? "It didn't pass our safety check.";
}

const SBDC_URL = "https://www.marylandsbdc.org/";
const SCORE_URL = "https://www.score.org/find-mentor";

export type Biz = Pick<BusinessProfile, "monthlyBudget" | "currentTools" | "needsHelp"> & {
  /** True when the owner skipped the budget question and we assumed it (/api/journey/answer → budget.assumed). */
  budgetAssumed?: boolean;
  /** The SBDC office for the business's county (/api/journey/answer → localHelp). */
  help?: { name: string; county: string; url: string; phone: string | null } | null;
};

/** "your budget" or "the budget we assumed", so an assumed number never reads as the owner's. */
const budgetWord = (biz: Biz | null) => (biz?.budgetAssumed ? "the budget we assumed" : "your budget");

// ---------------------------------------------------------------- 5 · Ways to fix it

export function WaysToFix({
  recs, biz, catalog, picks, togglePick, openTool, openCompare, back,
}: {
  recs: RecommendationResult;
  biz: Biz;
  catalog: CatalogRecord[];
  picks: string[];
  togglePick: (id: string) => void;
  openTool: (id: string) => void;
  openCompare: () => void;
  back: () => void;
}) {
  const [tab, setTab] = useState(0);
  const byId = new Map(catalog.map((r) => [r.id, r]));
  const kit = recs.problems.flatMap((p) => p.options).find((o) => o.kind === "starter-kit");
  const problem = recs.problems[tab] ?? recs.problems[0];
  const options = (problem?.options ?? []).filter((o) => o.kind !== "starter-kit");
  const problemFor = (c: ToolChoice) => recs.problems.find((p) => c.tool.useCases.includes(p.problem.useCase))?.problem.title;
  const worksWith = (c: ToolChoice) => Object.keys(c.tool.integrations).find((k) => biz.currentTools.some((x) => same(x, k)));

  // "Why not these?": the engine's exclusions plus blocked catalog tools for this problem.
  const left = new Map<string, { name: string; badge: CatalogRecord["badge"]; reason: string }>();
  for (const x of problem?.excluded ?? []) {
    const r = byId.get(x.toolId);
    left.set(x.toolId, { name: x.toolName, badge: r?.badge ?? "listed", reason: r ? blockReason(r) : x.reason });
  }
  for (const r of catalog)
    if (r.badge === "blocked" && problem && r.useCases.includes(problem.problem.useCase) && !left.has(r.id))
      left.set(r.id, { name: r.name, badge: r.badge, reason: blockReason(r) });

  const setupMin = kit ? kit.choices.reduce((n, c) => n + c.tool.setupMinutes, 0) : 0;

  return (
    <>
      <h1 className={s.h1}>Ways to fix it</h1>
      <p className={s.small} style={{ color: "var(--ink)", marginTop: -8 }}>
        Only ✓ Verified tools. Each one fits {biz.budgetAssumed ? `${usd(biz.monthlyBudget)} a month, the budget we assumed because you skipped that question,` : `your ${usd(biz.monthlyBudget)} a month`} and works with what you already use where it can.
      </p>

      {kit && (
        <article className={s.card} style={{ maxWidth: "none" }}>
          <div className={s.cardTop}>
            <span className={cx(s.badge, s.ok)}>Starter Kit · fixes {kit.choices.length} problems together</span>
            <div className={s.cardHead}>
              <h2 className={s.h2}>{kit.choices.length} tools that work together</h2>
              <span className={s.price}>{usd(kit.monthlyPrice)}<small>/mo</small></span>
            </div>
            <span className={s.small}>
              {kit.monthlyPrice <= biz.monthlyBudget ? `${usd(biz.monthlyBudget - kit.monthlyPrice)} under ${budgetWord(biz)}` : `${usd(kit.monthlyPrice - biz.monthlyBudget)} over ${budgetWord(biz)}`}
              {setupMin ? ` · about ${Math.max(1, Math.round(setupMin / 30) / 2)} hours to set up` : ""}
            </span>
          </div>
          <div className={t.kitRows}>
            {kit.choices.map((c) => (
              <button type="button" className={t.kitRow} key={c.tool.id} onClick={() => openTool(c.tool.id)}>
                <Logo id={c.tool.id} name={c.tool.name} />
                <b>{c.tool.name}</b>
                <span className={t.meta}>
                  {[problemFor(c), usd(c.tool.monthlyPrice), worksWith(c) && `works with ${worksWith(c)}`].filter(Boolean).join(" · ")}
                </span>
                <span className={t.chev} aria-hidden="true">›</span>
              </button>
            ))}
          </div>
          <p className={t.whyPick}>{kit.description} {kit.note}</p>
        </article>
      )}

      <h2 className={s.h2} style={{ marginTop: 8 }}>{kit ? "Or fix one problem at a time" : "Fix one problem at a time"}</h2>
      {recs.problems.length > 1 && (
        <div className={s.row} role="group" aria-label="Problem">
          {recs.problems.map((p, i) => (
            <button key={p.problem.id} type="button" className={s.chipsel} aria-pressed={i === tab} onClick={() => setTab(i)}>
              {i === tab ? "✓ " : ""}{p.problem.title}
            </button>
          ))}
        </div>
      )}

      {options.length > 0 ? (
        <div className={s.grid3} style={options.length === 1 ? { maxWidth: 560 } : undefined}>
          {options.map((o) => {
            const c = o.choices[0];
            const r = byId.get(c.tool.id);
            const picked = picks.includes(c.tool.id);
            return (
              <article className={s.card} key={o.kind + c.tool.id}>
                <div className={s.cardTop}>
                  <span className={t.typetag}>{KIND_LABEL[o.kind]}</span>
                  <div className={s.cardHead}>
                    <div className={t.tname}><Logo id={c.tool.id} name={c.tool.name} /><h3 className={s.h3}>{c.tool.name}</h3></div>
                    <span className={s.price}>{usd(o.monthlyPrice)}<small>/mo</small></span>
                  </div>
                  <SafetyBadge badge={r?.badge ?? c.tool.status} />
                </div>
                <p className={t.whyPick}>{c.why}</p>
                {c.badges.filter((b) => !/catalog/i.test(b)).length > 0 && (
                  <div className={s.row}>
                    {c.badges.filter((b) => !/catalog/i.test(b)).slice(0, 3).map((b) => <span className={s.chip} key={b}>{b}</span>)}
                  </div>
                )}
                <span className={s.small}>Fit {c.score.total} of 100 · setup about {c.tool.setupMinutes} min</span>
                <div className={t.actions}>
                  <button type="button" className={cx(s.btn, s.primary)} onClick={() => openTool(c.tool.id)}>See details</button>
                  <button type="button" className={cx(s.btn, s.secondary)} aria-pressed={picked} onClick={() => togglePick(c.tool.id)}>
                    {picked ? "✓ Comparing" : "+ Compare"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <article className={s.card} style={{ maxWidth: 760 }}>
          <div className={s.cardTop}>
            <span className={t.typetag}>No checked tool yet</span>
            <h3 className={s.h3}>We won't suggest a tool we haven't checked</h3>
          </div>
          <p>None of the tools we know for &ldquo;{problem?.problem.title}&rdquo; has passed our safety check yet. The first step on the previous screen works without a tool, and a free advisor can help you choose one.</p>
          <div className={t.actions}>
            <a className={cx(s.btn, s.primary)} href={biz.help?.url ?? SBDC_URL} target="_blank" rel="noreferrer">Get free help from the Maryland SBDC</a>
          </div>
        </article>
      )}

      {left.size > 0 && (
        <details className={s.disc}>
          <summary>Why not these? <span className={s.small}>{left.size} left out</span></summary>
          <div className={s.discBody}>
            <ul className={t.leftout}>
              {[...left.entries()].map(([id, x]) => (
                <li key={id}>
                  <SafetyBadge badge={x.badge} />
                  <span className={t.tname}><Logo id={id} name={x.name} /><b>{x.name}</b></span>
                  <span className={s.small}>{x.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}

      <button type="button" className={cx(s.btn, s.secondary)} style={{ justifySelf: "start" }} onClick={back}>
        Back to what's costing you
      </button>

      {picks.length >= 2 && (
        <div className={t.cmpbar} role="region" aria-label="Compare">
          <span><b>{picks.length} picked</b> · {picks.map((id) => byId.get(id)?.name ?? id).join(", ")}</span>
          <button type="button" className={cx(s.btn, s.primary, t.cmpGo)} onClick={openCompare}>Compare</button>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- 6 · Tool detail


export function ToolDetail({
  r, choice, biz, picked, togglePick, openCompare, canCompare,
}: {
  r: CatalogRecord;
  choice?: ToolChoice;
  biz: Biz | null;
  picked: boolean;
  togglePick: () => void;
  openCompare: () => void;
  canCompare: boolean;
}) {
  const price = r.pricing.small.monthlyUsd;
  const ww = r.worksWith.filter((w) => w.type !== "none");
  const yours = biz ? ww.filter((w) => biz.currentTools.some((x) => same(x, w.product))) : [];
  const p = r.privacyCard;
  const ok = (k: keyof typeof p, good: (a: string) => boolean) => (p[k].answer === "unknown" ? t.q : good(p[k].answer.toLowerCase()) ? "" : t.warnItem);
  const checks = r.safetyCheck.checks;
  const trustLine = (key: keyof typeof checks, fallback: string) => ({ cls: checks[key].result === "pass" ? "" : checks[key].result === "fail" ? t.badItem : t.warnItem, text: checks[key].reason || fallback });
  const help = (
    <article className={s.card} id="get-help">
      <div className={s.cardTop}><h2 className={s.h3}>Get help setting this up</h2></div>
      <a className={t.helpRow} href={biz?.help?.url ?? SBDC_URL} target="_blank" rel="noreferrer">
        <b>{biz?.help?.name ?? "Maryland SBDC"}</b>
        <span>{biz?.help ? `Free advising for ${biz.help.county} County${biz.help.phone ? ` · ${biz.help.phone}` : ""}` : "Free advising from the office for your county"}</span>
        <span className={t.chev} aria-hidden="true">›</span>
      </a>
      <a className={t.helpRow} href={SCORE_URL} target="_blank" rel="noreferrer"><b>SCORE mentor</b><span>Free one-on-one help, by video or in person</span><span className={t.chev} aria-hidden="true">›</span></a>
      <div className={t.helpRow} aria-disabled="true"><b>Local helper</b><span>A vetted student or freelancer · coming soon</span></div>
    </article>
  );

  return (
    <div className={s.cols}>
      <div className={s.col}>
        <article className={s.card}>
          <div className={s.cardTop}>
            <SafetyBadge badge={r.badge} big />
            <div className={s.cardHead}>
              <div className={t.tname}><Logo id={r.id} name={r.name} big /><h1 className={s.h1}>{r.name}</h1></div>
              {price !== "unknown" && <span className={s.price}>{usd(price)}<small>/mo</small></span>}
            </div>
            <span className={s.small}>{r.category} · by {r.vendor.company} · last checked {date(r.lastChecked)}</span>
          </div>
          <p>{r.description.replace(/^Sample (scam-style )?tool \(fictional\)[.,]?\s*/i, "")}</p>
          {r.sample && <span className={s.hint}>Sample tool for the demo: the company and website are made up.</span>}
          <a className={cx(s.btn, s.primary, s.block)} href="#get-help">Get help setting this up</a>
          <div className={t.actions}>
            <button type="button" className={cx(s.btn, s.secondary)} aria-pressed={picked} onClick={togglePick}>{picked ? "✓ Comparing" : "+ Compare"}</button>
            {canCompare && <button type="button" className={cx(s.btn, s.secondary)} onClick={openCompare}>Compare picked</button>}
          </div>
        </article>

        {biz && (
          <article className={s.card}>
            <div className={s.cardTop}><h2 className={s.h3}>Why it fits your business</h2></div>
            <ul className={t.ticks}>
              {yours.length > 0 && <li><b>Works with your {yours.map((w) => w.product).join(" and ")}.</b> {yours.some((w) => w.type === "native") ? "Built in, no extra app." : "Connects through Zapier."}</li>}
              {price !== "unknown" && (price <= biz.monthlyBudget ? <li><b>{usd(biz.monthlyBudget - price)} under {budgetWord(biz)}.</b> {r.pricing.cancellation}</li> : <li className={t.warnItem}><b>{usd(price - biz.monthlyBudget)} over {budgetWord(biz)}.</b></li>)}
              {r.setupMinutes !== "unknown" && <li><b>About {r.setupMinutes} minutes to set up</b>{r.setupMode === "self_serve" ? ", yourself." : ", best with a helper."}</li>}
              {r.languages.includes("Spanish") && <li><b>Speaks Spanish</b> too.</li>}
              {choice && <li className={t.q}><b>Fit {choice.score.total} of 100.</b> {choice.why}</li>}
            </ul>
          </article>
        )}

        {r.rulesFlags.recordsCalls === true && (
          <article className={s.card}>
            <div className={s.cardTop}><h2 className={s.h3}>Rules for your business</h2></div>
            {r.rulesFlags.announcesRecording === true ? (
              <p><span className={cx(s.badge, s.ok)}>✓ OK</span> Maryland says callers must be told when a call is recorded. This tool tells them at the start of every call.</p>
            ) : (
              <p><span className={cx(s.badge, s.warn)}>! Check</span> Maryland says callers must be told when a call is recorded. We couldn't confirm this tool does that.</p>
            )}
            <p className={s.small}>Not legal advice. Ask your SBDC advisor.</p>
          </article>
        )}
      </div>

      <div className={s.col}>
        <article className={s.card}>
          <div className={s.cardTop}><h2 className={s.h3}>Why you can trust it</h2></div>
          <ul className={t.ticks}>
            {[trustLine("whoIsBehind", "Who runs it"), trustLine("domainAge", "Website age"), trustLine("pricingClarity", "Prices"), trustLine("privacyPolicy", "Privacy policy")].map((x) => (
              <li key={x.text} className={x.cls}>{x.text}</li>
            ))}
            {r.reviewedAt && <li><b>A person reviewed it</b> on {date(r.reviewedAt)}. We check every tool again every 90 days.</li>}
          </ul>
        </article>

        <article className={s.card}>
          <div className={s.cardTop}><h2 className={s.h3}>What happens to your data</h2></div>
          <ul className={t.ticks}>
            <li className={ok("trainsOnYourData", (a) => a === "no")}>{p.trainsOnYourData.plain}</li>
            <li className={ok("canDeleteData", (a) => a === "yes")}>{p.canDeleteData.plain}</li>
            <li className={ok("whereStored", () => true)}>{p.whereStored.plain}</li>
            <li className={ok("sharesOrSells", (a) => a === "no")}>{p.sharesOrSells.plain}</li>
            <li className={ok("securityCertification", (a) => a === "yes")}>{p.securityCertification.plain}</li>
          </ul>
          <details className={s.disc}>
            <summary>Show where we read this</summary>
            <div className={s.discBody}>
              {Object.values(p).filter((x) => x.quote).map((x) => (
                <p className={s.small} key={x.quote!} style={{ color: "var(--ink)" }}>
                  <span className={s.quote}>{x.quote}</span> {x.sourceUrl && <span>· {x.sourceUrl.replace(/^https?:\/\//, "")}</span>}
                </p>
              ))}
            </div>
          </details>
        </article>

        <article className={s.card}>
          <div className={s.cardTop}><h2 className={s.h3}>Price</h2></div>
          <dl className={t.facts}>
            {(["small", "medium", "large"] as const).map((k) => (
              <div key={k}><dt>{k === "small" ? "Small business" : k === "medium" ? "Medium" : "Large"}</dt><dd>{r.pricing[k].monthlyUsd === "unknown" ? "Not public" : `${usd(r.pricing[k].monthlyUsd as number)}/mo`}</dd></div>
            ))}
            <div><dt>Contract</dt><dd>{r.pricing.contract === "monthly" ? "None, monthly" : r.pricing.contract === "annual" ? "Yearly" : "Not public"}</dd></div>
          </dl>
          <p className={s.small}>Prices as of {r.pricing.asOf}.</p>
        </article>

        {help}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 7 · Compare

export function Compare({ rs, choices, biz, openTool }: { rs: CatalogRecord[]; choices: Map<string, ToolChoice>; biz: Biz | null; openTool: (id: string) => void }) {
  const price = (r: CatalogRecord) => (r.pricing.small.monthlyUsd === "unknown" ? null : (r.pricing.small.monthlyUsd as number));
  const yours = (r: CatalogRecord) => {
    const list = r.worksWith.filter((w) => w.type !== "none" && (!biz || biz.currentTools.some((x) => same(x, w.product)))).map((w) => w.product);
    return list.length ? list.join(", ") : biz ? "None of yours" : "—";
  };
  const rows: [string, (r: CatalogRecord) => string][] = [
    ["Cost a month", (r) => (price(r) === null ? "Not public" : usd(price(r)!))],
    ["Works with your tools", yours],
    ["Setup", (r) => (r.setupMinutes === "unknown" ? "Unknown" : `About ${r.setupMinutes} min, ${r.setupMode === "self_serve" ? "yourself" : "with help"}`)],
    ["Speaks Spanish", (r) => (r.languages.includes("Spanish") ? "Yes" : "No")],
    ["OK for Maryland call recording", (r) => (r.rulesFlags.recordsCalls === false ? "Doesn't record calls" : r.rulesFlags.announcesRecording === true ? "Yes, tells callers" : "Not confirmed")],
    ["Trains AI on your data", (r) => r.privacyCard.trainsOnYourData.plain],
    ["Contract", (r) => (r.pricing.contract === "monthly" ? "None" : r.pricing.contract === "annual" ? "Yearly" : "Not public")],
    ["Last checked", (r) => date(r.lastChecked)],
  ];
  const best = [...rs].sort((a, b) => (choices.get(b.id)?.score.total ?? 0) - (choices.get(a.id)?.score.total ?? 0))[0];
  const cheap = [...rs].filter((r) => price(r) !== null).sort((a, b) => price(a)! - price(b)!)[0];
  const take =
    best && cheap && best.id !== cheap.id
      ? `${cheap.name} is ${usd(price(best)! - price(cheap)!)} cheaper, but ${best.name} is the better fit for your business${yours(best) !== "None of yours" ? ` and works with your ${yours(best)}` : ""}.`
      : best
        ? `${best.name} is the best fit and the lowest price here.`
        : "";

  return (
    <>
      <h1 className={s.h1}>Compare</h1>
      <p className={s.small} style={{ color: "var(--ink)", marginTop: -8 }}>Rows that differ are marked.</p>
      <div className={t.cmpwrap}>
        <table className={t.cmpT}>
          <thead>
            <tr>
              <th scope="col"><span className={s.sr}>Question</span></th>
              {rs.map((r) => (
                <th scope="col" key={r.id}>
                  <SafetyBadge badge={r.badge} />
                  <div className={t.tname}><Logo id={r.id} name={r.name} /><b>{r.name}</b></div>
                  {best?.id === r.id && rs.length > 1 && <span className={t.pickme}>Best fit</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, fn]) => {
              const vals = rs.map(fn);
              return (
                <tr key={label} className={new Set(vals).size > 1 ? t.diff : undefined}>
                  <th scope="row">{label}</th>
                  {vals.map((v, i) => <td key={rs[i].id}>{v}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {take && <p className={t.whyPick} style={{ maxWidth: 900 }}><b>Our take:</b> {take}</p>}
      <div className={t.actions} style={{ maxWidth: 900 }}>
        {rs.map((r, i) => (
          <button key={r.id} type="button" className={cx(s.btn, i === 0 ? s.primary : s.secondary)} onClick={() => openTool(r.id)}>
            See {r.name}
          </button>
        ))}
      </div>
    </>
  );
}
