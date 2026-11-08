/**
 * The owner's results, kept only in this browser tab (sessionStorage) so the advisor page can
 * answer about their business. Cleared when the tab closes. Never sent anywhere except back to
 * our own /api/advisor, which rebuilds the results from the context itself.
 */
export interface SavedResults {
  context: string;
  business: string;
  industry: string | null;
  firstProblem: string | null;
  problems: string[];
  budget: number | null;
}

const KEY = "mainstreet.results";

export function saveResults(r: SavedResults) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* private mode or storage full: the advisor still works, just in general */
  }
}

export function readSaved(): SavedResults | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const x = JSON.parse(raw) as SavedResults;
    return typeof x.context === "string" && typeof x.business === "string" ? x : null;
  } catch {
    return null;
  }
}
