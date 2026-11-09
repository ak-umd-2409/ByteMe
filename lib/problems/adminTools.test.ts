import assert from "node:assert/strict";
import { describe, it } from "node:test";
import real from "../../data/catalog/real.json" with { type: "json" };
import type { CatalogRecord } from "../catalog/types.ts";
import { PROBLEMS } from "./catalog.ts";

const catalog = ((real as unknown as { tools?: CatalogRecord[] }).tools ?? (real as unknown as CatalogRecord[])) as CatalogRecord[];

describe("paperwork and admin", () => {
  it("points at a use case that real checked tools cover, including for professional services", () => {
    const uc = PROBLEMS.repetitive_admin.useCase!;
    const fits = catalog.filter(
      (r) => r.badge === "verified" && r.useCases.includes(uc) && (r.industries.includes("any") || r.industries.includes("professional_services")),
    );
    assert.ok(fits.length >= 2, `only ${fits.map((r) => r.id).join(", ")}`);
  });
});
