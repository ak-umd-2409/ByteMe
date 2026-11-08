"use client";

import { useEffect, useState } from "react";
import { AdvisorPanel } from "../advisor/AdvisorPanel.tsx";
import { readSaved, type SavedResults } from "../advisor/saved.ts";

/**
 * The floating "Ask the advisor" pill for pages outside the guided flow (home, catalog, tool
 * pages, plans). If the owner ran the check in this tab, the advisor answers about their
 * business; otherwise it answers in general and offers to find their business.
 */
export function SiteAdvisor() {
  const [saved, setSaved] = useState<SavedResults | null | undefined>(undefined);
  useEffect(() => setSaved(readSaved()), []);
  if (saved === undefined) return null;
  return (
    <AdvisorPanel
      floating
      context={saved?.context ?? null}
      known={saved ? { business: saved.business, industry: saved.industry, firstProblem: saved.firstProblem, budget: saved.budget } : { industry: null }}
    />
  );
}
