import type { PublicSnapshot } from "../../lib/business/snapshot.ts";
import { davesCoolingHeating } from "./daves-cooling-heating.ts";
import { frederickHeatingAc } from "./frederick-heating-ac.ts";

/** Real businesses captured from public pages. See README.md in this folder. */
export const PUBLIC_SNAPSHOTS: PublicSnapshot[] = [davesCoolingHeating, frederickHeatingAc];

export const findSnapshot = (placeId: string) => PUBLIC_SNAPSHOTS.find((s) => s.placeId === placeId) ?? null;
