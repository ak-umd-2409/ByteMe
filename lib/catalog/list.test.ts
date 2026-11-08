import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadList, validateList } from "./list.ts";

const good = () => ({
  id: "rosie",
  name: "Rosie",
  url: "https://heyrosie.com",
  category: "AI receptionist",
  useCases: ["missed-calls"],
  industries: ["hvac", "plumbing"],
  sensitive: false,
  batch: 1,
});

const mentions = (errors: string[], text: string) => errors.some((e) => e.includes(text));

describe("validateList", () => {
  it("accepts a good entry", () => {
    assert.deepEqual(validateList([good()]), []);
  });

  it("accepts an AI feature inside a product owners already use", () => {
    assert.deepEqual(validateList([{ ...good(), existingProduct: "Square" }]), []);
  });

  it("rejects an id that isn't a lowercase slug", () => {
    assert.ok(mentions(validateList([{ ...good(), id: "Rosie AI" }]), "id"));
  });

  it("rejects a problem type that is not one of the 12", () => {
    assert.ok(mentions(validateList([{ ...good(), useCases: ["time-travel"] }]), "useCases"));
  });

  it("rejects an industry we don't know", () => {
    assert.ok(mentions(validateList([{ ...good(), industries: ["space-mining"] }]), "industries"));
  });

  it("rejects a url that isn't https", () => {
    assert.ok(mentions(validateList([{ ...good(), url: "http://heyrosie.com" }]), "url"));
  });

  it("rejects a duplicate id", () => {
    assert.ok(mentions(validateList([good(), good()]), "duplicate"));
  });

  it("rejects a batch other than 1 or 2", () => {
    assert.ok(mentions(validateList([{ ...good(), batch: 3 }]), "batch"));
  });

  it("rejects a missing name, category or sensitive flag", () => {
    const { name, category, sensitive, ...rest } = good();
    const errors = validateList([rest]);
    assert.ok(mentions(errors, "name") && mentions(errors, "category") && mentions(errors, "sensitive"));
  });

  it("data/catalog/list.json is valid", () => {
    assert.deepEqual(validateList(loadList()), []);
  });
});
