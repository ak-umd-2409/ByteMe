"use client";

/**
 * Progressive disclosure for the plan: show one ready-made text at a time, and the two most
 * useful help links before the rest. Everything stays in the page (hidden, not removed), so
 * printing shows it all (see the print rules in start.module.css).
 */
import { useState } from "react";
import type { ReadyText } from "@/lib/plan/content.ts";
import s from "../start/start.module.css";
import { CopyButton } from "./Copy.tsx";

export function ReadyTabs({ items }: { items: ReadyText[] }) {
  const [i, setI] = useState(0);
  return (
    <div className={s.ready}>
      <div className={s.row} role="tablist" aria-label="Ready-made texts">
        {items.map((it, k) => (
          <button key={it.id} type="button" role="tab" id={`ready-tab-${it.id}`} aria-controls={`ready-${it.id}`} aria-selected={k === i} className={s.chipsel} aria-pressed={k === i} onClick={() => setI(k)}>
            {it.title}
          </button>
        ))}
      </div>
      {items.map((it, k) => (
        <div key={it.id} id={`ready-${it.id}`} role="tabpanel" aria-labelledby={`ready-tab-${it.id}`} className={`${s.readyItem} ${s.printShow}`} hidden={k !== i}>
          <div className={s.readyHead}>
            <span className={s.optionText}>
              <b>{it.title}</b>
              <span>{it.use}</span>
            </span>
            <CopyButton text={it.text} />
          </div>
          <p className={s.readyText}>{it.text}</p>
        </div>
      ))}
    </div>
  );
}

export function ShowMore({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className={`${s.stack} ${s.printShow}`} hidden={!open}>
        {children}
      </div>
      {!open && (
        <button type="button" className={`${s.link} ${s.noPrint}`} style={{ justifySelf: "start", paddingLeft: 0 }} onClick={() => setOpen(true)} aria-expanded={false}>
          {label}
        </button>
      )}
    </>
  );
}
