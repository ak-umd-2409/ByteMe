"use client";

import { useEffect, useMemo, useState } from "react";
import {
  demoBusiness,
  demoCatalog,
  demoProblems,
} from "../../data/mock/recommendations.ts";
import { recommend } from "../../lib/recommend/engine.ts";
import {
  BusinessFinder,
  ProblemsOverview,
  useLiveBusiness,
  type LiveBusiness,
} from "../../components/parts23/LiveBusiness.tsx";
import {
  AboutYou,
  AddProblem,
  ContextStrip,
  RulesPanel,
} from "../../components/parts23/BusinessContext.tsx";
import { api, type PaybackResult, type ProblemKey } from "../../lib/client/parts23.ts";
import type {
  BusinessProfile,
  Recommendation,
  ToolChoice,
} from "../../lib/recommend/types.ts";

const money = (value: number) => (value === 0 ? "Free" : `$${value}`);
const kindIcon: Record<string, string> = {
  "already-have": "↗",
  "quick-fix": "✦",
  "starter-kit": "▦",
  "lowest-cost": "$",
  "done-for-you": "◉",
};
const kindClass: Record<string, string> = {
  "already-have": "mint",
  "quick-fix": "blue",
  "starter-kit": "orange",
  "lowest-cost": "gray",
  "done-for-you": "violet",
};

function OptionCard({
  option,
  onCompare,
  onDetails,
  selected,
  payback,
}: {
  option: Recommendation;
  onCompare: (id: string) => void;
  onDetails: (choice: ToolChoice) => void;
  selected: string[];
  payback?: PaybackResult;
}) {
  return (
    <article className={`option-card ${kindClass[option.kind]}`}>
      <div className="option-top">
        <span className="option-icon" aria-hidden="true">
          {kindIcon[option.kind]}
        </span>
        <span className="option-type">{option.title}</span>
        <span className="option-price">
          {money(option.monthlyPrice)}
          <small>/mo</small>
        </span>
      </div>
      <p className="option-description">{option.description}</p>
      {payback && payback.days !== null && payback.days > 0 && (
        <p className="option-description" style={{ fontWeight: 600, color: "var(--green, #255d4a)" }} title={payback.math ?? undefined}>
          ⏱ {payback.label}
        </p>
      )}
      <div className="choice-list">
        {option.choices.map((choice) => (
          <div className="choice" key={choice.tool.id}>
            <div className="choice-head">
              <div>
                <div className="choice-name">{choice.tool.name}</div>
                <div className="choice-category">{choice.tool.category}</div>
              </div>
              <span className="score-pill" title="Fit Score out of 100">
                {choice.score.total} fit
              </span>
            </div>
            <p>{choice.why}</p>
            <div className="badge-row">
              {choice.badges.slice(0, 3).map((badge) => (
                <span className="mini-badge" key={badge}>
                  {badge}
                </span>
              ))}
            </div>
            <div className="choice-actions">
              <button
                type="button"
                className="text-button"
                onClick={() => onDetails(choice)}
              >
                See why + details <span aria-hidden="true">↗</span>
              </button>
              <button
                type="button"
                className={`compare-button ${selected.includes(choice.tool.id) ? "selected" : ""}`}
                onClick={() => onCompare(choice.tool.id)}
                aria-pressed={selected.includes(choice.tool.id)}
              >
                {selected.includes(choice.tool.id)
                  ? "✓ In compare"
                  : "+ Compare"}
              </button>
            </div>
          </div>
        ))}
      </div>
      {option.note && <p className="option-note">{option.note}</p>}
      {option.helpUrl && (
        <a
          className="help-link"
          href={option.helpUrl}
          target="_blank"
          rel="noreferrer"
        >
          Find a Maryland SBDC advisor ↗
        </a>
      )}
    </article>
  );
}

export default function Home() {
  const [business, setBusiness] = useState<BusinessProfile>(demoBusiness);
  const [problemId, setProblemId] = useState(demoProblems[0].id);
  const [selected, setSelected] = useState<string[]>([]);
  const [details, setDetails] = useState<ToolChoice | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [lookupUrl, setLookupUrl] = useState("");
  // Real business from the Parts 2 & 3 backend; Mike's sample stays until one is chosen.
  const biz = useLiveBusiness();
  const live = biz.live;
  const problems = live
    ? live.recommendationInput.ok
      ? live.recommendationInput.request.problems
      : []
    : demoProblems;
  const syncBusiness = (next: LiveBusiness) => {
    if (!next.recommendationInput.ok) return;
    const fresh = next.recommendationInput.request.business;
    setBusiness((prev) => ({
      ...fresh,
      monthlyBudget: prev.monthlyBudget,
      currentTools: prev.currentTools,
      needsHelp: prev.needsHelp,
    }));
  };
  const chooseBusiness = async (placeId: string, pastedReviews?: string) => {
    const next = await biz.choose(
      placeId,
      { monthlyBudget: business.monthlyBudget, needsHelp: business.needsHelp },
      pastedReviews,
    );
    if (next?.recommendationInput.ok) {
      setBusiness(next.recommendationInput.request.business);
      setProblemId(next.recommendationInput.request.problems[0]?.id ?? "");
      setSelected([]);
      document.getElementById("problems")?.scrollIntoView({ behavior: "smooth" });
    }
  };
  const result = useMemo(
    () => recommend(business, problems, demoCatalog),
    [business, problems],
  );
  const current =
    result.problems.find((row) => row.problem.id === problemId) ??
    result.problems[0];
  // Spec 3.3: "pays for itself in X days", calculated on the server for the options shown.
  const [paybacks, setPaybacks] = useState<Record<string, PaybackResult>>({});
  const currentKey = current?.problem.id.replace(/^problem-/, "") as ProblemKey | undefined;
  const optionPrices = current?.options.map((o) => `${o.kind}:${o.monthlyPrice}`).join("|") ?? "";
  useEffect(() => {
    if (!live || !current || !currentKey) return setPaybacks({});
    const controller = new AbortController();
    api
      .payback(
        {
          industry: live.profile.business.industry.value ?? "other",
          items: current.options.map((o) => ({ problemKey: currentKey, monthlyCost: o.monthlyPrice })),
          assumptions: biz.assumptions,
        },
        controller.signal,
      )
      .then((res) =>
        setPaybacks(Object.fromEntries(current.options.map((o, i) => [o.kind, res.results[i]]))),
      )
      .catch(() => setPaybacks({}));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, currentKey, optionPrices, biz.assumptions]);
  const toolNames = [
    ...new Set([
      "Square",
      "QuickBooks",
      "Google Business Profile",
      ...(live?.analysis.technology.detected.map((t) => t.name) ?? []),
      ...business.currentTools,
    ]),
  ];
  const toggleTool = (name: string) =>
    setBusiness((prev) => ({
      ...prev,
      currentTools: prev.currentTools.includes(name)
        ? prev.currentTools.filter((t) => t !== name)
        : [...prev.currentTools, name],
    }));
  const toggleCompare = (id: string) =>
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < 3
          ? [...prev, id]
          : [...prev.slice(1), id],
    );
  const comparison = selected
    .map((id) =>
      result.problems
        .flatMap((row) => row.options.flatMap((option) => option.choices))
        .find((c) => c.tool.id === id),
    )
    .filter((c): c is ToolChoice => !!c);
  const normalizedLookup = lookupUrl.trim().replace(/\/$/, "").toLowerCase();
  const foundTool =
    normalizedLookup &&
    demoCatalog.find(
      (tool) =>
        tool.website.toLowerCase().replace(/\/$/, "") === normalizedLookup,
    );

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <a href="#top" className="brand" aria-label="MainStreet AI home">
            <span className="brand-mark" aria-hidden="true">
              m<span>.</span>
            </span>
            <span>
              MainStreet <em>AI</em>
            </span>
          </a>
          <nav aria-label="Primary">
            <a href="#recommendations">Recommendations</a>
            <a href="#how-it-works">How it works</a>
            <a href="#method">Our method</a>
          </nav>
          <span className="header-tag">Team ByteMe · prototype</span>
        </div>
      </header>
      <main id="top">
        <section className="hero">
          <div className="hero-inner">
            <div className="hero-copy">
              <div className="eyebrow">
                <span className="eyebrow-dot" /> Made for the people who keep
                Main Street moving
              </div>
              <h1>
                Good tools.
                <br />
                <span>Better decisions.</span>
              </h1>
              <p>
                Tell us what is slowing your business down. We’ll show you a few
                practical ways to fix it, explain each pick, and help you take
                the first step.
              </p>
              <a href="#recommendations" className="hero-cta">
                Check a real Maryland business <span aria-hidden="true">↗</span>
              </a>
              <div className="hero-meta">
                <span>✓ Clear monthly costs</span>
                <span>✓ Works with your tools</span>
                <span>✓ Human help available</span>
              </div>
            </div>
            <div
              className="hero-art"
              aria-label="A sample recommendation plan for a local business"
            >
              <div className="art-orbit orbit-one" />
              <div className="art-orbit orbit-two" />
              <div className="art-card art-card-main">
                <div className="art-card-top">
                  <span className="art-square">M</span>
                  <span>
                    <strong>Mike’s Heating & Cooling</strong>
                    <small>Frederick County, Maryland</small>
                  </span>
                  <span className="art-check">✓</span>
                </div>
                <div className="art-divider" />
                <div className="art-overline">YOUR TOP OPPORTUNITY</div>
                <div className="art-headline">
                  Catch calls while you’re on a job
                </div>
                <div className="art-progress">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="art-bottom">
                  <span>3 ways to solve it</span>
                  <span>from $24/mo →</span>
                </div>
              </div>
              <div className="art-float float-one">
                ✦ <span>Fits your budget</span>
              </div>
              <div className="art-float float-two">
                ↗ <span>Works with Square</span>
              </div>
            </div>
          </div>
        </section>
        <section className="demo-banner" role="note">
          <div>
            <strong>Interactive demo</strong> ·{" "}
            {live
              ? `${business.name} is a real business, read from public listings, its website and reviews. The tool catalog below is illustrative.`
              : "Pick a real Maryland business below, or explore the sample (Mike). The tool catalog is illustrative."}{" "}
            “Verified” badges show how a future human-reviewed catalog would
            work; they are not real vendor endorsements.
          </div>
          <a href="#method">See the method ↗</a>
        </section>
        <section id="recommendations" className="workbench">
          <div className="section-heading">
            <div>
              <div className="section-kicker">01 / YOUR BUSINESS</div>
              <h2>
                Let’s make this about <em>your</em> work.
              </h2>
              <p>
                {live
                  ? "Change the budget, tools or setup preference. The options update instantly."
                  : "Find a business, or try changing Mike’s sample details."}
              </p>
            </div>
            <span className="step-chip">
              {live ? "Real business profile" : "Sample business profile"}
            </span>
          </div>
          <BusinessFinder biz={biz} onChoose={(id, pasted) => void chooseBusiness(id, pasted)} />
          <div className="profile-panel" style={{ marginTop: 20 }}>
            <div className="profile-intro">
              <div className="profile-avatar">{business.name.charAt(0)}</div>
              <div>
                <strong>{business.name}</strong>
                <span>
                  {business.industry} · {business.county} County, {business.state}
                </span>
              </div>
              <span className="profile-confirm">
                {live ? "Public data" : "Demo profile"}
              </span>
            </div>
            <div className="profile-controls">
              <div className="control-block">
                <label htmlFor="budget">
                  Monthly budget{" "}
                  <strong>{money(business.monthlyBudget)}</strong>
                </label>
                <input
                  id="budget"
                  type="range"
                  min="25"
                  max="300"
                  step="25"
                  value={business.monthlyBudget}
                  onChange={(e) =>
                    setBusiness((prev) => ({
                      ...prev,
                      monthlyBudget: Number(e.target.value),
                    }))
                  }
                />
                <div className="range-ends">
                  <span>$25</span>
                  <span>$300+</span>
                </div>
              </div>
              <div className="control-block">
                <span className="control-label">Tools already in use</span>
                <div className="toggle-row">
                  {toolNames.map(
                    (name) => (
                      <button
                        key={name}
                        type="button"
                        className={`toggle-pill ${business.currentTools.includes(name) ? "active" : ""}`}
                        onClick={() => toggleTool(name)}
                        aria-pressed={business.currentTools.includes(name)}
                      >
                        {business.currentTools.includes(name) ? "✓ " : "+ "}
                        {name}
                      </button>
                    ),
                  )}
                </div>
              </div>
              <div className="control-block help-control">
                <span className="control-label">Setup preference</span>
                <div className="segmented">
                  <button
                    type="button"
                    className={!business.needsHelp ? "active" : ""}
                    onClick={() =>
                      setBusiness((prev) => ({ ...prev, needsHelp: false }))
                    }
                  >
                    I’ll set it up
                  </button>
                  <button
                    type="button"
                    className={business.needsHelp ? "active" : ""}
                    onClick={() =>
                      setBusiness((prev) => ({ ...prev, needsHelp: true }))
                    }
                  >
                    I’d like help
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
        {live && (
          <section className="workbench" style={{ paddingTop: 36 }}>
            <div style={{ display: "grid", gap: 20 }}>
              <ContextStrip live={live} />
              <RulesPanel live={live} />
              <AboutYou key={live.profile.profileId} biz={biz} onSaved={syncBusiness} />
            </div>
          </section>
        )}
        <section id="problems" className="workbench">
          <div className="section-heading">
            <div>
              <div className="section-kicker">02 / WHAT MAY BE COSTING YOU</div>
              <h2>
                Problems, with <em>proof.</em>
              </h2>
              <p>
                {live
                  ? "Every finding links to where we saw it. Every dollar figure shows its math."
                  : "Pick a business above to see evidence-backed problems and what they may be worth."}
              </p>
            </div>
            {live?.analysis.snapshot && (
              <span className="step-chip">
                {live.analysis.snapshot.sources.length} public sources
              </span>
            )}
          </div>
          {live && <ProblemsOverview biz={biz} />}
          {live && (
            <div style={{ marginTop: 20 }}>
              <AddProblem biz={biz} />
            </div>
          )}
        </section>
        <section className="recommend-section">
          <div className="section-heading">
            <div>
              <div className="section-kicker">03 / RECOMMENDATIONS</div>
              <h2>
                A few ways forward.
                <br />
                <em>Your call.</em>
              </h2>
              <p>
                Pick a problem to see distinct paths, from a simple add-on to a
                coordinated Starter Kit.
              </p>
            </div>
            <div className="verified-note">
              <span className="verified-dot">✓</span>
              <span>
                Only eligible catalog tools
                <br />
                enter these options
              </span>
            </div>
          </div>
          <div
            className="problem-tabs"
            role="tablist"
            aria-label="Business problems"
          >
            {problems.map((problem, index) => (
              <button
                key={problem.id}
                role="tab"
                type="button"
                aria-selected={problem.id === problemId}
                className={problem.id === problemId ? "active" : ""}
                onClick={() => {
                  setProblemId(problem.id);
                  setSelected([]);
                }}
              >
                {String(index + 1).padStart(2, "0")}{" "}
                <span>{problem.title}</span>
              </button>
            ))}
          </div>
          {!current ? (
            <div className="empty-state">
              <h3>No problems to match with tools yet</h3>
              <p>
                Say yes to a problem under “Worth checking”, or fix the free
                items first.
              </p>
            </div>
          ) : (
          <>
          <div className="problem-context">
            <span className="context-icon">“</span>
            <div>
              <strong>Why this matters for {business.name}</strong>
              <p>{current.problem.evidence}</p>
            </div>
            <span className="context-tag">
              {live ? "From public evidence" : "Owner reported"}
            </span>
          </div>
          {current.options.length ? (
            <div className="option-grid">
              {current.options.map((option) => (
                <OptionCard
                  key={option.kind}
                  payback={live ? paybacks[option.kind] : undefined}
                  option={option}
                  onCompare={toggleCompare}
                  onDetails={setDetails}
                  selected={selected}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3>No suitable option yet</h3>
              <p>
                We won’t fill the page with an unreviewed tool. Try another
                problem or revisit your requirements.
              </p>
            </div>
          )}
          <div className="below-grid">
            <button
              className="why-not"
              type="button"
              onClick={() => setShowExcluded((v) => !v)}
              aria-expanded={showExcluded}
            >
              <span className="why-icon">?</span>
              <span>
                <strong>Why didn’t we show every tool?</strong>
                <small>See the checks behind these suggestions</small>
              </span>
              <span aria-hidden="true">{showExcluded ? "−" : "+"}</span>
            </button>
            {showExcluded && (
              <div className="excluded-panel">
                {current.excluded.length ? (
                  current.excluded.map((item) => (
                    <div key={item.toolId}>
                      <strong>{item.toolName}</strong>
                      <span>{item.reason}</span>
                    </div>
                  ))
                ) : (
                  <p>No tools were excluded for this problem.</p>
                )}
                <small>
                  Demo statuses only. Business rules are informational and
                  require professional review.
                </small>
              </div>
            )}
          </div>
          </>
          )}
          <div className="check-tool">
            <div>
              <div className="section-kicker">CHECK A LINK</div>
              <h3>Saw an AI tool in an ad?</h3>
              <p>
                Look it up in this sample catalog. An unknown tool needs review
                before it can be recommended.
              </p>
            </div>
            <div className="lookup">
              <label className="sr-only" htmlFor="tool-url">
                Tool website URL
              </label>
              <input
                id="tool-url"
                value={lookupUrl}
                onChange={(e) => setLookupUrl(e.target.value)}
                placeholder="Paste a tool website URL"
                type="url"
              />
              <div className="lookup-feedback" aria-live="polite">
                {normalizedLookup
                  ? foundTool
                    ? `${foundTool.name}: ${foundTool.status === "verified" ? "sample Verified status" : foundTool.status === "listed" ? "awaiting review" : "blocked"}.`
                    : "Not in this sample catalog. Submission will open when the discovery service is connected."
                  : ""}
              </div>
            </div>
          </div>
        </section>
        <section id="how-it-works" className="how-section">
          <div className="section-kicker">04 / HOW IT WORKS</div>
          <h2>
            Good advice needs <em>good reasons.</em>
          </h2>
          <div className="how-grid">
            <div>
              <span>01</span>
              <h3>We start with the problem</h3>
              <p>
                Each option addresses a specific job you want done, using
                information you confirm.
              </p>
            </div>
            <div>
              <span>02</span>
              <h3>We check the fit</h3>
              <p>
                Current tools, budget, setup time and review evidence shape a
                transparent Fit Score.
              </p>
            </div>
            <div>
              <span>03</span>
              <h3>We help you act</h3>
              <p>
                Compare the tradeoffs, then use the setup notes or connect with
                a local advisor.
              </p>
            </div>
          </div>
        </section>
        <section id="method" className="method-section">
          <div className="method-inner">
            <div>
              <div className="section-kicker">THE METHOD</div>
              <h2>
                Trust should be
                <br />
                <em>visible.</em>
              </h2>
              <p>
                The catalog gate and the Fit Score do different jobs. A tool
                must pass review and owner rules before its score matters.
              </p>
              <a
                href="https://www.nist.gov/itl/ai-risk-management-framework"
                target="_blank"
                rel="noreferrer"
              >
                Read the NIST AI risk framework ↗
              </a>
            </div>
            <div className="method-steps">
              <div>
                <span>1</span>
                <strong>Review the tool</strong>
                <small>
                  Vendor identity, privacy, price, and human approval.
                </small>
              </div>
              <div>
                <span>2</span>
                <strong>Check your rules</strong>
                <small>
                  Industry, location, data needs, and deal breakers.
                </small>
              </div>
              <div>
                <span>3</span>
                <strong>Score the fit</strong>
                <small>
                  Problem 35% · integrations 25% · budget 20% · setup 10% ·
                  reviews 10%.
                </small>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer>
        <div className="footer-inner">
          <span className="brand footer-brand">
            <span className="brand-mark">
              m<span>.</span>
            </span>
            <span>
              MainStreet <em>AI</em>
            </span>
          </span>
          <span>Built by Team ByteMe · University of Maryland</span>
          <span>Prototype · Sample data · Not legal advice</span>
        </div>
      </footer>
      {selected.length > 0 && (
        <div className="compare-bar">
          <div>
            <strong>
              {selected.length} tool{selected.length === 1 ? "" : "s"} selected
            </strong>
            <span>Compare cost, setup, integrations and fit.</span>
          </div>
          <button
            type="button"
            onClick={() => setShowCompare(true)}
            disabled={selected.length < 2}
          >
            Compare tools <span aria-hidden="true">↗</span>
          </button>
        </div>
      )}
      {(details || showCompare) && (
        <div
          className="modal-backdrop"
          onMouseDown={() => {
            setDetails(null);
            setShowCompare(false);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              details ? `${details.tool.name} details` : "Compare tools"
            }
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => {
                setDetails(null);
                setShowCompare(false);
              }}
              aria-label="Close"
            >
              ×
            </button>
            {details ? (
              <>
                <div className="section-kicker">TOOL DETAILS · SAMPLE DATA</div>
                <h2>{details.tool.name}</h2>
                <p className="modal-lede">{details.tool.description}</p>
                <div className="detail-stats">
                  <div>
                    <small>Fit Score</small>
                    <strong>{details.score.total}/100</strong>
                  </div>
                  <div>
                    <small>Monthly cost</small>
                    <strong>{money(details.tool.monthlyPrice)}</strong>
                  </div>
                  <div>
                    <small>Setup estimate</small>
                    <strong>{details.tool.setupMinutes} min</strong>
                  </div>
                </div>
                <h3>Why this pick</h3>
                <p>{details.why}</p>
                <div className="score-breakdown">
                  {Object.entries(details.score.parts).map(([key, value]) => (
                    <div key={key}>
                      <span>{key}</span>
                      <div>
                        <i
                          style={{
                            width: `${(value / ({ problem: 35, integration: 25, budget: 20, setup: 10, reviews: 10 } as Record<string, number>)[key]) * 100}%`,
                          }}
                        />
                      </div>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
                <h3>Before you start</h3>
                <p>{details.tool.setupSummary}</p>
                <p className="privacy-note">{details.tool.privacySummary}</p>
                <small className="modal-disclaimer">
                  Illustrative product data; do not treat this as an independent
                  verification or current price.
                </small>
              </>
            ) : (
              <>
                <div className="section-kicker">SIDE BY SIDE</div>
                <h2>Compare your choices</h2>
                <p className="modal-lede">
                  Use the same criteria for every option.
                </p>
                <div className="compare-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>What matters</th>
                        {comparison.map((c) => (
                          <th key={c.tool.id}>{c.tool.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th>Fit Score</th>
                        {comparison.map((c) => (
                          <td key={c.tool.id}>{c.score.total}/100</td>
                        ))}
                      </tr>
                      <tr>
                        <th>Monthly cost</th>
                        {comparison.map((c) => (
                          <td key={c.tool.id}>{money(c.tool.monthlyPrice)}</td>
                        ))}
                      </tr>
                      <tr>
                        <th>Setup estimate</th>
                        {comparison.map((c) => (
                          <td key={c.tool.id}>{c.tool.setupMinutes} min</td>
                        ))}
                      </tr>
                      <tr>
                        <th>Works with</th>
                        {comparison.map((c) => (
                          <td key={c.tool.id}>
                            {Object.keys(c.tool.integrations)
                              .filter((t) => business.currentTools.includes(t))
                              .join(", ") || "None confirmed"}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <th>Languages</th>
                        {comparison.map((c) => (
                          <td key={c.tool.id}>{c.tool.languages.join(", ")}</td>
                        ))}
                      </tr>
                      <tr>
                        <th>Catalog status</th>
                        {comparison.map((c) => (
                          <td key={c.tool.id}>Demo verified</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="modal-disclaimer">
                  Costs and capabilities are illustrative. Confirm current
                  vendor terms.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
