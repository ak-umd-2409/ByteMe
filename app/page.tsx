/**
 * Home: the owner journey in the approved design (docs/specs/b-wireframes.md).
 * The earlier interactive demo now lives at /classic.
 */
export { default, metadata } from "./start/page.tsx";

// The catalog changes when reviewers approve or block tools, so read it on each visit.
export const dynamic = "force-dynamic";
