"use client";

/**
 * Step 6 · Your plan (spec §5): the first 30 days week by week, free fixes first, then one
 * chosen tool per problem with its setup steps, words ready to copy, free help and money,
 * and a read-only link for the owner's SBDC advisor. Built by lib/plan (no AI). Printable.
 */
import { useEffect, useMemo, useState } from "react";
import type { CatalogRecord } from "@/lib/catalog/types.ts";
import type { JourneyAnswerResponse } from "@/lib/journey/types.ts";
import { spanishProblemTitle, type PlanLanguage } from "@/lib/plan/adoption.ts";
import { buildPlan, planText } from "@/lib/plan/plan.ts";
import type { ProblemKey } from "@/lib/problems/types.ts";
import type { RecommendationResult } from "@/lib/recommend/types.ts";
import s from "./start.module.css";
import { SampleTag } from "./ToolScreens.tsx";
import { CopyButton } from "../plan/Copy.tsx";
import { Weeks } from "../plan/parts.tsx";
import { AdoptionPanel } from "./AdoptionPanel.tsx";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const keyOf = (problemId: string) => problemId.replace(/^problem-/, "") as ProblemKey;
const hours = (min: number) => (min < 60 ? `${min} minutes` : `${Math.round((min / 60) * 2) / 2} hours`);

export function PlanScreen({
  answer,
  recs,
  catalog,
  currentTools,
  back,
}: {
  answer: JourneyAnswerResponse;
  recs: RecommendationResult | null;
  catalog: CatalogRecord[];
  currentTools: string[];
  back: () => void;
}) {
  const byId = new Map(catalog.map((r) => [r.id, r]));
  // For each problem: the tools the engine recommended (best fit first), Verified only.
  const options = useMemo(() => {
    const out: Partial<Record<ProblemKey, { id: string; name: string; price: number }[]>> = {};
    for (const p of recs?.problems ?? []) {
      const seen = new Set<string>();
      out[keyOf(p.problem.id)] = p.options
        .filter((o) => o.kind !== "starter-kit")
        .flatMap((o) => o.choices)
        .filter((c) => c.tool.status === "verified" && Boolean(c.tool.reviewedAt) && !seen.has(c.tool.id) && seen.add(c.tool.id))
        .map((c) => ({ id: c.tool.id, name: c.tool.name, price: c.tool.monthlyPrice }));
    }
    return out;
  }, [recs]);
  const [choices, setChoices] = useState<Partial<Record<ProblemKey, string>>>(() =>
    Object.fromEntries(Object.entries(options).map(([k, list]) => [k, list?.[0]?.id]).filter(([, v]) => v)),
  );
  const [language, setLanguage] = useState<PlanLanguage>("en");

  const plan = buildPlan({ answer, choices, catalog, currentTools });
  const [share, setShare] = useState<{ url: string; stored: boolean; expiresAt: string | null } | { error: string } | "busy" | null>(null);
  // A link shows the plan as it was when made: changing a tool means making a new one.
  useEffect(() => setShare(null), [choices]);

  async function makeLink() {
    setShare("busy");
    try {
      const res = await fetch("/api/plan/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ context: answer.context, choices: Object.fromEntries(Object.entries(choices).filter(([, v]) => v)), currentTools }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? (language === "es" ? "No se pudo crear el enlace." : "We couldn't make a link."));
      setShare({ url: new URL(body.path, window.location.origin).toString(), stored: body.stored, expiresAt: body.expiresAt });
    } catch (e) {
      setShare({ error: e instanceof Error ? e.message : (language === "es" ? "No se pudo crear el enlace." : "We couldn't make a link.") });
    }
  }
  const link = share && typeof share === "object" && "url" in share ? share : null;
  const advisor = plan.help[0]!;
  const mail = (subject: string, body: string) => `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const toolProblems = answer.opportunities.filter((o) => o.fix.kind !== "free" && (options[o.problemKey]?.length ?? 0) > 0);
  const stepCount = plan.sections.reduce((n, sec) => n + sec.steps.length, 0);
  const visibleNotes = language === "es"
    ? [...new Set(plan.notes.map((note) => note.includes("sample tool")
      ? "Las herramientas de muestra son para la demostración y no se pueden comprar."
      : note.includes("isn't Verified")
        ? "Una herramienta sin verificar quedó fuera de tu plan."
        : note))]
    : plan.notes;

  return (
    <>
      <header className={s.intro}>
        <h1 className={s.title}>{language === "es" ? "Tu plan para" : "Your plan for"} {plan.business}</h1>
        <p className={s.lead}>{language === "es" ? "Tus primeros 30 días: primero las soluciones gratuitas y luego una herramienta a la vez. Imprime el plan, copia los textos o compártelo con un asesor gratuito." : "Your first 30 days: free fixes first, then one tool at a time. Print it, copy the ready-made words, or send it to a free advisor."}</p>
        <span className={s.small}>
          {stepCount} {language === "es" ? "pasos detallados" : "detailed steps"}
          {plan.totals.monthly > 0 && ` · ${usd(plan.totals.monthly)} ${language === "es" ? "al mes" : "a month"}${plan.totals.unknownPrices ? language === "es" ? " más precios no publicados" : " plus prices that aren't public" : ""}`}
          {plan.totals.setupMinutes > 0 && ` · ${language === "es" ? `unos ${plan.totals.setupMinutes} minutos de configuración` : `about ${hours(plan.totals.setupMinutes)} of setup`}`}
        </span>
      </header>

      {toolProblems.length > 0 && (
        <section className={cx(s.card, s.noPrint)}>
          <div className={s.cardTop}>
            <h2 className={s.h3}>{language === "es" ? "Elige una solución para cada problema" : "Pick one fix for each problem"}</h2>
            <span className={s.small}>{language === "es" ? "Las mejores opciones primero. Solo herramientas verificadas." : "Best fit first. Only ✓ Verified tools."}</span>
          </div>
          {toolProblems.map((o) => (
            <div className={s.checkRow} key={o.problemKey}>
              <span className={s.optionText}>
                <b>{language === "es" ? spanishProblemTitle(o.problemKey) : o.headline}</b>
              </span>
              <div className={s.row}>
                {options[o.problemKey]!.map((opt) => {
                  const on = choices[o.problemKey] === opt.id;
                  return (
                    <button key={opt.id} type="button" className={s.chipsel} aria-pressed={on} onClick={() => setChoices((c) => ({ ...c, [o.problemKey]: opt.id }))}>
                      {on ? "✓ " : ""}
                      {opt.name} · {usd(opt.price)}/{language === "es" ? "mes" : "mo"}{byId.get(opt.id)?.sample ? language === "es" ? " (muestra)" : " (sample)" : ""}
                    </button>
                  );
                })}
                <button type="button" className={s.chipsel} aria-pressed={!choices[o.problemKey]} onClick={() => setChoices((c) => ({ ...c, [o.problemKey]: undefined }))}>
                  {!choices[o.problemKey] ? "✓ " : ""}{language === "es" ? "Decidir más tarde" : "Decide later"}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {visibleNotes.length > 0 && (
        <div className={s.banner}>
          {visibleNotes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      )}

      <AdoptionPanel plan={plan} answer={answer} catalog={catalog} lang={language} onLanguageChange={setLanguage} />

      <details className={s.noPrint}>
        <summary className={s.link}>{language === "es" ? "Ver calendario detallado de herramientas (en inglés)" : "See the detailed tool schedule"}</summary>
        <Weeks plan={plan} />
      </details>

      <details className={s.noPrint}>
        <summary className={s.link}>{language === "es" ? "Ver pasos del proveedor y seguridad (en inglés)" : "See detailed vendor and safety steps"}</summary>
      <ol className={s.planList}>
        {plan.sections.map((sec, i) => (
          <li key={sec.id} className={s.card}>
            <div className={s.cardTop}>
              <span className={s.small}>
                {i + 1} · {sec.summary}
              </span>
              <h2 className={s.h3}>{sec.tool ? sec.tool.name : sec.heading}</h2>
              {sec.tool && (
                <span className={s.row} style={{ gap: 6 }}>
                  <span className={s.small}>For: {sec.heading.toLowerCase()}</span>
                  {sec.tool.sample && <SampleTag />}
                </span>
              )}
            </div>
            <ul className={s.planSteps}>
              {sec.steps.map((st) => (
                <li key={st.id}>
                  <span className={s.box} aria-hidden="true" />
                  <span className={s.optionText}>
                    <b>
                      {st.title}
                      {st.minutes ? <span className={s.small}> · {st.minutes} min</span> : null}
                      <span className={s.weekChip}>{st.week > 4 ? "After day 30" : `Week ${st.week}`}</span>
                    </b>
                    <span>{st.detail}</span>
                    {st.why && <span className={s.hint}>{st.why}</span>}
                    {st.link && (
                      <a href={st.link.url} target="_blank" rel="noreferrer">
                        {st.link.label} ↗
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      </details>

      <section className={cx(s.card, s.noPrint)} aria-labelledby="send-h">
        <div className={s.cardTop}>
          <h2 className={s.h3} id="send-h">
            {language === "es" ? "Comparte el plan con tu asesor" : "Send it to your advisor"}
          </h2>
          <span className={s.small}>
            {language === "es"
              ? `${advisor.name} ofrece asesoría gratuita. Envíale tu plan para que lo lea antes de la reunión${advisor.phone ? ` y llama al ${advisor.phone} para reservar una cita` : ""}.`
              : `${advisor.name} is free. Send them your plan so they can look before you meet${advisor.phone ? `, then call ${advisor.phone} to book a time` : ""}.`}
          </span>
        </div>
        <div className={s.shareBox}>
          {!link && (
            <button type="button" className={cx(s.btn, s.primary)} style={{ justifySelf: "start" }} onClick={makeLink} disabled={share === "busy"}>
              {share === "busy" ? language === "es" ? "Creando enlace…" : "Making your link…" : language === "es" ? "Crear enlace para mi asesor" : "Make a link for my advisor"}
            </button>
          )}
          {share && typeof share === "object" && "error" in share && <p className={s.banner}>{share.error}</p>}
          {link && (
            <>
              <div className={s.shareLink}>
                <input readOnly value={link.url} aria-label={language === "es" ? "Enlace a tu plan" : "Link to your plan"} onFocus={(e) => e.currentTarget.select()} />
                <CopyButton text={link.url} label={language === "es" ? "Copiar enlace" : "Copy link"} doneLabel={language === "es" ? "✓ Copiado" : "✓ Copied"} />
                <a
                  className={cx(s.btn, s.primary)}
                  href={mail(language === "es" ? `Mi plan para ${plan.business}` : `My plan for ${plan.business}`, language === "es" ? `Hola,\n\nMe gustaría recibir ayuda con mi empresa, ${plan.business}. Aquí está el plan que hice con MainStreet AI para que puedas revisarlo antes de reunirnos:\n\n${link.url}\n\n¡Gracias!` : `Hi,\n\nI'd like help with my business, ${plan.business}. Here's the plan I made with MainStreet AI, so you can look before we meet:\n\n${link.url}\n\nThank you!`)}
                >
                  {language === "es" ? "Preparar correo para mi asesor" : "Email it to my advisor"}
                </a>
              </div>
              <p className={s.hint}>
                {link.stored && link.expiresAt
                  ? language === "es"
                    ? `Solo lectura. Cualquier persona con el enlace puede verlo hasta el ${new Date(link.expiresAt).toLocaleDateString("es-US", { month: "long", day: "numeric", timeZone: "UTC" })}.`
                    : `Read-only. Anyone with the link can see it until ${new Date(link.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}.`
                  : language === "es"
                    ? "Solo lectura. Este enlace contiene todo tu plan y es largo. Si un correo lo corta, imprime el plan y llévalo contigo."
                    : "Read-only. This link holds your whole plan, so it's long: if an email cuts it off, print the plan and bring it instead."}
              </p>
            </>
          )}
        </div>
        <a className={s.link} style={{ justifySelf: "start", paddingLeft: 0 }} href={mail(language === "es" ? `Mi plan para ${plan.business}` : `My plan for ${plan.business}`, planText(plan, link?.stored ? link.url : null))}>
          {language === "es" ? "Preparar correo para mí (detalles en inglés)" : "Email the plan to myself"}
        </a>
      </section>

      <p className={s.hint}>
        {language === "es" ? "Las estimaciones y precios proceden de páginas públicas revisadas en las fechas que muestra cada herramienta. Confirma los precios con la empresa antes de comprar. Esto no es asesoría legal." : "Estimates and prices come from public pages checked on the dates shown on each tool. Confirm prices with the company before you buy. Not legal advice."}
      </p>

      <div className={cx(s.actionBar, s.noPrint)}>
        <button type="button" className={s.link} onClick={back}>
          {language === "es" ? "‹ Volver a las soluciones" : "‹ Back to ways to fix it"}
        </button>
        <button type="button" className={cx(s.btn, s.primary)} onClick={() => window.print()}>
          {language === "es" ? "Imprimir o guardar como PDF" : "Print or save as PDF"}
        </button>
      </div>
    </>
  );
}
