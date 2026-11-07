/** Simple signals read from page text and HTML, with no AI. Pure. */
import { createHash } from "node:crypto";
import { extractLinks } from "../business/html.ts";
import { SAFETY_CONFIG } from "./config.ts";

/** Fingerprint of a page's text, so unchanged pages aren't re-read by the AI. */
export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

/** Sentences that mention training, improving models or machine learning (at most 10). */
export function findRiskySentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s && SAFETY_CONFIG.riskyPatterns.some((p) => p.test(s)))
    .slice(0, 10);
}

/** True when the page links to an installer (.exe, .dmg, ...). */
export function hasDownloadPrompt(html: string, baseUrl: string): boolean {
  return extractLinks(html, baseUrl).some((link) => {
    const path = new URL(link.href).pathname.toLowerCase();
    return SAFETY_CONFIG.downloadExtensions.some((ext) => path.endsWith(ext));
  });
}
