"use client";

import { useEffect, useRef, useState } from "react";
import { AdvisorChat, type Known } from "./AdvisorChat.tsx";
import a from "./advisor.module.css";

/** "Ask the advisor" inside the guided journey: a side panel that keeps the owner where they are. */
export function AdvisorPanel({ context, known, floating = false }: { context: string | null; known: Known; floating?: boolean }) {
  const [open, setOpen] = useState(false);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button ref={opener} type="button" className={`${a.launch} ${floating ? a.launchFloat : ""}`} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span aria-hidden="true">✳</span> Ask the advisor
      </button>
      {open && (
        <>
          <div className={a.scrim} onClick={() => setOpen(false)} aria-hidden="true" />
          <div className={a.panel} role="dialog" aria-modal="true" aria-labelledby="advisor-panel-title">
            <div className={a.panelHead}>
              <h2 id="advisor-panel-title">Business Advisor</h2>
              <button
                ref={closeBtn}
                type="button"
                className={a.close}
                onClick={() => {
                  setOpen(false);
                  opener.current?.focus();
                }}
                aria-label="Close the advisor"
              >
                ✕
              </button>
            </div>
            <div className={a.panelBody}>
              <AdvisorChat context={context} known={known} variant="panel" />
            </div>
          </div>
        </>
      )}
    </>
  );
}
