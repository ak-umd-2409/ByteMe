"use client";

import { useState } from "react";
import s from "../start/start.module.css";

/** One-tap copy (spec §5.2). Says "Copied" for a moment; falls back to selecting the text. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`${s.copy} ${s.noPrint}`}
      data-done={done}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          window.prompt("Copy this text:", text);
        }
      }}
    >
      {done ? "✓ Copied" : label}
    </button>
  );
}
