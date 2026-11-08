"use client";

import { useEffect, useRef, useState } from "react";
import { AdvisorChat, type Known } from "./AdvisorChat.tsx";
import a from "./advisor.module.css";

/**
 * "Ask the advisor": a pill that opens the advisor in a side panel, so the owner never loses
 * their place. `floating` pins the pill to the corner; `raised` lifts it above a sticky
 * action bar so it never covers the page's main button.
 */
export function AdvisorPanel({ context, known, floating = false, raised = false }: { context: string | null; known: Known; floating?: boolean; raised?: boolean }) {
  const [open, setOpen] = useState(false);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (!open) {
      // Back to the pill once it's visible again, so keyboard users don't lose their place.
      if (wasOpen.current) opener.current?.focus();
      wasOpen.current = false;
      return;
    }
    wasOpen.current = true;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        ref={opener}
        type="button"
        className={[a.launch, floating && a.launchFloat, raised && a.launchRaised].filter(Boolean).join(" ")}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        hidden={open && floating}
      >
        <span className={a.spark} aria-hidden="true">
          ✳
        </span>
        Ask the advisor
      </button>
      {open && (
        <>
          <div className={a.scrim} onClick={close} aria-hidden="true" />
          <div className={a.panel} role="dialog" aria-modal="true" aria-labelledby="advisor-panel-title">
            <div className={a.panelHead}>
              <div className={a.panelWho}>
                <h2 id="advisor-panel-title">
                  <span className={a.spark} aria-hidden="true">
                    ✳
                  </span>{" "}
                  Business Advisor
                </h2>
                <span>{known.business ? `Advising ${known.business}` : "General answers · checked tools only"}</span>
              </div>
              <button ref={closeBtn} type="button" className={a.close} onClick={close} aria-label="Close the advisor">
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
