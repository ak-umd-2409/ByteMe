"use client";

import { useEffect, useState } from "react";
import type { CatalogRecord } from "@/lib/catalog/types.ts";
import type { JourneyAnswerResponse } from "@/lib/journey/types.ts";
import { buildAdoptionGuide, type PlanLanguage } from "@/lib/plan/adoption.ts";
import type { Plan } from "@/lib/plan/plan.ts";
import a from "./adoption.module.css";

type Answer = "yes" | "partly" | "no";
type Saved = { completed: string[]; day7?: Answer; day30?: Answer };

const words = {
  en: {
    title: "Your first 30 days", intro: "A small step each week. You choose what goes live.", steps: "steps done", week: "Week", day: "Day", minutes: "min", timeUnknown: "Time varies",
    content: "Words you can use", contentIntro: "Drafts from your confirmed business details. Read and edit them before customers see them.", copy: "Copy text", copied: "Copied", copyFail: "Copy was unavailable. Select and copy the text instead.",
    help: "Get a person to help", helpIntro: "Bring your plan to a Maryland SBDC advisor or a SCORE mentor. These organizations have not endorsed the tools shown here.", mentor: "Find a SCORE mentor", helper: "Vetted setup helper", helperNote: "Prototype only. No helper is vetted or bookable yet.",
    resources: "Free learning and funding leads", resourcesIntro: "Explore these official pages. Funding is not guaranteed; loans must be repaid. Check current eligibility with each program.",
    checkins: "Check in on day 7 and day 30", checkinsIntro: "Your answers are saved only in this browser. No reminder or feedback is sent to the catalog yet.", running: "Day 7 · Did the first change happen?", helping: "Day 30 · Did the first change help?", yes: "Yes", partly: "Partly", no: "No", saved: "Saved on this device", local: "Progress stays on this device.",
    safety: "If a tool records calls, confirm the notice and consent requirements before using it with real callers. Ask your SBDC advisor if unsure.", sample: "Sample tools are for the demo and cannot be purchased.", legal: "Prices and setup times are estimates from catalog records. Confirm current vendor terms. Not legal advice.",
  },
  es: {
    title: "Tus primeros 30 días", intro: "Un paso pequeño cada semana. Tú decides qué se pone en marcha.", steps: "pasos completados", week: "Semana", day: "Día", minutes: "min", timeUnknown: "El tiempo varía",
    content: "Textos que puedes usar", contentIntro: "Borradores basados en los datos confirmados de tu empresa. Léelos y edítalos antes de compartirlos con clientes.", copy: "Copiar texto", copied: "Copiado", copyFail: "No se pudo copiar. Selecciona el texto y cópialo.",
    help: "Pide ayuda a una persona", helpIntro: "Lleva tu plan a un asesor de SBDC de Maryland o a un mentor de SCORE. Estas organizaciones no han recomendado las herramientas mostradas.", mentor: "Buscar mentor de SCORE", helper: "Ayudante de configuración", helperNote: "Solo prototipo. Aún no hay ningún ayudante evaluado ni disponible.",
    resources: "Formación gratuita y posibles ayudas", resourcesIntro: "Explora estas páginas oficiales. La financiación no está garantizada; los préstamos deben pagarse. Consulta los requisitos actuales de cada programa.",
    checkins: "Revisa los días 7 y 30", checkinsIntro: "Tus respuestas se guardan solo en este navegador. Todavía no se envían recordatorios ni comentarios al catálogo.", running: "Día 7 · ¿Se hizo el primer cambio?", helping: "Día 30 · ¿Ayudó el primer cambio?", yes: "Sí", partly: "En parte", no: "No", saved: "Guardado en este dispositivo", local: "El progreso queda en este dispositivo.",
    safety: "Si una herramienta graba llamadas, confirma los requisitos de aviso y consentimiento antes de usarla con clientes. Consulta a tu asesor de SBDC si tienes dudas.", sample: "Las herramientas de muestra son para la demostración y no se pueden comprar.", legal: "Los precios y tiempos de configuración son estimaciones del catálogo. Confirma las condiciones actuales del proveedor. Esto no es asesoría legal.",
  },
};

export function AdoptionPanel({ plan, answer, catalog, lang, onLanguageChange }: { plan: Plan; answer: JourneyAnswerResponse; catalog: CatalogRecord[]; lang: PlanLanguage; onLanguageChange: (language: PlanLanguage) => void }) {
  const guide = buildAdoptionGuide(plan, answer, catalog);
  const [saved, setSaved] = useState<Saved>({ completed: [] });
  const [message, setMessage] = useState("");
  const w = words[lang];
  const key = `byteme-adoption:v1:${plan.business}:${answer.opportunities.map((item) => item.problemKey).join("|")}:${plan.sections.map((section) => section.tool?.id ?? section.id).join("|")}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw && JSON.parse(raw) as Saved;
      setSaved(parsed && Array.isArray(parsed.completed) ? parsed : { completed: [] });
    } catch { setSaved({ completed: [] }); }
  }, [key]);

  function update(next: Saved) {
    setSaved(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Still usable during this visit. */ }
  }

  function toggle(id: string) {
    update({ ...saved, completed: saved.completed.includes(id) ? saved.completed.filter((item) => item !== id) : [...saved.completed, id] });
  }

  async function copy(text: string, success: string) {
    try { await navigator.clipboard.writeText(text); setMessage(success); }
    catch { setMessage(w.copyFail); }
  }

  return (
    <div className={a.flow} lang={lang}>
      <section className={a.timeline} aria-labelledby="adoption-title">
        <div className={a.heading}>
          <div><span className={a.kicker}>{lang === "es" ? "5.1 · ADOPCIÓN" : "5.1 · SETUP PLAN"}</span><h2 id="adoption-title">{w.title}</h2><p>{w.intro}</p></div>
          <button type="button" className={a.language} onClick={() => onLanguageChange(lang === "en" ? "es" : "en")}>{lang === "en" ? "Español" : "English"} ↗</button>
        </div>
        <div className={a.progress}>{saved.completed.length}/{guide.milestones.length} {w.steps}</div>
        {[1, 2, 3, 4].map((week) => {
          const steps = guide.milestones.filter((step) => Math.min(4, Math.ceil(step.day / 7)) === week);
          if (!steps.length) return null;
          return <div className={a.week} key={week}>
            <h3>{w.week} {week}</h3>
            {steps.map((step) => <label className={a.step} key={step.id}>
              <input type="checkbox" checked={saved.completed.includes(step.id)} onChange={() => toggle(step.id)} aria-label={`${w.day} ${step.day}: ${step.title[lang]}`} />
              <span className={a.day}>{w.day} {step.day}</span>
              <span className={a.stepText}><strong>{step.title[lang]}</strong><span>{step.detail[lang]}</span></span>
              <span className={a.time}>{step.minutes === null ? w.timeUnknown : `${step.minutes} ${w.minutes}`}</span>
            </label>)}
          </div>;
        })}
      </section>

      <section className={a.templates} aria-labelledby="content-title">
        <div className={a.heading}><div><span className={a.kicker}>{lang === "es" ? "5.2 · TEXTOS" : "5.2 · CONTENT"}</span><h2 id="content-title">{w.content}</h2><p>{w.contentIntro}</p></div></div>
        <p className={a.notice}>{w.safety}</p>
        <div className={a.templateGrid}>{guide.templates.map((template) => <article className={a.template} key={template.id}>
          <h3>{template.title[lang]}</h3><p>{template.text[lang]}</p>
          <button type="button" onClick={() => void copy(template.text[lang], w.copied)}>{w.copy} ↗</button>
        </article>)}</div>
      </section>

      <section className={a.support} aria-labelledby="help-title">
        <div className={a.heading}><div><span className={a.kicker}>{lang === "es" ? "5.3 · AYUDA" : "5.3 · HELP"}</span><h2 id="help-title">{w.help}</h2><p>{w.helpIntro}</p></div></div>
        <div className={a.supportGrid}>
          {plan.help.map((item) => <a key={item.name} href={item.name.toLowerCase().includes("score") ? "https://www.score.org/md/mentors/" : item.url} target="_blank" rel="noreferrer"><strong>{item.name.toLowerCase().includes("score") ? w.mentor : item.name}</strong><span>{lang === "es" ? item.name.toLowerCase().includes("score") ? "Mentoría gratuita por código postal y especialidad." : "Asesoría empresarial gratuita para pequeñas empresas de Maryland." : item.detail}{item.phone ? ` · ${item.phone}` : ""}</span><b>↗</b></a>)}
          <div className={a.prototype}><strong>{w.helper}</strong><span>{w.helperNote}</span></div>
        </div>
      </section>

      <section className={a.resources} aria-labelledby="resources-title">
        <div className={a.heading}><div><span className={a.kicker}>{lang === "es" ? "5.7 · RECURSOS" : "5.7 · RESOURCES"}</span><h2 id="resources-title">{w.resources}</h2><p>{w.resourcesIntro}</p></div></div>
        <div className={a.resourceGrid}>{guide.resources.map((item) => <a href={item.url} key={item.url} target="_blank" rel="noreferrer">{item.name[lang]} ↗</a>)}</div>
      </section>

      <section className={a.checkins} aria-labelledby="checkins-title">
        <div className={a.heading}><div><span className={a.kicker}>{lang === "es" ? "5.8 · REVISIONES" : "5.8 · CHECK-INS"}</span><h2 id="checkins-title">{w.checkins}</h2><p>{w.checkinsIntro}</p></div></div>
        <div className={a.checkinGrid}>{([7, 30] as const).map((day) => <div className={a.checkin} key={day}>
          <h3>{day === 7 ? w.running : w.helping}</h3>
          <div>{(["yes", "partly", "no"] as const).map((answerValue) => <button type="button" key={answerValue} aria-pressed={saved[day === 7 ? "day7" : "day30"] === answerValue} onClick={() => update({ ...saved, [day === 7 ? "day7" : "day30"]: answerValue })}>{w[answerValue]}</button>)}</div>
          <small>{saved[day === 7 ? "day7" : "day30"] ? w.saved : w.local}</small>
        </div>)}</div>
      </section>

      {guide.hasSampleTools && <p className={a.sample}>{w.sample}</p>}
      <p className={a.legal}>{w.legal}</p>
      <div role="status" aria-live="polite" className={a.feedback}>{message}</div>
    </div>
  );
}
