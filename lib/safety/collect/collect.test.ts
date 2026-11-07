import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { disabledProvider, type LlmRequest } from "../../llm/client.ts";
import { createMemoryCache } from "../../shared/cache.ts";
import { fakeFetch, fakeLlm, publicResolve } from "../../testing/fakes.ts";
import { checkTool } from "../index.ts";
import { checkSafeBrowsing, lookupDomain } from "./external.ts";

const rdap = (date: string) => ({
  body: JSON.stringify({ events: [{ eventAction: "last changed", eventDate: "2026-01-01T00:00:00Z" }, { eventAction: "registration", eventDate: date }] }),
  headers: { "content-type": "application/rdap+json" },
});

describe("lookupDomain", () => {
  it("asks RDAP about the registrable domain and reads the registration date", async () => {
    const fake = fakeFetch({ "https://rdap.org/domain/tool.co.uk": rdap("2021-03-04T10:00:00Z") });
    const domain = await lookupDomain("www.tool.co.uk", { fetchImpl: fake.impl });
    assert.deepEqual(domain, { name: "tool.co.uk", registeredAt: "2021-03-04", source: "rdap" });
    assert.equal(fake.calls[0].url, "https://rdap.org/domain/tool.co.uk");
  });
  it("gives null on a 404", async () => {
    const fake = fakeFetch({});
    assert.equal((await lookupDomain("tool.example", { fetchImpl: fake.impl })).registeredAt, null);
  });
  it("gives null when the request fails", async () => {
    const fake = fakeFetch({ "https://rdap.org/domain/tool.example": new Error("down") });
    assert.equal((await lookupDomain("tool.example", { fetchImpl: fake.impl })).registeredAt, null);
  });
});

describe("checkSafeBrowsing", () => {
  const URL_ = "https://safebrowsing.googleapis.com/v4/threatMatches:find?key=k";
  it("is not run without a key", async () => {
    const fake = fakeFetch({});
    assert.equal(await checkSafeBrowsing("https://tool.example", { fetchImpl: fake.impl, safeBrowsingKey: null }), "not_run");
    assert.equal(fake.calls.length, 0);
  });
  it("reports a listed site", async () => {
    const fake = fakeFetch({ [URL_]: { body: JSON.stringify({ matches: [{}] }) } });
    assert.equal(await checkSafeBrowsing("https://tool.example", { fetchImpl: fake.impl, safeBrowsingKey: "k" }), "listed");
    assert.equal(fake.calls[0].init?.method, "POST");
  });
  it("reports a clean site", async () => {
    const fake = fakeFetch({ [URL_]: { body: "{}" } });
    assert.equal(await checkSafeBrowsing("https://tool.example", { fetchImpl: fake.impl, safeBrowsingKey: "k" }), "clean");
  });
  it("is not run when Google fails", async () => {
    const fake = fakeFetch({ [URL_]: { status: 500, body: "" } });
    assert.equal(await checkSafeBrowsing("https://tool.example", { fetchImpl: fake.impl, safeBrowsingKey: "k" }), "not_run");
  });
});

const POLICY = [
  "Good Site LLC respects your privacy.",
  "We do not use customer data to build models.",
  "You may delete your data at any time.",
  "Data is kept in the United States.",
  ...Array.from({ length: 15 }, (_, i) => `Part ${i + 1}: we collect only the information we need and keep it safe with strong encryption.`),
].join(" ");

const goodSite = (extra: Record<string, unknown> = {}) =>
  fakeFetch({
    "https://goodsite.example/": {
      body: '<a href="/about">About</a><a href="/privacy">Privacy</a><a href="/pricing">Pricing</a>',
    },
    "https://goodsite.example/about": {
      body: "<p>Good Site LLC makes phone tools.</p><p>We are at 9 Elm Road, Austin, TX 78701.</p><p>Maria Lopez is our CEO.</p>",
    },
    "https://goodsite.example/privacy": { body: `<p>${POLICY}</p>` },
    "https://goodsite.example/pricing": { body: "<p>$39 per month. Cancel anytime.</p>" },
    "https://rdap.org/domain/goodsite.example": rdap("2023-01-15T00:00:00Z"),
    ...extra,
  } as never);

const goodLlm = () =>
  fakeLlm((req: LlmRequest) =>
    JSON.stringify(
      req.task === "safety.about"
        ? {
            companyName: { answer: "Good Site LLC", quote: "Good Site LLC makes phone tools." },
            address: { answer: "9 Elm Road, Austin, TX 78701", quote: "We are at 9 Elm Road, Austin, TX 78701." },
            leaderName: { answer: "Maria Lopez", quote: "Maria Lopez is our CEO." },
          }
        : {
            trainsOnYourData: { answer: "no", quote: "We do not use customer data to build models." },
            canDeleteData: { answer: "yes", quote: "You may delete your data at any time." },
            whereStored: { answer: "United States", quote: "Data is kept in the United States." },
            securityCertification: null,
          },
    ),
  );

const deps = (fetchImpl: ReturnType<typeof fakeFetch>["impl"], llm = goodLlm().provider) => ({
  fetchImpl,
  resolveHost: publicResolve,
  llm,
  cache: createMemoryCache(),
  safeBrowsingKey: null,
  now: () => new Date("2026-11-07T15:00:00Z"),
});

describe("checkTool", () => {
  it("marks a good site ready", async () => {
    const { facts, report } = await checkTool(
      { url: "https://goodsite.example/", name: "Good Site", handlesSensitiveData: false },
      deps(goodSite().impl),
    );
    assert.equal(facts.collectedAt, "2026-11-07");
    assert.equal(facts.domain.registeredAt, "2023-01-15");
    assert.equal(report.verdict, "ready", JSON.stringify(report.checks, null, 1));
  });

  it("holds the same site when there is no AI, without throwing", async () => {
    const { report } = await checkTool(
      { url: "https://goodsite.example/", name: "Good Site", handlesSensitiveData: false },
      deps(goodSite().impl, disabledProvider),
    );
    assert.equal(report.verdict, "held");
  });

  it("blocks a brand-new lookalike that pushes a download", async () => {
    const fake = fakeFetch({
      "https://squarre-pay.example/": { body: '<a href="/privacy">Privacy</a><a href="/files/SquarrePay.exe">Download</a>' },
      "https://squarre-pay.example/privacy": { body: `<p>${POLICY}</p>` },
      "https://rdap.org/domain/squarre-pay.example": rdap("2026-10-07T00:00:00Z"),
    });
    const { report } = await checkTool(
      { url: "https://squarre-pay.example/", name: "Squarre Pay", handlesSensitiveData: true },
      deps(fake.impl, disabledProvider),
    );
    assert.equal(report.verdict, "blocked");
    assert.deepEqual(report.redFlags, [
      "Name and website imitate Square (squarre vs. Square).",
      "Website is under 6 months old and asks you to download software.",
    ]);
  });

  it("never throws on a bad address", async () => {
    const { report } = await checkTool({ url: "not a url", name: "X", handlesSensitiveData: false }, deps(fakeFetch({}).impl));
    assert.notEqual(report.verdict, "ready");
  });
});
