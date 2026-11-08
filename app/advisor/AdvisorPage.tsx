"use client";

import { useEffect, useState } from "react";
import { AdvisorChat, type Known } from "./AdvisorChat.tsx";
import a from "./advisor.module.css";
import { readSaved, type SavedResults } from "./saved.ts";

/** /advisor: the advisor on its own page. Uses the owner's results from this tab, if they ran the check. */
export function AdvisorPage({ question, industry }: { question: string | null; industry: string | null }) {
  const [saved, setSaved] = useState<SavedResults | null | undefined>(undefined);
  useEffect(() => setSaved(readSaved()), []);
  if (saved === undefined) return null;
  const known: Known = saved ? { business: saved.business, industry: saved.industry, firstProblem: saved.firstProblem, budget: saved.budget } : { industry };
  return (
    <div className={a.layout}>
      <div className={a.pageIntro}>
        <h1 className={a.pageTitle}>Business Advisor</h1>
        <p>Plain answers about where AI fits your business, what it costs, and what to do first.</p>
        <AdvisorChat context={saved?.context ?? null} known={known} initialQuestion={question} />
      </div>
      <aside className={a.side}>
        {saved ? (
          <div className={a.sideCard}>
            <span className={a.eyebrow}>Answering for</span>
            <h2>{saved.business}</h2>
            {saved.problems.length > 0 && (
              <ul>
                {saved.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            {saved.budget !== null && <p>Budget: ${saved.budget} a month</p>}
            <a href="/start">Run the check again</a>
          </div>
        ) : (
          <div className={a.sideCard}>
            <span className={a.eyebrow}>Want answers about your business?</span>
            <p>Find your business first. We read your listing, website and reviews, and the advisor answers from what we find.</p>
            <a href="/start">Find my business (about 3 minutes)</a>
          </div>
        )}
        <div className={a.sideCard}>
          <span className={a.eyebrow}>How the advisor works</span>
          <ul>
            <li>It recommends only tools a person has checked, with their own published prices.</li>
            <li>If we haven&apos;t checked a tool for something, it says so instead of guessing.</li>
            <li>It tells you when a free fix is enough.</li>
            <li>It never logs into your accounts, and the conversation isn&apos;t saved.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
