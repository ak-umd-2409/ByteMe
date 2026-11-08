/**
 * Tool discovery (spec §1.1–1.6): how new AI tools are found, checked, reviewed
 * and published. See docs/DISCOVERY.md.
 */
import type { CatalogRecord } from "../catalog/types.ts";
import type { UseCase } from "../recommend/types.ts";

/** Where a candidate came from. */
export type Source =
  /** Our watch list of real tools (data/catalog/list.json). */
  | "watch_list"
  /** An owner pasted the link into "Saw an AI tool in an ad?". */
  | "owner_check"
  /** The vendor filled in /submit. */
  | "vendor_submission"
  /** A catalog tool whose last check is too old (spec §1.6). */
  | "recheck";

export const SOURCE_LABEL: Record<Source, string> = {
  watch_list: "Our watch list",
  owner_check: "An owner asked us to check it",
  vendor_submission: "The vendor applied",
  recheck: "Due for its regular re-check",
};

/**
 * new        → waiting for the Safety Check (next discovery run)
 * checked    → Safety Check done; a person decides (the record is "listed")
 * blocked    → failed a check or a person blocked it; never shown to owners
 * approved   → a person approved it; it's in the catalog as Verified
 * failed     → the check couldn't run (site down…); retried next run
 */
export type CandidateStatus = "new" | "checked" | "blocked" | "approved" | "failed";

export interface Candidate {
  /** Same as the catalog id it will get (lowercase slug). */
  id: string;
  name: string;
  url: string;
  domain: string;
  source: Source;
  /** What the submitter said it's for. A person confirms before approving. */
  useCases: UseCase[];
  category: string;
  /** Takes payments or health info (stricter checks). */
  sensitive: boolean;
  addedAt: string;
  status: CandidateStatus;
  /** Plain-English line for the reviewer ("Looks like an imitation of Square"). */
  note: string | null;
  checkedAt: string | null;
  attempts: number;
  decidedBy: string | null;
  decidedAt: string | null;
}

export interface RunSummary {
  ranAt: string;
  trigger: "manual" | "schedule";
  added: { watchList: number; recheck: number };
  checked: number;
  ready: number;
  held: number;
  blocked: number;
  failed: number;
  /** Still waiting for a check after this run. */
  waiting: number;
}

/** Everything discovery keeps. Small enough to store as one value. */
export interface DiscoveryState {
  version: 1;
  candidates: Candidate[];
  /** Checked and decided tool cards. They override the built-in catalog by id. */
  records: Record<string, CatalogRecord>;
  /** Newest first, last 10. */
  runs: RunSummary[];
}

export const emptyState = (): DiscoveryState => ({ version: 1, candidates: [], records: {}, runs: [] });
