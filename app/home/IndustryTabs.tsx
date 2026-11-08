"use client";

import { useRef, useState } from "react";
import type { Example } from "./data.ts";
import h from "./home.module.css";
import { ToolMini } from "./ToolMini.tsx";

/** "See it for your kind of business": one tab per industry. HVAC is a real finding; the rest are labelled illustrative. */
export function IndustryTabs({ examples }: { examples: Example[] }) {
  const [i, setI] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const e = examples[i];
  if (!e) return null;
  const onKey = (ev: React.KeyboardEvent) => {
    const n = examples.length;
    const to = ev.key === "ArrowRight" ? (i + 1) % n : ev.key === "ArrowLeft" ? (i - 1 + n) % n : ev.key === "Home" ? 0 : ev.key === "End" ? n - 1 : -1;
    if (to < 0) return;
    ev.preventDefault();
    setI(to);
    tabs.current[to]?.focus();
  };
  return (
    <div className={h.tabsWrap}>
      <div className={h.tabs} role="tablist" aria-label="Kinds of business" onKeyDown={onKey}>
        {examples.map((x, k) => (
          <button
            key={x.key}
            ref={(el) => {
              tabs.current[k] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${x.key}`}
            aria-selected={k === i}
            aria-controls="industry-panel"
            tabIndex={k === i ? 0 : -1}
            className={h.tab}
            onClick={() => setI(k)}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div className={h.tabPanel} role="tabpanel" id="industry-panel" aria-labelledby={`tab-${e.key}`}>
        <div className={h.flow}>
          <div className={h.flowStep}>
            <span className={h.kicker}>The problem</span>
            <p>{e.problem}</p>
          </div>
          <div className={h.flowStep}>
            <span className={h.kicker}>What AI does</span>
            <p>{e.aiCan}</p>
          </div>
          <div className={h.flowStep}>
            <span className={h.kicker}>What stays human</span>
            <p>{e.keepHuman}</p>
          </div>
        </div>
        <div className={h.tabFoot}>
          {e.tool ? (
            <a className={h.toolLink} href={`/tools/${e.tool.id}`}>
              <ToolMini t={e.tool} />
            </a>
          ) : (
            <p className={h.small}>{e.noTool}</p>
          )}
          <span className={e.kind === "real" ? h.tagReal : h.tagIllustrative}>{e.kind === "real" ? "Real finding · public data" : "Illustrative example"}</span>
        </div>
      </div>
    </div>
  );
}
