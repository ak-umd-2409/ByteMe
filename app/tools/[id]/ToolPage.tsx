"use client";

import type { CatalogRecord } from "@/lib/catalog/types.ts";
import s from "../../start/start.module.css";
import { blockReason, ToolDetail } from "../../start/ToolScreens.tsx";
import { shortDate } from "../labels.ts";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

export function ToolPage({ r }: { r: CatalogRecord }) {
  const back = (
    <a className={s.link} href="/tools" style={{ justifySelf: "start", paddingLeft: 0 }}>
      ‹ All tools
    </a>
  );
  if (r.badge === "blocked") {
    const flags = r.safetyCheck.redFlags.length ? r.safetyCheck.redFlags : [blockReason(r)];
    return (
      <>
        {back}
        <article className={s.card} style={{ maxWidth: 760 }}>
          <div className={s.cardTop}>
            <span className={cx(s.badge, s.bad)}>⚠ Blocked</span>
            <h1 className={s.title}>We'd never recommend {r.name}</h1>
            <span className={s.small}>
              {r.vendor.domain} · checked {shortDate(r.lastChecked)}
            </span>
          </div>
          <p>It failed our Safety Check{r.reviewedBy ? `, and ${r.reviewedBy} reviewed it` : ""}. Here's what we found:</p>
          <ul className={s.evid}>
            {flags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className={s.small}>If you've already paid or shared details with this tool, a free Maryland SBDC advisor can help you decide what to do next.</p>
          <a className={cx(s.btn, s.secondary)} href="/tools" style={{ justifySelf: "start" }}>
            See tools we checked
          </a>
        </article>
      </>
    );
  }
  return (
    <>
      {back}
      {r.badge === "listed" && (
        <p className={s.banner}>A person hasn't reviewed this tool yet, so we don't recommend it. Here's what the automatic Safety Check found so far.</p>
      )}
      <ToolDetail r={r} biz={null} picked={false} canCompare={false} />
    </>
  );
}
