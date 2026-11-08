"use client";

import { useState } from "react";
import { USE_CASES, type UseCase } from "@/lib/recommend/types.ts";
import s from "../start/start.module.css";
import { USE_CASE_LABEL } from "../tools/labels.ts";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

export function Apply() {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [uses, setUses] = useState<UseCase[]>([]);
  const [sensitive, setSensitive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; tone: "ok" | "bad" | "info"; toolId?: string } | null>(null);

  const send = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/discovery/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim(), name: name.trim(), useCases: uses, sensitive, source: "vendor_submission" }),
      });
      const body = await res.json();
      if (!res.ok) return setResult({ text: body?.error?.message ?? "We couldn't send that. Please check the fields.", tone: "bad" });
      setResult({ text: body.message, tone: body.kind === "blocked" ? "bad" : body.kind === "queued" ? "ok" : "info", toolId: body.kind === "in_catalog" ? body.toolId : undefined });
    } catch {
      setResult({ text: "We couldn't send that right now. Please try again.", tone: "bad" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className={s.intro}>
        <h1 className={s.title}>Apply to be listed</h1>
        <p className={s.lead}>Every tool gets the same automatic Safety Check, then a person reviews it. We only recommend tools that pass both. Listing is free.</p>
      </header>
      <form
        className={s.card}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className={s.field}>
          <label htmlFor="tool-name">Tool name</label>
          <input id="tool-name" className={s.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
        </div>
        <div className={s.field}>
          <label htmlFor="tool-url">Website</label>
          <input id="tool-url" className={s.input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" required />
          <span className={s.hint}>We'll read your home, about, pricing and privacy pages, and respect robots.txt.</span>
        </div>
        <fieldset className={s.field} style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className={s.label}>What problems does it solve?</legend>
          <div className={s.row}>
            {USE_CASES.map((u) => {
              const on = uses.includes(u);
              return (
                <button key={u} type="button" className={s.chipsel} aria-pressed={on} onClick={() => setUses(on ? uses.filter((x) => x !== u) : [...uses, u])}>
                  {on ? "✓ " : ""}
                  {USE_CASE_LABEL[u]}
                </button>
              );
            })}
          </div>
        </fieldset>
        <label className={s.row} style={{ gap: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} style={{ width: 22, height: 22 }} />
          <span>It takes payments or handles health information</span>
        </label>
        <p className={s.small}>
          What happens next: the next discovery run checks who's behind the tool, how long the site has been around, its privacy policy, what it does with customer data, and
          its prices. A person then approves or blocks it. We don't ask for contact details. Check back on <a href="/tools">the catalog</a>.
        </p>
        {result && (
          <p className={result.tone === "bad" ? s.error : result.tone === "ok" ? s.okNote : s.notice} aria-live="polite">
            {result.text}
            {result.toolId && (
              <>
                {" "}
                <a href={`/tools/${result.toolId}`}>See its card</a>
              </>
            )}
          </p>
        )}
        <button type="submit" className={cx(s.btn, s.primary)} style={{ justifySelf: "start" }} disabled={busy || !name.trim() || !url.trim() || uses.length === 0}>
          {busy ? "Sending…" : "Send for checking"}
        </button>
      </form>
    </>
  );
}
