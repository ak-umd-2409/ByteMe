"use client";

/**
 * Screens 5–7 of the approved wireframes (docs/specs/b-wireframes.md):
 *   5 Ways to fix it · 6 Tool detail · 7 Compare
 * Recommendations come from /api/recommend (Fit Score engine); tool facts come
 * from our safety-checked catalog (data/catalog), so every claim has a source.
 */
import { useState } from "react";
import { ToolLogo } from "@/components/ToolLogo.tsx";
import { leftOutReason } from "@/lib/catalog/fit.ts";
import type { CatalogRecord } from "@/lib/catalog/types.ts";
import type { BusinessProfile, Recommendation, RecommendationResult, ToolChoice } from "@/lib/recommend/types.ts";
import s from "./start.module.css";
import t from "./tools.module.css";
import { GUIDES } from "@/lib/advisor/knowledge.ts";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const date = (iso?: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The vendor's own logo (or a neutral letter badge when we have none). */
export function Logo({ id, name, big }: { id: string; name: string; big?: boolean }) {
  return <ToolLogo id={id} name={name} size={big ? 56 : 40} className={t.logo} />;
}

export function SafetyBadge({ badge, big }: { badge: CatalogRecord["badge"]; big?: boolean }) {
  if (badge === "verified") return <span className={cx(s.badge, s.ok, big && s.seal)}>✓ Verified</span>;
  if (badge === "blocked") return <span className={cx(s.badge, s.bad)}>⚠ Blocked</span>;
  return <span className={cx(s.badge, s.grey)}>◷ Not yet reviewed</span>;
}

/** Fictional demo tools (data/catalog/sample.json) say so wherever they appear. */
export function SampleTag() {
  return <span className={cx(s.chip, t.sampleTag)} title="A made-up tool for the demo. The company and website don't exist.">Sample · not a real product</span>;
}

/** The same deterministic 0–100 score used to rank this tool, with its five parts on hover. */
/** Fit Score as a ring that fills to the score: green for a strong fit, amber for okay, red for weak. */
export function FitScoreBadge({ choice, compact = false }: { choice: ToolChoice; compact?: boolean }) {
  const { total, parts } = choice.score;
  const n = Math.round(total);
  const level = n >= 70 ? "high" : n >= 50 ? "mid" : "low";
  const word = level === "high" ? "Strong fit" : level === "mid" ? "Okay fit" : "Weak fit";
  const detail = `${word}: ${n} out of 100. Problem ${parts.problem}/35, works with your tools ${parts.integration}/25, budget ${parts.budget}/20, setup ${parts.setup}/10, reviews ${parts.reviews}/10.`;
  return (
    <span className={cx(t.fit, compact && t.fitCompact, t[`fit_${level}`])} title={detail} aria-label={detail}>
      <span className={t.fitRing} style={{ ["--p" as string]: `${n}` } as React.CSSProperties}>
        <b>{n}</b>
      </span>
      {!compact && (
        <span className={t.fitText}>
          <b>{word}</b>
          <small>Fit Score</small>
        </span>
      )}
    </span>
  );
}

/** How a tool fits with what the owner already uses: the vendor's own connection, never ours. */
export function connection(r: CatalogRecord | undefined, currentTools: string[]): string {
  if (!r) return "";
  const mine = r.worksWith.filter((w) => w.type !== "none" && currentTools.some((x) => same(x, w.product)));
  const native = mine.filter((w) => w.type === "native").map((w) => w.product);
  const zap = mine.filter((w) => w.type === "zapier").map((w) => w.product);
  if (r.existingProduct && currentTools.some((x) => same(x, r.existingProduct!))) return `Built into your ${r.existingProduct}: switch it on there.`;
  if (native.length) return `Connects to your ${native.join(" and ")} with the vendor's built-in connection.`;
  if (zap.length) return `Connects to your ${zap.join(" and ")} through Zapier (a separate service).`;
  return "Works on its own: no connection to your other tools.";
}

/** The vendor's own website, never a link for made-up sample tools. */
export function OfficialLink({ r }: { r: CatalogRecord | undefined }) {
  if (!r || r.sample) return null;
  return (
    <a className={s.link} style={{ paddingLeft: 0, justifySelf: "start" }} href={r.vendor.website} target="_blank" rel="noreferrer">
      Official site ↗
    </a>
  );
}

const KIND_LABEL: Record<Recommendation["kind"], string> = {
  "already-have": "Use what you have",
  "quick-fix": "Quick fix · best fit",
  "starter-kit": "Starter Kit",
  "lowest-cost": "Lowest cost",
  alternative: "Another verified option",
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

/**
 * The engine's reason in plain words. When a tool hasn't published its setup time, the engine
 * ranks with a placeholder; that placeholder is never shown to the owner as a real estimate.
 */
function plainWhy(why: string, r: CatalogRecord | undefined): string {
  let out = why.replace(/^(.+?) addresses (.+?)( and works with [^.]+)?\. /, (_m, name: string, problem: string, works = "") => `${name} helps with “${problem}”${works}. `);
  if (!r || r.setupMinutes === "unknown") out = out.replace(/; setup is estimated at \d+ minutes\./, ".");
  return out;
}

/** Setup time from the tool's own record; nothing is shown as an estimate when it's unknown. */
function setupLine(r: CatalogRecord | undefined): string {
  if (!r) return "";
  const who = r.setupMode === "needs_help" ? "best with a helper" : r.setupMode === "self_serve" ? "you can do it yourself" : "";
  if (r.setupMinutes === "unknown") return who ? `Setup: ${who}` : "";
  return `Setup about ${r.setupMinutes} min${who ? `, ${who}` : ""}`;
}

/** Tools the owner chose for their plan: Part 4 problem id → tool id ("kit-<tool>" when a kit tool fits no listed problem). */
export type Chosen = Record<string, string>;

export function WaysToFix({
  recs, biz, catalog, picks, togglePick, openTool, openCompare, back, chosen = {}, onChosen,
}: {
  recs: RecommendationResult;
  biz: Biz;
  catalog: CatalogRecord[];
  picks: string[];
  togglePick: (id: string) => void;
  openTool: (id: string) => void;
  openCompare: () => void;
  back: () => void;
  chosen?: Chosen;
  onChosen?: (next: Chosen) => void;
}) {
  const [tab, setTab] = useState(0);
  const byId = new Map(catalog.map((r) => [r.id, r]));
  const problem = recs.problems[tab] ?? recs.problems[0];
  const problemKit = problem?.options.find((o) => o.kind === "starter-kit" && o.kitType === "problem");
  const kits = [...(recs.starterKits ?? []), ...(problemKit ? [problemKit] : [])].filter(
    (kit, index, all) => {
      const signature = kit.choices.map((choice) => choice.tool.id).sort().join("|");
      return all.findIndex((candidate) => candidate.choices.map((choice) => choice.tool.id).sort().join("|") === signature) === index;
    },
  );
  // One card per tool: "Done for you" is often the same tool as "Quick fix", so show it once.
  const options = (problem?.options ?? [])
    .filter((o) => o.kind !== "starter-kit")
    .filter((o, i, all) => all.findIndex((x) => x.kind !== "starter-kit" && x.choices[0]?.tool.id === o.choices[0]?.tool.id) === i);
  const worksWith = (c: ToolChoice) => Object.keys(c.tool.integrations).find((k) => biz.currentTools.some((x) => same(x, k)));
  // Which of the owner's problems a kit tool covers; a tool that fits none gets its own slot.
  const slotFor = (c: ToolChoice) => recs.problems.find((p) => c.tool.useCases.includes(p.problem.useCase))?.problem.id ?? `kit-${c.tool.id}`;
  const kitChosen = (kit: { choices: ToolChoice[] }) => kit.choices.every((c) => chosen[slotFor(c)] === c.tool.id);
  const chooseKit = (kit: { choices: ToolChoice[] }) => {
    if (!onChosen) return;
    const next = { ...chosen };
    if (kitChosen(kit)) for (const c of kit.choices) delete next[slotFor(c)];
    else for (const c of kit.choices) next[slotFor(c)] = c.tool.id;
    onChosen(next);
  };
  const chooseTool = (problemId: string, toolId: string) => {
    if (!onChosen) return;
    const next = { ...chosen };
    if (next[problemId] === toolId) delete next[problemId];
    else next[problemId] = toolId;
    onChosen(next);
  };

  // "Why not these?": the engine's exclusions plus blocked catalog tools for this problem.
  const left = new Map<string, { name: string; badge: CatalogRecord["badge"]; reason: string }>();
  for (const x of problem?.excluded ?? []) {
    const r = byId.get(x.toolId);
    left.set(x.toolId, { name: x.toolName, badge: r?.badge ?? "listed", reason: leftOutReason(r, x.reason) });
  }
  for (const r of catalog)
    if (r.badge === "blocked" && problem && r.useCases.includes(problem.problem.useCase) && !left.has(r.id))
      left.set(r.id, { name: r.name, badge: r.badge, reason: blockReason(r) });

  return (
    <>
      <h1 className={s.title}>Ways to fix it</h1>
      {[...(recs.starterKits ?? []), ...recs.problems.flatMap((p) => p.options)].some((o) => o.choices.some((c) => byId.get(c.tool.id)?.sample)) && (
        <p className={s.banner}>
          These are <b>sample tools for the demo</b>: the companies are made up. Real tools are being checked now, and only ones that pass our Safety Check and a person's review will appear here.
        </p>
      )}
      <p className={s.small} style={{ color: "var(--ink)", marginTop: -8 }}>
        You sign up with each company yourself: MainStreet AI doesn't connect to your accounts. Only ✓ Verified tools, ranked against {biz.budgetAssumed ? `${usd(biz.monthlyBudget)} a month, the budget we assumed because you skipped that question` : `your ${usd(biz.monthlyBudget)} monthly budget`}. Choose a starter kit, or one tool per problem, then make your plan.
      </p>

      {kits.length > 0 && (
        <section className={t.kitStack} aria-labelledby="starter-kits-title">
          <div>
            <h2 className={s.h2} id="starter-kits-title">Starter kits</h2>
            <p className={s.small}>Bundles of complementary tools: one can match your kind of business, and one can focus on the problem selected below.</p>
          </div>
          {kits.map((kit) => {
            const setupKnown = kit.choices.every((c) => typeof byId.get(c.tool.id)?.setupMinutes === "number");
            const setupMin = setupKnown ? kit.choices.reduce((n, c) => n + (byId.get(c.tool.id)?.setupMinutes as number), 0) : 0;
            return (
              <article className={cx(s.card, t.recommendationCard)} style={{ maxWidth: "none" }} key={`${kit.kitType}-${kit.kitFor}`}>
                <div className={s.cardTop}>
                  <span className={cx(s.badge, kit.kitType === "industry" ? s.ok : s.grey)}>
                    {kit.kitType === "industry" ? "Industry kit" : "Problem kit"} · {kit.choices.length} tools bundled
                  </span>
                  <div className={s.cardHead}>
                    <h3 className={s.h2}>{kit.title}</h3>
                    <span className={s.price}>{usd(kit.monthlyPrice)}<small>/mo total</small></span>
                  </div>
                  <span className={s.small}>
                    {kit.monthlyPrice <= biz.monthlyBudget ? `${usd(biz.monthlyBudget - kit.monthlyPrice)} under ${budgetWord(biz)}` : `${usd(kit.monthlyPrice - biz.monthlyBudget)} over ${budgetWord(biz)}`}
                    {setupMin ? ` · about ${setupMin < 60 ? `${setupMin} minutes` : `${Math.round(setupMin / 30) / 2} ${Math.round(setupMin / 30) / 2 === 1 ? "hour" : "hours"}`} to set up` : ""}
                  </span>
                </div>
                <div className={t.kitRows}>
                  {kit.choices.map((c) => (
                    <button type="button" className={t.kitRow} key={c.tool.id} onClick={() => openTool(c.tool.id)}>
                      <Logo id={c.tool.id} name={c.tool.name} />
                      <span className={t.kitName}><b>{c.tool.name}</b><FitScoreBadge choice={c} compact /></span>
                      <span className={t.meta}>
                        {[c.fitFor.title, usd(c.tool.monthlyPrice), worksWith(c) && `works with ${worksWith(c)}`, byId.get(c.tool.id)?.sample && "sample tool"].filter(Boolean).join(" · ")}
                      </span>
                      <span className={t.chev} aria-hidden="true">›</span>
                    </button>
                  ))}
                </div>
                <p className={t.whyPick}>{kit.description} {kit.note}</p>
                {onChosen && (
                  <div className={t.actions}>
                    <button type="button" className={cx(s.btn, kitChosen(kit) ? s.secondary : s.primary)} aria-pressed={kitChosen(kit)} onClick={() => chooseKit(kit)}>
                      {kitChosen(kit) ? "✓ Kit chosen · remove" : `Choose this kit (${kit.choices.length} tools)`}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      <h2 className={s.h2} style={{ marginTop: 8 }}>{kits.length ? "Or fix one problem at a time" : "Fix one problem at a time"}</h2>
      {recs.problems.length > 1 && (
        <div className={s.row} role="group" aria-label="Problem">
          {recs.problems.map((p, i) => (
            <button key={p.problem.id} type="button" className={s.chipsel} aria-pressed={i === tab} onClick={() => setTab(i)}>
              {i === tab ? "✓ " : ""}{p.problem.title}{chosen[p.problem.id] ? ` · ${catalog.find((r) => r.id === chosen[p.problem.id])?.name ?? "chosen"}` : ""}
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
            const isChosen = Boolean(problem) && chosen[problem!.problem.id] === c.tool.id;
            return (
              <article className={cx(s.card, t.recommendationCard, isChosen && t.chosenCard)} key={o.kind + c.tool.id}>
                <div className={s.cardTop}>
                  <span className={t.typetag}>{KIND_LABEL[o.kind]}</span>
                  <div className={s.cardHead}>
                    <div className={t.tname}><Logo id={c.tool.id} name={c.tool.name} /><h3 className={s.h3}>{c.tool.name}</h3></div>
                    <span className={s.price}>{usd(o.monthlyPrice)}<small>/mo</small></span>
                  </div>
                  <div className={s.row} style={{ gap: 6 }}>
                    <SafetyBadge badge={r?.badge ?? c.tool.status} />
                    <FitScoreBadge choice={c} />
                    {r?.sample && <SampleTag />}
                  </div>
                </div>
                <p className={t.whyPick}>{plainWhy(c.why, r)}</p>
                {c.warnings.map((warning) => (
                  <p className={s.banner} key={warning}><b>Before you switch this on:</b> {warning}</p>
                ))}
                <span className={s.small}>{connection(r, biz.currentTools)}</span>
                {c.badges.filter((b) => !/catalog/i.test(b)).length > 0 && (
                  <div className={s.row}>
                    {c.badges.filter((b) => !/catalog/i.test(b)).slice(0, 3).map((b) => <span className={s.chip} key={b}>{b}</span>)}
                  </div>
                )}
                {setupLine(r) && <span className={s.small}>{setupLine(r)}</span>}
                <OfficialLink r={r} />
                <div className={t.actions}>
                  {onChosen && problem ? (
                    <button type="button" className={cx(s.btn, isChosen ? s.secondary : s.primary)} aria-pressed={isChosen} onClick={() => chooseTool(problem.problem.id, c.tool.id)}>
                      {isChosen ? "✓ Chosen · remove" : "Choose this tool"}
                    </button>
                  ) : null}
                  <button type="button" className={cx(s.btn, s.secondary)} onClick={() => openTool(c.tool.id)}>See details</button>
                </div>
                <button type="button" className={s.link} style={{ justifySelf: "start", paddingLeft: 0 }} aria-pressed={picked} onClick={() => togglePick(c.tool.id)}>
                  {picked ? "✓ In compare" : "+ Compare"}
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <article className={cx(s.card, t.recommendationCard)} style={{ maxWidth: 760 }}>
          {(() => {
            const guide = problem ? GUIDES[problem.problem.useCase] : null;
            return (
              <>
                <div className={s.cardTop}>
                  <span className={t.typetag}>No tool needed to start</span>
                  <h3 className={s.h3}>You can do this yourself</h3>
                </div>
                {guide ? (
                  <p>
                    <b>{guide.freeFirst.title}.</b> {guide.freeFirst.detail}
                  </p>
                ) : (
                  <p>Start with the free step on the previous screen.</p>
                )}
                <span className={s.small}>We haven&apos;t checked a tool for &ldquo;{problem?.problem.title.toLowerCase()}&rdquo; yet, so we won&apos;t suggest one.</span>
                {biz.needsHelp && (
                  <div className={t.actions}>
                    <a className={cx(s.btn, s.secondary)} href={biz.help?.url ?? SBDC_URL} target="_blank" rel="noreferrer">
                      Find free help setting this up
                    </a>
                  </div>
                )}
              </>
            );
          })()}
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
  /** Leave out (e.g. on /tools/[id]) to hide the compare buttons. */
  togglePick?: () => void;
  openCompare?: () => void;
  canCompare: boolean;
}) {
  const price = r.pricing.small.monthlyUsd;
  const planTiers = ([
    ["small", "Small business"],
    ["medium", "Medium"],
    ["large", "Large"],
  ] as const).map(([key, label]) => ({ key, label, price: r.pricing[key].monthlyUsd }));
  const recommendedPlan = biz
    ? planTiers.find((tier) => typeof tier.price === "number" && tier.price <= biz.monthlyBudget) ?? planTiers.find((tier) => typeof tier.price === "number")
    : planTiers[0];
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
            <div className={s.row} style={{ gap: 6 }}>
              <SafetyBadge badge={r.badge} big />
              {choice && <FitScoreBadge choice={choice} />}
              {r.sample && <SampleTag />}
            </div>
            <div className={s.cardHead}>
              <div className={t.tname}><Logo id={r.id} name={r.name} big /><h1 className={s.h1}>{r.name}</h1></div>
              {price !== "unknown" && <span className={s.price}>{usd(price)}<small>/mo</small></span>}
            </div>
            <span className={s.small}>{r.category} · by {r.vendor.company} · last checked {date(r.lastChecked)}</span>
          </div>
          <p>{r.description.replace(/^Sample (scam-style )?tool \(fictional\)[.,]?\s*/i, "")}</p>
          {choice?.warnings.map((warning) => (
            <p className={s.banner} key={warning}><b>Before you switch this on:</b> {warning}</p>
          ))}
          {r.sample ? (
            <p className={s.banner}>Sample tool for the demo: the company and website are made up. You can't sign up for it.</p>
          ) : (
            <p className={s.small}>
              You sign up with {r.vendor.company} yourself; MainStreet AI doesn't connect to your accounts. <OfficialLink r={r} />
            </p>
          )}
          <a className={cx(s.btn, s.primary, s.block)} href="#get-help">Get help setting this up</a>
          {togglePick && (
            <div className={t.actions}>
              <button type="button" className={cx(s.btn, s.secondary)} aria-pressed={picked} onClick={togglePick}>{picked ? "✓ Comparing" : "+ Compare"}</button>
              {canCompare && openCompare && <button type="button" className={cx(s.btn, s.secondary)} onClick={openCompare}>Compare picked</button>}
            </div>
          )}
        </article>

        {biz && (
          <article className={s.card}>
            <div className={s.cardTop}><h2 className={s.h3}>Why it fits your business</h2></div>
            <ul className={t.ticks}>
              {yours.length > 0 && <li><b>Works with your {yours.map((w) => w.product).join(" and ")}.</b> {yours.some((w) => w.type === "native") ? "Built in, no extra app." : "Connects through Zapier."}</li>}
              {price !== "unknown" && (price <= biz.monthlyBudget ? <li><b>{usd(biz.monthlyBudget - price)} under {budgetWord(biz)}.</b> {r.pricing.cancellation !== "unknown" && r.pricing.cancellation}</li> : <li className={t.warnItem}><b>{usd(price - biz.monthlyBudget)} over {budgetWord(biz)}.</b></li>)}
              {r.setupMinutes !== "unknown" && <li><b>About {r.setupMinutes} minutes to set up</b>{r.setupMode === "self_serve" ? ", yourself." : ", best with a helper."}</li>}
              {r.languages.includes("Spanish") && <li><b>Speaks Spanish</b> too.</li>}
              {choice && <li className={t.q}><b>Why we picked it:</b> {plainWhy(choice.why, r)}</li>}
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

        <article className={cx(s.card, t.recommendationCard)}>
          <div className={s.cardTop}><h2 className={s.h3}>Pricing and our recommendation</h2></div>
          {recommendedPlan && (
            <div className={t.recommendedPlan}>
              <span className={cx(s.badge, s.ok)}>Recommended for you</span>
              <strong>{recommendedPlan.label} plan</strong>
              <span>
                {recommendedPlan.price === "unknown" ? "Pricing isn't public." : `${usd(recommendedPlan.price)}/mo`}
                {biz && typeof recommendedPlan.price === "number" && (recommendedPlan.price <= biz.monthlyBudget ? ` · fits your ${budgetWord(biz)}` : ` · ${usd(recommendedPlan.price - biz.monthlyBudget)} over ${budgetWord(biz)}`)}
              </span>
              <span className={s.small}>The Fit Score uses this plan's listed small-business price when it is available.</span>
            </div>
          )}
          <dl className={t.facts}>
            {planTiers.map((tier) => (
              <div className={tier.key === recommendedPlan?.key ? t.recommendedTier : undefined} key={tier.key}><dt>{tier.label}{tier.key === recommendedPlan?.key && <span className={t.recommendedLabel}>Recommended</span>}</dt><dd>{tier.price === "unknown" ? "Not public" : `${usd(tier.price)}/mo`}</dd></div>
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
    ["Fit Score", (r) => choices.get(r.id) ? `${choices.get(r.id)!.score.total}/100` : "—"],
    ["Cost a month", (r) => (price(r) === null ? "Not public" : usd(price(r)!))],
    ["Works with your tools", yours],
    ["Setup", (r) => (r.setupMinutes === "unknown" ? "Unknown" : `About ${r.setupMinutes} min, ${r.setupMode === "self_serve" ? "yourself" : "with help"}`)],
    ["Speaks Spanish", (r) => (r.languages.includes("Spanish") ? "Yes" : "No")],
    ["OK for Maryland call recording", (r) => (r.rulesFlags.recordsCalls === false ? "Doesn't record calls" : r.rulesFlags.announcesRecording === true ? "Yes, tells callers" : "Not confirmed")],
    ["Trains AI on your data", (r) => r.privacyCard.trainsOnYourData.plain],
    ["Contract", (r) => (r.pricing.contract === "monthly" ? "None" : r.pricing.contract === "annual" ? "Yearly" : "Not public")],
    ["Last checked", (r) => date(r.lastChecked)],
    ["Real product?", (r) => (r.sample ? "No: a sample for the demo" : "Yes")],
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
