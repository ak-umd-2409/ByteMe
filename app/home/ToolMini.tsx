import type { ToolCard } from "@/lib/advisor/types.ts";
import h from "./home.module.css";

const usd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** A checked tool in one line: initials, name, category, published starting price. */
export function ToolMini({ t }: { t: ToolCard }) {
  return (
    <span className={h.toolMini}>
      <span className={h.toolLogo} aria-hidden="true">
        {t.name.slice(0, 2).toUpperCase()}
      </span>
      <span className={h.toolText}>
        <b>{t.name}</b>
        <span>
          {t.category} · {t.monthlyUsd === null ? "price on request" : `from ${usd(t.monthlyUsd)}/mo`}
        </span>
      </span>
      <span className={h.verified}>✓ Checked</span>
    </span>
  );
}
