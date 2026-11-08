/**
 * A tool's logo, saved from the vendor's own website by `npm run catalog:logos`
 * (data/catalog/logos.json). With no saved logo it shows a neutral first-letter
 * badge: we never guess a logo. Logos only identify the product.
 */
import type { CSSProperties } from "react";
import logos from "@/data/catalog/logos.json";

const MAP: Record<string, { path: string }> = logos;

export function logoPath(id: string): string | null {
  return MAP[id]?.path ?? null;
}

export function ToolLogo({ id, name, size = 40, className }: { id: string; name: string; size?: number; className?: string }) {
  const path = logoPath(id);
  const box: CSSProperties = {
    width: size,
    height: size,
    flex: "none",
    borderRadius: Math.round(size / 4),
    border: "1px solid var(--line, #d9d4cc)",
    background: "#fff",
    boxSizing: "border-box",
  };
  if (path)
    // eslint-disable-next-line @next/next/no-img-element -- tiny static files from /public
    return <img src={path} alt={`${name} logo`} width={size} height={size} className={className} style={{ ...box, objectFit: "contain", padding: Math.round(size / 10) }} />;
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{ ...box, display: "grid", placeItems: "center", background: "#f3f1ed", color: "#4a4540", font: `700 ${Math.round(size * 0.42)}px/1 var(--body, sans-serif)` }}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
