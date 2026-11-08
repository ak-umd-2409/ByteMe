import type { CatalogRecord } from "../catalog/types.ts";
import type { JourneyAnswerResponse } from "../journey/types.ts";
import type { ProblemKey } from "../problems/types.ts";
import type { Plan } from "./plan.ts";

export type PlanLanguage = "en" | "es";
export type Localized = Record<PlanLanguage, string>;

export interface Milestone {
  id: string;
  day: number;
  minutes: number | null;
  title: Localized;
  detail: Localized;
}

export interface CopyTemplate {
  id: string;
  group: "greeting" | "faq" | "review";
  title: Localized;
  text: Localized;
}

export interface AdoptionGuide {
  milestones: Milestone[];
  templates: CopyTemplate[];
  selectedToolNames: string[];
  hasSampleTools: boolean;
  resources: { name: Localized; url: string }[];
}

const joinNames = (names: string[]) => names.join(", ");
const problemEs: Record<ProblemKey, string> = {
  missed_inquiries: "Las llamadas y mensajes de clientes quedan sin respuesta",
  slow_responses: "Las respuestas a clientes tardan demasiado",
  no_online_booking: "Los clientes no pueden reservar en línea",
  scheduling_inefficiency: "Organizar las citas lleva demasiado tiempo",
  slow_quotes: "Los presupuestos tardan demasiado",
  poor_review_management: "Las reseñas en línea necesitan atención",
  no_customer_follow_up: "No se contacta a clientes anteriores",
  repetitive_admin: "El papeleo ocupa demasiado tiempo",
  inconsistent_business_info: "Los datos de la empresa no coinciden en todas partes",
};
export const spanishProblemTitle = (key: ProblemKey) => problemEs[key];

function spanishHours(hours: string): string {
  return hours
    .replace(/\bMon\b/g, "lun").replace(/\bTue\b/g, "mar").replace(/\bWed\b/g, "mié")
    .replace(/\bThu\b/g, "jue").replace(/\bFri\b/g, "vie").replace(/\bSat\b/g, "sáb")
    .replace(/\bSun\b/g, "dom").replace(/\bclosed\b/gi, "cerrado");
}

/** Build owner-facing adoption content only from the confirmed journey and chosen Verified catalog records. */
export function buildAdoptionGuide(plan: Plan, answer: JourneyAnswerResponse, catalog: CatalogRecord[]): AdoptionGuide {
  const byId = new Map(catalog.map((record) => [record.id, record]));
  const selected = plan.sections
    .map((section) => section.tool && byId.get(section.tool.id))
    .filter((record): record is CatalogRecord => Boolean(record && record.badge === "verified" && record.reviewedAt));
  const names = selected.map((record) => record.name);
  const hasSampleTools = selected.some((record) => Boolean(record.sample));
  const recordedCalls = selected.some((record) => record.rulesFlags.recordsCalls === true);
  const freeCount = answer.opportunities.filter((item) => item.fix.kind === "free").length;
  const first = selected[0];
  const second = selected[1];
  // Match the detailed schedule: free or undecided work occupies week 1;
  // each selected tool starts two weeks after the previous one.
  const firstWeek = plan.sections.some((section) => !section.tool) ? 2 : 1;
  const secondWeek = firstWeek + 2;
  const weekMinutes = (week: number) => plan.weeks.find((entry) => entry.week === week)?.minutes || null;
  const safetyEn = (record?: CatalogRecord) => record?.rulesFlags.recordsCalls ? " Confirm the required recording notice and consent before real callers use it." : "";
  const safetyEs = (record?: CatalogRecord) => record?.rulesFlags.recordsCalls ? " Confirma el aviso y consentimiento necesarios antes de atender llamadas reales." : "";
  const baseline = answer.opportunities
    .flatMap((item) => item.impact?.yourNumbers ?? [])
    .filter((item) => item.unit === "per_week" || item.unit === "per_month" || item.unit === "hours_per_week")
    .slice(0, 2)
    .map((item) => `${item.label}: ${item.value}`);
  const baselineText = baseline.length ? baseline.join("; ") : "the number of times each problem happens";

  const milestones: Milestone[] = [
    {
      id: "free", day: 1, minutes: 15,
      title: { en: freeCount ? "Start with the free fixes" : "Pick the first problem to improve", es: freeCount ? "Empieza con las soluciones gratuitas" : "Elige el primer problema que mejorarás" },
      detail: {
        en: freeCount ? `Your plan includes ${freeCount} free ${freeCount === 1 ? "fix" : "fixes"}. Open the detailed steps below and correct what you can before adding software.` : "Choose one problem to test first. Keep the change small enough to review yourself.",
        es: freeCount ? `Tu plan incluye ${freeCount} ${freeCount === 1 ? "solución gratuita" : "soluciones gratuitas"}. Abre los pasos detallados y corrige lo que puedas antes de agregar software.` : "Elige un problema para probar primero. Haz un cambio pequeño que puedas revisar tú mismo.",
      },
    },
    {
      id: "baseline", day: 2, minutes: 15,
      title: { en: "Record your starting point", es: "Anota tu punto de partida" },
      detail: {
        en: `Write down ${baselineText}. Keep totals only, without customer names or contact details.`,
        es: baseline.length ? "Anota los números que nos diste y cuántas veces ocurre cada problema. Guarda solo totales, sin nombres ni datos de contacto de clientes." : "Cuenta cuántas veces ocurre cada problema. Guarda solo totales, sin nombres ni datos de contacto de clientes.",
      },
    },
    {
      id: "verify", day: 3, minutes: 20,
      title: { en: "Check prices, privacy and support", es: "Comprueba precios, privacidad y asistencia" },
      detail: {
        en: names.length ? `Before paying for ${joinNames(names)}, confirm the current vendor, price, cancellation terms and data policy. ${hasSampleTools ? "Sample tools cannot be purchased." : "Ask who will help if setup fails."}` : "If you later choose a tool, check its current price, cancellation terms and data policy before paying.",
        es: names.length ? `Antes de pagar por ${joinNames(names)}, confirma el proveedor, precio, cancelación y política de datos actuales. ${hasSampleTools ? "Las herramientas de muestra no se pueden comprar." : "Pregunta quién te ayudará si falla la configuración."}` : "Si luego eliges una herramienta, comprueba su precio, cancelación y política de datos antes de pagar.",
      },
    },
    {
      id: "configure", day: 5, minutes: first && firstWeek === 1 ? weekMinutes(1) : 20,
      title: { en: first && firstWeek === 1 ? "Set up the first tool" : first ? "Prepare the first tool's trial" : "Test a simple manual process", es: first && firstWeek === 1 ? "Configura la primera herramienta" : first ? "Prepara la prueba de la primera herramienta" : "Prueba un proceso manual sencillo" },
      detail: {
        en: first ? firstWeek === 1 ? `Follow ${first.name}'s actual instructions, use test data, and have a person review the result.${safetyEn(first)}` : `Finish the free or undecided steps and collect ${first.name}'s setup instructions. The detailed schedule starts this tool in week 2.${safetyEn(first)}` : "Try the free first steps with no customer data. Check the result yourself.",
        es: first ? firstWeek === 1 ? `Sigue las instrucciones reales de ${first.name}, usa datos de prueba y pide a una persona que revise el resultado.${safetyEs(first)}` : `Termina los pasos gratuitos o pendientes y reúne las instrucciones de ${first.name}. El calendario detallado inicia esta herramienta en la semana 2.${safetyEs(first)}` : "Prueba los primeros pasos gratuitos sin datos de clientes. Revisa el resultado tú mismo.",
      },
    },
    {
      id: "day7", day: 7, minutes: 10,
      title: { en: "Day-7 check-in", es: "Revisión del día 7" },
      detail: { en: "Did the first change happen? Has anyone struggled to use it? Fix one issue before expanding the trial.", es: "¿Se hizo el primer cambio? ¿Alguien tuvo dificultades? Corrige un problema antes de ampliar la prueba." },
    },
    {
      id: "day14", day: 14, minutes: first && firstWeek === 2 ? weekMinutes(2) : 15,
      title: { en: first && firstWeek === 2 ? "Start the first tool's trial" : "Compare the first results", es: first && firstWeek === 2 ? "Inicia la prueba de la primera herramienta" : "Compara los primeros resultados" },
      detail: { en: first && firstWeek === 2 ? `Set up ${first.name} using test data. Confirm connections yourself and have a person review its output.${safetyEn(first)}` : "Count the same things you counted at the start. Ask your team what became easier and what still needs a person.", es: first && firstWeek === 2 ? `Configura ${first.name} con datos de prueba. Confirma cada conexión y pide a una persona que revise los resultados.${safetyEs(first)}` : "Cuenta las mismas cosas que al principio. Pregunta al equipo qué mejoró y qué sigue necesitando a una persona." },
    },
    {
      id: "day21", day: 21, minutes: second && secondWeek === 3 ? weekMinutes(3) : 20,
      title: { en: second && secondWeek === 3 ? "Review the first tool, then try the next" : "Make a team handoff", es: second && secondWeek === 3 ? "Revisa la primera herramienta y prueba la siguiente" : "Prepara instrucciones para el equipo" },
      detail: { en: second && secondWeek === 3 ? `Compare ${first?.name ?? "the first tool"} with your baseline, then start ${second.name} with test data. Keep a person checking both.${safetyEn(second)}` : "Write down who checks outputs, who handles exceptions, and when to stop the tool or revert the change.", es: second && secondWeek === 3 ? `Compara ${first?.name ?? "la primera herramienta"} con tu punto de partida y luego prueba ${second.name} con datos de prueba. Una persona debe revisar ambas.${safetyEs(second)}` : "Anota quién revisa resultados, quién atiende excepciones y cuándo detener la herramienta o revertir el cambio." },
    },
    {
      id: "day30", day: 30, minutes: second && secondWeek === 4 ? weekMinutes(4) : 15,
      title: { en: second && secondWeek === 4 ? "Review the first tool and start the next" : "Keep, change or stop", es: second && secondWeek === 4 ? "Revisa la primera herramienta e inicia la siguiente" : "Mantén, cambia o detén" },
      detail: { en: second && secondWeek === 4 ? `Compare ${first?.name ?? "the first tool"} with your baseline and monthly cost. Keep, change or stop it; then trial ${second.name}. Its two-week check is after day 30.${safetyEn(second)}` : "Compare the outcome with the monthly cost and your starting point. Keep what helped; change or cancel what did not.", es: second && secondWeek === 4 ? `Compara ${first?.name ?? "la primera herramienta"} con tu punto de partida y costo mensual. Mantén, cambia o detén; luego prueba ${second.name}. Su revisión a las dos semanas será después del día 30.${safetyEs(second)}` : "Compara los resultados con el costo mensual y el punto de partida. Mantén lo que ayudó; cambia o cancela lo que no." },
    },
  ];

  const business = answer.business.name;
  const hours = answer.business.hours;
  const recordingPrefix = recordedCalls ? "[Add a legally reviewed recording notice and consent flow here before enabling recording.] " : "";
  const recordingPrefixEs = recordedCalls ? "[Agrega aquí un aviso de grabación y un proceso de consentimiento revisados legalmente antes de activar la grabación.] " : "";
  const templates: CopyTemplate[] = [
    { id: "greeting", group: "greeting", title: { en: "Receptionist greeting", es: "Saludo de recepción" }, text: {
      en: `${recordingPrefix}Thank you for calling ${business}. We may be helping another customer. Please leave your name, number and a brief description of what you need. A person from our team will follow up.`,
      es: `${recordingPrefixEs}Gracias por llamar a ${business}. Es posible que estemos atendiendo a otro cliente. Deja tu nombre, número y una breve descripción de lo que necesitas. Una persona de nuestro equipo te responderá.`,
    } },
    { id: "faq-hours", group: "faq", title: { en: "FAQ · Hours", es: "Pregunta · Horario" }, text: hours ? {
      en: `Q: What are your hours?\nA: Our confirmed hours are ${hours}. Please contact us to check current availability.`,
      es: `P: ¿Cuál es su horario?\nR: Nuestro horario confirmado es ${spanishHours(hours)}. Contáctanos para comprobar la disponibilidad actual.`,
    } : {
      en: "Q: What are your hours?\nA: Please contact us and a person will confirm our current hours.",
      es: "P: ¿Cuál es su horario?\nR: Contáctanos y una persona confirmará nuestro horario actual.",
    } },
    { id: "faq-area", group: "faq", title: { en: "FAQ · Service area", es: "Pregunta · Zona de servicio" }, text: {
      en: "Q: Do you serve my area?\nA: Tell us your location and our team will confirm whether we can help.",
      es: "P: ¿Atienden mi zona?\nR: Dinos tu ubicación y nuestro equipo confirmará si podemos ayudarte.",
    } },
    { id: "faq-price", group: "faq", title: { en: "FAQ · Pricing", es: "Pregunta · Precios" }, text: {
      en: "Q: How much will it cost?\nA: Tell us what you need. A person will explain the next step and how we prepare an estimate.",
      es: "P: ¿Cuánto costará?\nR: Cuéntanos qué necesitas. Una persona te explicará el siguiente paso y cómo preparamos un presupuesto.",
    } },
    { id: "review-positive", group: "review", title: { en: "Review reply · Positive", es: "Respuesta · Reseña positiva" }, text: {
      en: `Thank you for taking the time to review ${business}. We appreciate your support.`,
      es: `Gracias por tomarte el tiempo de reseñar a ${business}. Agradecemos tu apoyo.`,
    } },
    { id: "review-mixed", group: "review", title: { en: "Review reply · Mixed", es: "Respuesta · Reseña mixta" }, text: {
      en: `Thank you for sharing your feedback about ${business}. We will review what worked and what could be better with our team.`,
      es: `Gracias por compartir tu opinión sobre ${business}. Revisaremos con el equipo qué funcionó y qué podemos mejorar.`,
    } },
    { id: "review-concern", group: "review", title: { en: "Review reply · Concern", es: "Respuesta · Queja" }, text: {
      en: `We are sorry to hear about your experience with ${business}. Please contact us directly so a person can understand what happened and discuss next steps.`,
      es: `Lamentamos tu experiencia con ${business}. Contáctanos directamente para que una persona entienda lo ocurrido y converse contigo sobre los próximos pasos.`,
    } },
  ];

  return {
    milestones, templates, selectedToolNames: names, hasSampleTools,
    resources: [
      { name: { en: "SBA guide to AI for small business", es: "Guía de la SBA sobre IA para pequeñas empresas" }, url: "https://www.sba.gov/business-guide/manage-your-business/ai-small-business" },
      { name: { en: "Maryland SBDC training", es: "Formación de SBDC de Maryland" }, url: "https://www.marylandsbdc.org/training" },
      { name: { en: "Find local SBA help", es: "Busca ayuda local de la SBA" }, url: "https://www.sba.gov/counseling/local-assistance/" },
      { name: { en: "Maryland funding guide (grants and loans)", es: "Guía de financiación de Maryland (subvenciones y préstamos)" }, url: "https://commerce.maryland.gov/fund" },
      ...(answer.localHelp?.county === "Frederick" ? [{ name: { en: "Frederick County business resources", es: "Recursos para empresas de Frederick" }, url: "https://frederickcountymd.gov/8699/Economic-Opportunity" }] : []),
    ],
  };
}
