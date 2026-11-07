/** Lightweight HTML helpers (no DOM dependency). Good enough for small-business sites. */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  middot: "·",
  copy: "©",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Visible text, one logical line per block element. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|hr)\b[^>]*>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article|header|footer|nav|ul|ol|table|form|label|dt|dd|address)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function pageTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(match[1].replace(/\s+/g, " ").trim()) || null : null;
}

export interface Link {
  href: string;
  text: string;
}

export function extractLinks(html: string, baseUrl: string): Link[] {
  const links: Link[] = [];
  const pattern = /<a\b[^>]*?href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      const url = new URL(decodeEntities(match[1].trim()), baseUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      url.hash = "";
      links.push({ href: url.toString(), text: htmlToText(match[2]).replace(/\n/g, " ").slice(0, 120) });
    } catch {
      // ignore malformed hrefs
    }
  }
  return links;
}

/** Return script src, link href and iframe src URLs (for technology signatures). */
export function extractAssetUrls(html: string): { url: string; kind: "script" | "link" }[] {
  const out: { url: string; kind: "script" | "link" }[] = [];
  for (const match of html.matchAll(/<(script|iframe)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi))
    out.push({ url: match[2], kind: "script" });
  for (const match of html.matchAll(/<(link|a|form)\b[^>]*\b(?:href|action)\s*=\s*["']([^"']+)["']/gi))
    out.push({ url: match[2], kind: "link" });
  return out;
}

/** Text of headings (h1–h4). */
export function headings(html: string): string[] {
  return [...html.matchAll(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/gi)]
    .map((m) => htmlToText(m[1]).replace(/\n/g, " ").trim())
    .filter(Boolean);
}

/** Text of list items. */
export function listItems(html: string): string[] {
  return [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((m) => htmlToText(m[1]).replace(/\n/g, " ").trim())
    .filter(Boolean);
}
