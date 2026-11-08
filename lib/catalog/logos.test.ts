import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import logos from "../../data/catalog/logos.json" with { type: "json" };
import real from "../../data/catalog/real.json" with { type: "json" };
import { checkIcon, onVendorDomain, pickIconUrls } from "./logos.ts";

const page = `<html><head>
  <link rel="icon" href="/favicon-16.png" type="image/png" sizes="16x16">
  <link rel="icon" href="https://cdn.other-site.com/logo.png" type="image/png" sizes="512x512">
  <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96.png">
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="https://static.vendor.com/apple.png">
  <link rel="stylesheet" href="/site.css">
</head></html>`;

test("picks apple-touch-icon first, then SVG, then PNG by size, then /favicon.ico", () => {
  assert.deepEqual(pickIconUrls(page, "https://www.vendor.com/", "vendor.com"), [
    "https://static.vendor.com/apple.png",
    "https://www.vendor.com/icon.svg",
    "https://www.vendor.com/favicon-96.png",
    "https://www.vendor.com/favicon-16.png",
    "https://www.vendor.com/favicon.ico",
  ]);
});

test("ignores icons on other domains", () => {
  const urls = pickIconUrls(page, "https://www.vendor.com/", "vendor.com");
  assert.ok(!urls.some((u) => u.includes("other-site.com")));
  assert.equal(onVendorDomain("https://vendor.com.evil.io/x.png", "vendor.com"), false);
  assert.equal(onVendorDomain("https://notvendor.com/x.png", "vendor.com"), false);
  assert.equal(onVendorDomain("https://cdn.vendor.com/x.png", "www.vendor.com"), true);
});

test("falls back to /favicon.ico when the page declares no icon", () => {
  assert.deepEqual(pickIconUrls("<html><head><title>Hi</title></head></html>", "https://vendor.com/about", "vendor.com"), [
    "https://vendor.com/favicon.ico",
  ]);
});

const png = (w: number, h: number) => {
  const b = new Uint8Array(80);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
};

test("keeps real icons and skips tiny or broken ones", () => {
  assert.deepEqual(checkIcon(png(180, 180)), { ext: "png", px: 180 });
  assert.equal(checkIcon(png(16, 16)), null);
  assert.equal(checkIcon(new TextEncoder().encode("<!doctype html><html><body>Not found</body></html>".padEnd(100))), null);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16"/></svg>`;
  assert.equal(checkIcon(new TextEncoder().encode(svg))?.ext, "svg");
  assert.equal(checkIcon(new TextEncoder().encode(svg.replace("<circle", "<script>alert(1)</script><circle"))), null);
});

test("every logo in the map exists, is for a real catalog tool, and came from that vendor's site", () => {
  const byId = new Map((real as { id: string; vendor: { domain: string } }[]).map((t) => [t.id, t]));
  for (const [id, entry] of Object.entries(logos as Record<string, { path: string; sourceUrl: string }>)) {
    assert.ok(existsSync(`public${entry.path}`), `${id}: missing file public${entry.path}`);
    assert.ok(byId.has(id), `${id}: not in real.json`);
    assert.ok(onVendorDomain(entry.sourceUrl, byId.get(id)!.vendor.domain), `${id}: logo not from the vendor's own domain`);
  }
});
