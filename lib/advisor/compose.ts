/**
 * The rules answer: a complete, useful reply built only from the pack. It's what owners get
 * when AI is off, and the fallback whenever an AI answer fails its checks.
 */
import type { UseCase } from "../recommend/types.ts";
import { EXPLAINER, GUIDES, INDUSTRY_LABEL, START_SMALL } from "./knowledge.ts";
import { labelOf, type Pack } from "./pack.ts";
import type { AdvisorContext, AdvisorReply, ToolCard, Understood } from "./types.ts";

const usd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const priceText = (t: ToolCard) => (t.monthlyUsd === null ? "price not public" : `from ${usd(t.monthlyUsd)} a month`);

function toolLine(t: ToolCard): string {
  const how = t.alreadyHave
    ? "it's a feature in software you already use"
    : t.worksWithYours.length
      ? `works with your ${list(t.worksWithYours.map((w) => `${w.product} (${w.how})`))}`
      : "";
  return `${t.name} (${t.category.charAt(0).toLowerCase() === t.category.charAt(0) || /^[A-Z]{2}/.test(t.category) ? t.category : t.category.charAt(0).toLowerCase() + t.category.slice(1)}, ${priceText(t)}${how ? `; ${how}` : ""})`;
}

function toolsFor(pack: Pack, topic: UseCase): ToolCard[] {
  return pack.tools.filter((t) => t.useCases.includes(topic));
}

/** Pick the best tool per topic and fit as many as the budget allows, cheapest-first on ties. */
export function budgetPlan(pack: Pack): AdvisorReply["budgetPlan"] {
  if (pack.budget === null) return null;
  const byId = new Map(pack.tools.map((t) => [t.id, t]));
  const picks: { name: string; monthlyUsd: number }[] = [];
  const unpriced: string[] = [];
  let total = 0;
  for (const topic of pack.topics) {
    const options = toolsFor(pack, topic);
    const best = byId.get(pack.bestByTopic[topic] ?? "") ?? options[0];
    if (!best) continue;
    // Prefer the best pick if it fits; otherwise the cheapest priced option that fits.
    const fits = [best, ...options.filter((o) => o !== best).sort((a, b) => (a.monthlyUsd ?? Infinity) - (b.monthlyUsd ?? Infinity))].find(
      (o) => o.monthlyUsd !== null && total + o.monthlyUsd <= pack.budget!,
    );
    if (fits && !picks.some((p) => p.name === fits.name)) {
      picks.push({ name: fits.name, monthlyUsd: fits.monthlyUsd! });
      total += fits.monthlyUsd!;
    } else if (best.monthlyUsd === null && !unpriced.includes(best.name)) unpriced.push(best.name);
  }
  return { budget: pack.budget, picks, total: Math.round(total * 100) / 100, unpriced };
}

function opening(ctx: AdvisorContext | null, pack: Pack): string {
  if (ctx) return `For ${ctx.business}`;
  if (pack.industry && pack.industry !== "other") return `For a ${INDUSTRY_LABEL[pack.industry]} business`;
  return "For most small businesses";
}

export function compose(u: Understood, ctx: AdvisorContext | null, packIn: Pack): AdvisorReply {
  let pack = packIn;
  const parts: string[] = [];
  const topicLabels = pack.topics.map((t) => labelOf(t).toLowerCase());
  // Free fixes from the owner's own results come first: they need no AI and no money.
  const ownFree = u.topics.length ? [] : (ctx?.freeFixes ?? []).map((f) => ({ topic: f.headline, title: f.headline, detail: `${f.nextStep} Free, and no AI needed.` }));
  const freeFirst = [...ownFree, ...pack.topics.slice(0, 2).map((t) => ({ topic: labelOf(t), ...GUIDES[t].freeFirst }))].slice(0, 3);
  let notNeeded: string | null = null;
  let plan: AdvisorReply["budgetPlan"] = null;
  const health = ctx?.healthData || pack.industry === "health_clinic";

  switch (u.kind) {
    case "greeting":
    case "off-topic":
      parts.push(
        u.kind === "greeting"
          ? "Hi! I help small business owners figure out where AI is worth it, which checked tools fit, and what to do first."
          : "I can only help with running your business: where AI fits, which checked tools make sense, what they cost and how to start.",
      );
      parts.push(ctx ? `I've got your results for ${ctx.business}, so ask me anything about them.` : "Try one of the questions below, or tell me what kind of business you run.");
      return finish(parts, [], pack, ctx, u, null, null);
    case "explain":
      parts.push(EXPLAINER);
      parts.push(START_SMALL);
      if (pack.topics.length) {
        const first = pack.topics[0]!;
        parts.push(
          pack.topicSource === "results"
            ? `From your results, I'd start with ${labelOf(first).toLowerCase()}: ${GUIDES[first].whatAiDoes.charAt(0).toLowerCase()}${GUIDES[first].whatAiDoes.slice(1)}`
            : `${opening(ctx, pack)}, a common first step is ${labelOf(first).toLowerCase()}. ${GUIDES[first].whatAiDoes}`,
        );
        pack = { ...pack, tools: toolsFor(pack, first).slice(0, 2) };
      }
      break;
    case "when-not":
      parts.push("You don't need AI for everything, and often the free fix comes first.");
      for (const t of pack.topics.slice(0, 2)) parts.push(`${labelOf(t)}: ${GUIDES[t].notNeeded}`);
      parts.push("AI is worth it when a task happens every week, takes real time, and follows a pattern. Keep people on anything personal, like complaints, prices and regulars.");
      notNeeded = pack.topics.length ? GUIDES[pack.topics[0]!].notNeeded : null;
      break;
    case "existing": {
      const yours = pack.ownerTools;
      if (!yours.length) {
        parts.push("Tell me which software you already use (for example your booking, payments or accounting system) and I'll check which tools in our catalog connect to it.");
        break;
      }
      const inside = pack.tools.filter((t) => t.alreadyHave);
      const connects = pack.tools.filter((t) => !t.alreadyHave && t.worksWithYours.length);
      if (inside.length) parts.push(`Good news: ${list(inside.map((t) => t.name))} ${inside.length > 1 ? "are features" : "is a feature"} in software you already use.`);
      if (connects.length) parts.push(`These checked tools connect to what you use: ${connects.map(toolLine).join("; ")}.`);
      if (!inside.length && !connects.length) {
        parts.push(`None of the tools we've checked connect to ${list(yours)} yet, and I won't guess. Before buying something new, look in the settings of ${list(yours)} for AI or automation features.`);
        pack = { ...pack, tools: [] };
      } else pack = { ...pack, tools: [...inside, ...connects] };
      parts.push("Connecting tools is always something you set up yourself in each tool. MainStreet AI never logs into your accounts.");
      break;
    }
    case "budget": {
      plan = budgetPlan(pack);
      if (plan && plan.picks.length === 1)
        parts.push(`With ${usd(plan.budget)} a month${pack.budgetAssumed ? " (the budget we assumed)" : ""}, you could start with ${plan.picks[0]!.name} at ${usd(plan.picks[0]!.monthlyUsd)} a month.`);
      else if (plan && plan.picks.length)
        parts.push(
          `With ${usd(plan.budget)} a month${pack.budgetAssumed ? " (the budget we assumed)" : ""}, you could cover ${list(plan.picks.map((p) => `${p.name} at ${usd(p.monthlyUsd)}`))}, ${usd(plan.total)} a month in total.`,
        );
      else if (plan) parts.push(`None of the checked tools for ${list(topicLabels)} fits in ${usd(plan.budget)} a month at their listed starting prices.`);
      if (plan?.unpriced.length) parts.push(`${list(plan.unpriced)} ${plan.unpriced.length > 1 ? "don't" : "doesn't"} publish a price, so ask before you count on ${plan.unpriced.length > 1 ? "them" : "it"}.`);
      parts.push("Prices are the vendors' starting prices from their own pages; add-ons and taxes can change the total. Start with one tool, check it after two weeks, then add the next.");
      if (plan) {
        const keep = new Set([...plan.picks.map((p) => p.name), ...plan.unpriced]);
        pack = { ...pack, tools: pack.tools.filter((t) => keep.has(t.name)) };
      }
      break;
    }
    default: {
      // topic and general questions
      if (!pack.topics.length) {
        parts.push("Tell me what kind of business you run, or what takes up your time (calls, quotes, bookings, reviews, posts), and I'll show where AI could help.");
        break;
      }
      const lead =
        pack.topicSource === "results"
          ? `${opening(ctx, pack)}, your results point to ${list(topicLabels)}.`
          : pack.topicSource === "industry"
            ? `${opening(ctx, pack)}, AI most often helps with ${list(topicLabels)}.`
            : `${opening(ctx, pack)}, here's what's realistic for ${list(topicLabels)}.`;
      parts.push(lead);
      for (const t of pack.topics) {
        const tools = toolsFor(pack, t);
        parts.push(
          `${labelOf(t)}: ${GUIDES[t].whatAiDoes}${tools.length ? ` Checked options: ${tools.map(toolLine).join("; ")}.` : ""} ${GUIDES[t].keepHuman}`,
        );
      }
      notNeeded = GUIDES[pack.topics[0]!].notNeeded;
    }
  }

  if (ownFree.length && (u.kind === "general" || u.kind === "explain" || u.kind === "budget" || u.kind === "topic"))
    parts.splice(u.kind === "explain" ? parts.length : 1, 0, `Before any AI: "${ownFree[0]!.title}" is a free fix. ${ctx!.freeFixes[0]!.nextStep}`);
  if (pack.noToolYet.length)
    parts.push(
      health
        ? `We haven't checked a HIPAA-ready tool for ${list(pack.noToolYet.map((t) => labelOf(t).toLowerCase()))} yet, and patient information needs one, so I won't suggest any.`
        : `We haven't checked a tool for ${list(pack.noToolYet.map((t) => labelOf(t).toLowerCase()))} yet, so I won't guess. The free step still helps.`,
    );
  return finish(parts, freeFirst, pack, ctx, u, notNeeded, plan);
}

function finish(
  parts: string[],
  freeFirst: AdvisorReply["freeFirst"],
  pack: Pack,
  ctx: AdvisorContext | null,
  u: Understood,
  notNeeded: string | null,
  plan: AdvisorReply["budgetPlan"],
): AdvisorReply {
  const nextSteps: string[] = [];
  const own = ctx?.freeFixes.find((f) => f.headline === freeFirst[0]?.title);
  if (own) nextSteps.push(`This week (free): ${own.nextStep.charAt(0).toLowerCase()}${own.nextStep.slice(1)}`);
  else if (freeFirst[0]) nextSteps.push(`This week: ${freeFirst[0].title.charAt(0).toLowerCase()}${freeFirst[0].title.slice(1)} (free).`);
  const top = pack.tools[0];
  if (top) nextSteps.push(`Read ${top.name}'s pricing page and confirm what you'd pay before signing up.`);
  nextSteps.push(ctx ? "Make your 30-day plan so each step has a week and a time." : "Find your business so I can tailor this to your own reviews and website.");
  if (ctx?.help) nextSteps.push(`Free help: ${ctx.help.name}${ctx.help.phone ? `, ${ctx.help.phone}` : ""}.`);

  return {
    answer: parts.filter(Boolean).join("\n\n"),
    freeFirst,
    tools: u.kind === "greeting" || u.kind === "off-topic" ? [] : pack.tools,
    noToolYet: pack.noToolYet.map(labelOf),
    budgetPlan: plan,
    notNeeded,
    nextSteps: u.kind === "greeting" || u.kind === "off-topic" ? [] : nextSteps,
    followUps: followUps(u, pack, ctx),
    usedContext: Boolean(ctx),
    business: ctx?.business ?? null,
    mode: "rules",
    notice: null,
  };
}

function followUps(u: Understood, pack: Pack, ctx: AdvisorContext | null): string[] {
  const out: string[] = [];
  const t = pack.topics[0];
  if (u.kind !== "budget") out.push(ctx?.budget ? `What can I do with $${ctx.budget.value} a month?` : "I have $100 a month. What can I realistically do?");
  if (u.kind !== "existing") out.push("Can I use AI with the software I already have?");
  if (u.kind !== "when-not" && t) out.push(`Do I really need AI for ${labelOf(t).toLowerCase()}?`);
  if (u.kind !== "explain") out.push("I don't really understand AI. Where should I start?");
  return out.slice(0, 3);
}

/** Starter questions for the advisor screen, shaped by what we know. Safe to call in the browser. */
export function starters(known: { industry?: string | null; firstProblem?: string | null; budget?: number | null } = {}): string[] {
  const label = known.industry && known.industry in INDUSTRY_LABEL ? INDUSTRY_LABEL[known.industry as keyof typeof INDUSTRY_LABEL] : null;
  return [
    known.firstProblem
      ? `How do I fix this: ${known.firstProblem.replace(/[.!?]$/, "").toLowerCase()}?`
      : label && label !== "local"
        ? `How can I use AI in my ${label} business?`
        : "How can I use AI in my business?",
    "Can AI help me respond to customer enquiries?",
    "How can I spend less time preparing quotes?",
    "Can I automate appointment scheduling?",
    known.budget ? `I have $${known.budget} a month. What can I realistically do?` : "I have a $100 monthly budget. What can I realistically implement?",
    "I don't understand AI. What should I start with?",
    "Can I use AI with the software I already have?",
    "What AI tools can help with marketing?",
  ];
}
