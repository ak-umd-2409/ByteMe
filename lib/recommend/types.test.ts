import { test } from "node:test";
import assert from "node:assert/strict";
import { USE_CASES } from "./types.ts";
import { PROBLEMS } from "../problems/catalog.ts";

test("the use-case list has all 12 problem types from FEATURE_SPEC", () => {
  assert.deepEqual([...USE_CASES].sort(), [
    "admin-paperwork",
    "booking",
    "bookkeeping",
    "customer-messaging",
    "email-marketing",
    "inventory",
    "marketing",
    "missed-calls",
    "quotes",
    "reviews",
    "staff-scheduling",
    "website-seo",
  ]);
});

test("slow replies map to the customer-messaging problem type", () => {
  assert.equal(PROBLEMS.slow_responses.useCase, "customer-messaging");
});
