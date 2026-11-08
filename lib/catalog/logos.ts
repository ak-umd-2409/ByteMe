/**
 * Tool logos: pick the icon a vendor's own home page declares, and check the
 * downloaded file is a real image big enough to show. Pure functions only; the
 * fetching lives in scripts/fetchLogos.ts. Logos only identify the product.
 */

export type LogoExt = "png" | "svg" | "ico";

/** One saved logo, as stored in data/catalog/logos.json. */
export interface LogoEntry {
  /** Public path, e.g. "/logos/brevo.png". */
  path: string;
  /** Where we downloaded it from (the vendor's own site). */
  sourceUrl: string;
  fetchedAt: string;
}

/** Smallest icon we will show: our badge is 40px. */
export const MIN_ICON_PX = 32;

/** True when `url` is on the vendor's domain (or one of its subdomains). */
export function onVendorDomain(url: string, domain: string): boolean {
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    host = u.hostname.toLowerCase();
  } catch {
    return false;
  }
  const d = domain.toLowerCase().replace(/^www\./, "");
  return host === d || host.endsWith(`.${d}`);
}

/**
 * Webflow's file servers. Many vendors build their site on Webflow, so the icon
 * their own page declares lives there instead of on their domain. Allowed only
 * for icons the vendor's page names itself, never for guessed URLs.
 */
export const SITE_BUILDER_HOSTS = ["cdn.prod.website-files.com", "assets.website-files.com", "uploads-ssl.webflow.com", "global-uploads.webflow.com"];

/** True when a declared icon may be downloaded: the vendor's domain or its Webflow files. */
export function allowedIconHost(url: string, domain: string): boolean {
  if (onVendorDomain(url, domain)) return true;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && SITE_BUILDER_HOSTS.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[1] ?? m[2] ?? m[3] ?? "").trim() : null;
};
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/").replace(/&#47;/g, "/");

/**
 * Icon URLs a page declares, best first, on the vendor's domain only:
 * (or its Webflow files): apple-touch-icon, then SVG icons, then PNG icons (biggest first), then other
 * icons, then /favicon.ico on the page's own host.
 */
export function pickIconUrls(html: string, pageUrl: string, domain: string): string[] {
  const base = new URL(pageUrl);
  const baseHref = html.match(/<base\s[^>]*>/i)?.[0];
  const baseUrl = baseHref && attr(baseHref, "href") ? new URL(decode(attr(baseHref, "href")!), base) : base;
  const found: { url: string; rank: number; size: number; order: number }[] = [];
  let order = 0;
  for (const tag of html.match(/<link\s[^>]*>/gi) ?? []) {
    const rel = (attr(tag, "rel") ?? "").toLowerCase().split(/\s+/);
    const href = attr(tag, "href");
    if (!href || href.startsWith("data:")) continue;
    const apple = rel.includes("apple-touch-icon") || rel.includes("apple-touch-icon-precomposed");
    if (!apple && !rel.includes("icon")) continue;
    let url: string;
    try {
      url = new URL(decode(href), baseUrl).toString();
    } catch {
      continue;
    }
    if (!allowedIconHost(url, domain)) continue;
    const type = (attr(tag, "type") ?? "").toLowerCase();
    const path = new URL(url).pathname.toLowerCase();
    const svg = type.includes("svg") || path.endsWith(".svg");
    const png = type.includes("png") || path.endsWith(".png");
    const sizes = (attr(tag, "sizes") ?? "").match(/(\d+)x\d+/gi) ?? [];
    const size = Math.max(0, ...sizes.map((x) => parseInt(x, 10)));
    const rank = apple ? 0 : svg ? 1 : png ? 2 : 3;
    found.push({ url, rank, size, order: order++ });
  }
  found.sort((a, b) => a.rank - b.rank || b.size - a.size || a.order - b.order);
  const urls = [...new Set(found.map((f) => f.url))];
  const fallback = new URL("/favicon.ico", base).toString();
  if (onVendorDomain(fallback, domain) && !urls.includes(fallback)) urls.push(fallback);
  return urls;
}

/**
 * What kind of image these bytes are and how big, or null when they are not a
 * usable icon (HTML error page, broken file, too small).
 */
export function checkIcon(bytes: Uint8Array): { ext: LogoExt; px: number } | null {
  if (bytes.length < 64) return null;
  // PNG: signature, then IHDR width/height.
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const px = Math.min(dv.getUint32(16), dv.getUint32(20));
    return px >= MIN_ICON_PX ? { ext: "png", px } : null;
  }
  // ICO: reserved 0, type 1, then 16-byte entries (0 means 256).
  if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) {
    const count = bytes[4] | (bytes[5] << 8);
    if (!count || bytes.length < 6 + count * 16) return null;
    let px = 0;
    for (let i = 0; i < count; i++) px = Math.max(px, Math.min(bytes[6 + i * 16] || 256, bytes[7 + i * 16] || 256));
    return px >= MIN_ICON_PX ? { ext: "ico", px } : null;
  }
  // SVG: text with an <svg> root and no script.
  const head = new TextDecoder().decode(bytes.slice(0, 4096)).trimStart().toLowerCase();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!doctype svg[^>]*>\s*)?<svg[\s>]/.test(head)) {
    const all = new TextDecoder().decode(bytes).toLowerCase();
    if (all.includes("<script") || /\son\w+\s*=/.test(all) || !all.includes("</svg>")) return null;
    return { ext: "svg", px: Infinity };
  }
  return null;
}
