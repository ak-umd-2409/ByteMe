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
  // A floating pill steps aside while it sits on top of a button or link, so it never hides the next step.
  const [tucked, setTucked] = useState(false);
  useEffect(() => {
    if (!floating) return;
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const pill = opener.current;
        if (!pill) return;
        const box = pill.getBoundingClientRect();
        if (!box.width) return;
        const pad = 8;
        const points: [number, number][] = [
          [box.left - pad, box.top - pad], [box.right + pad, box.top - pad], [box.left - pad, box.bottom + pad], [box.right + pad, box.bottom + pad],
          [box.left + box.width / 2, box.top + box.height / 2], [box.left + 4, box.top + box.height / 2], [box.right - 4, box.top + box.height / 2],
        ];
        const hit = points.some(([x, y]) =>
          document.elementsFromPoint(x, y).some((el) => el !== pill && !pill.contains(el) && el.closest("button, a, input, select, textarea, label") !== null && !pill.contains(el.closest("button, a, input, select, textarea, label"))),
        );
        setTucked(hit);
      });
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      mo.disconnect();
    };
  }, [floating]);

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
        className={[a.launch, floating && a.launchFloat, raised && a.launchRaised, floating && tucked && a.launchTucked].filter(Boolean).join(" ")}
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
