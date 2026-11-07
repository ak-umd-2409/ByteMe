import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fakeFetch, publicResolve } from "../../testing/fakes.ts";
import { isFetched } from "../types.ts";
import { findPages } from "./pages.ts";

const SITE = "https://tool.example";
const html = (body: string) => ({ body: `<html><body>${body}</body></html>` });
const deps = (routes: Parameters<typeof fakeFetch>[0]) => {
  const fake = fakeFetch(routes);
  return { fake, deps: { fetchImpl: fake.impl, resolveHost: publicResolve, now: () => new Date("2026-11-07T12:00:00Z") } };
};
const urlOf = (p: unknown) => (isFetched(p as never) ? (p as { finalUrl: string }).finalUrl : p);

describe("findPages", () => {
  it("follows the home page's links", async () => {
    const { deps: d } = deps({
      [`${SITE}/`]: html(
        '<a href="/company/about-us">About us</a><a href="/legal/privacy-policy">Privacy</a><a href="/plans-pricing">Pricing</a>',
      ),
      [`${SITE}/company/about-us`]: html("<p>About Tool Inc.</p>"),
      [`${SITE}/legal/privacy-policy`]: html("<p>Privacy policy text.</p>"),
      [`${SITE}/plans-pricing`]: html("<p>$9 per month</p>"),
    });
    const { pages } = await findPages(`${SITE}/`, d);
    assert.equal(urlOf(pages.about), `${SITE}/company/about-us`);
    assert.equal(urlOf(pages.privacy), `${SITE}/legal/privacy-policy`);
    assert.equal(urlOf(pages.pricing), `${SITE}/plans-pricing`);
    assert.ok(isFetched(pages.privacy) && pages.privacy.text.includes("Privacy policy text."));
    assert.ok(isFetched(pages.home) && pages.home.fetchedAt === "2026-11-07");
  });

  it("tries the usual paths when the home page has no links", async () => {
    const { deps: d } = deps({ [`${SITE}/`]: html("<p>Hi</p>"), [`${SITE}/privacy`]: html("<p>Policy</p>") });
    const { pages } = await findPages(`${SITE}/`, d);
    assert.equal(urlOf(pages.privacy), `${SITE}/privacy`);
  });

  it("reports no privacy page when none of the usual paths exist", async () => {
    const { deps: d } = deps({ [`${SITE}/`]: html("<p>Hi</p>") });
    assert.equal((await findPages(`${SITE}/`, d)).pages.privacy, null);
  });

  it("marks a page blocked by robots.txt as an error, not missing", async () => {
    const { deps: d } = deps({
      [`${SITE}/robots.txt`]: { body: "User-agent: *\nDisallow: /privacy", headers: { "content-type": "text/plain" } },
      [`${SITE}/`]: html('<a href="/privacy">Privacy</a>'),
      [`${SITE}/privacy`]: html("<p>Policy</p>"),
    });
    assert.deepEqual((await findPages(`${SITE}/`, d)).pages.privacy, { error: "robots" });
  });

  it("marks a page that fails to load as an error and keeps the others", async () => {
    const { deps: d } = deps({
      [`${SITE}/`]: html('<a href="/privacy">Privacy</a><a href="/about">About</a>'),
      [`${SITE}/privacy`]: new Error("boom"),
      [`${SITE}/about`]: html("<p>About</p>"),
    });
    const { pages } = await findPages(`${SITE}/`, d);
    assert.deepEqual(pages.privacy, { error: "network" });
    assert.ok(isFetched(pages.about));
  });

  it("does not call a blocked fallback page missing", async () => {
    const { deps: d } = deps({ [`${SITE}/`]: html("<p>Hi</p>"), [`${SITE}/privacy`]: { status: 403, body: "no bots" } });
    assert.deepEqual((await findPages(`${SITE}/`, d)).pages.privacy, { error: "http_403" });
  });

  it("never throws when the home page is unreachable", async () => {
    const { deps: d } = deps({ [`${SITE}/`]: new Error("down") });
    const result = await findPages(`${SITE}/`, d);
    assert.equal(result.https, false);
    for (const page of Object.values(result.pages)) assert.ok(page === null || "error" in page);
    assert.notEqual(result.pages.privacy, null, "a site that is down must not look like it has no privacy policy");
  });

  it("notices http-only sites", async () => {
    const { deps: d } = deps({ ["http://tool.example/"]: html("<p>Hi</p>") });
    assert.equal((await findPages("http://tool.example/", d)).https, false);
  });

  it("notices a download link on the home page", async () => {
    const { deps: d } = deps({ [`${SITE}/`]: html('<a href="/setup.exe">Get it</a>') });
    assert.equal((await findPages(`${SITE}/`, d)).downloadPrompt, true);
  });

  it("reads big home pages (2 MB, like squareup.com)", async () => {
    const { deps: d } = deps({ [`${SITE}/`]: html(`<p>Big site.</p><!--${"x".repeat(2_000_000)}-->`) });
    assert.ok(isFetched((await findPages(`${SITE}/`, d)).pages.home));
  });

  it("holds (not blocks) a tool whose privacy policy is on another website", async () => {
    const { deps: d } = deps({ [`${SITE}/`]: html('<a href="https://app.termly.io/policy/123">Privacy Policy</a>') });
    assert.deepEqual((await findPages(`${SITE}/`, d)).pages.privacy, { error: "off_site" });
  });

  it("follows links to the main domain when the home page is on a subdomain", async () => {
    const { deps: d } = deps({
      ["https://app.tool.example/"]: html('<a href="https://tool.example/privacy-notice">Privacy</a>'),
      [`${SITE}/privacy-notice`]: html("<p>Policy</p>"),
    });
    assert.equal(urlOf((await findPages("https://app.tool.example/", d)).pages.privacy), `${SITE}/privacy-notice`);
  });

  it("makes at most 6 requests", async () => {
    const { fake, deps: d } = deps({ [`${SITE}/`]: html("<p>Hi</p>") });
    await findPages(`${SITE}/`, d);
    assert.ok(fake.calls.length <= 6, `made ${fake.calls.length} requests`);
  });
});
