import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contentHash, findRiskySentences, hasDownloadPrompt } from "./signals.ts";

describe("findRiskySentences", () => {
  it("keeps only sentences about training or improving models", () => {
    assert.deepEqual(findRiskySentences("We never sell data. We may use your content to improve our models. Thanks!"), [
      "We may use your content to improve our models.",
    ]);
  });
  it("keeps at most 10", () => {
    assert.equal(findRiskySentences("We train models. ".repeat(20)).length, 10);
  });
});

describe("hasDownloadPrompt", () => {
  it("spots a link to an installer", () => {
    assert.equal(hasDownloadPrompt('<a href="/get/setup.exe">Download</a>', "https://x.example"), true);
  });
  it("ignores documents", () => {
    assert.equal(hasDownloadPrompt('<a href="/guide.pdf">Guide</a>', "https://x.example"), false);
  });
});

describe("contentHash", () => {
  it("is stable and changes with the text", () => {
    assert.equal(contentHash("a"), contentHash("a"));
    assert.notEqual(contentHash("a"), contentHash("b"));
  });
});
