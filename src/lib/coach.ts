import { cardsStr } from "./poker/cards";
import { Decision, HandAnalysis, PROFILES, VillainProfile } from "./poker/analyze";

const pct = (x: number | undefined) => (x === undefined ? "n/a" : `${Math.round(x * 100)}%`);

/**
 * Turns the analysis into a compact fact sheet. The language model only ever sees these
 * computed numbers, so it explains the maths instead of inventing it.
 */
export function buildFacts(a: HandAnalysis, profile: VillainProfile): string {
  const { hand, summary } = a;
  const bb = hand.bb;
  const inBb = (x: number) => `${Math.round((x / bb) * 10) / 10}bb`;
  const lines: string[] = [];
  lines.push(`Game: ${hand.game}, ${hand.players.length}-handed, blinds ${hand.sb}/${hand.bb}.`);
  lines.push(`Hero: ${cardsStr(hand.heroCards)} (${summary.heroClass}) in ${summary.heroPosition}, ${Math.round(summary.heroStackBb)}bb deep.`);
  lines.push(`Final board: ${hand.board.length ? cardsStr(hand.board) : "none (hand ended preflop)"}.`);
  lines.push(`Result for hero: ${summary.netBb >= 0 ? "+" : ""}${summary.netBb.toFixed(1)}bb.`);
  const shown = Object.entries(hand.shown).filter(([n]) => n !== hand.hero);
  if (shown.length) lines.push(`Shown down: ${shown.map(([n, c]) => `${n} had ${cardsStr(c)}`).join("; ")}.`);
  lines.push(`Opponent profile assumed: ${PROFILES[profile].label} (${PROFILES[profile].hint})`);
  lines.push("");
  lines.push("Action:");
  for (const s of a.timeline) if (!/posts/.test(s.text)) lines.push(`- [${s.street}] ${s.text}`);
  lines.push("");
  const flagged = a.decisions.filter((d) => d.verdict === "mistake" || d.verdict === "inaccuracy").length;
  lines.push(`Hero decisions (all numbers are computed, use them as given): ${a.decisions.length}, of which ${flagged} flagged as a mistake or inaccuracy.`);
  a.decisions.forEach((d: Decision, i) => {
    const parts = [
      `#${i + 1} ${d.street}${d.board.length ? ` (${cardsStr(d.board)})` : ""}: hero ${d.action.type}${d.action.added ? ` ${inBb(d.action.added)}` : ""}`,
      `holding: ${d.handDesc}`,
      `pot ${inBb(d.pot)}`,
      d.toCall ? `to call ${inBb(d.toCall)}` : "not facing a bet",
      `equity vs assumed range ${pct(d.equity)}`,
    ];
    if (d.potOdds !== undefined && d.toCall) parts.push(`equity needed ${pct(d.potOdds)}`);
    if (d.evCall !== undefined && d.toCall) parts.push(`EV of calling vs folding ${d.evCall >= 0 ? "+" : ""}${inBb(d.evCall)}`);
    if (d.betPct !== undefined) parts.push(`size ${pct(d.betPct)} of pot`);
    if (d.breakevenFold !== undefined) parts.push(`pure bluff break-even fold frequency ${pct(d.breakevenFold)}`);
    if (d.spr !== null) parts.push(`SPR ${d.spr.toFixed(1)}`);
    if (d.inPosition !== null) parts.push(d.inPosition ? "in position" : "out of position");
    parts.push(d.exact ? "no further betting possible" : "more betting can follow");
    lines.push(parts.join("; ") + ".");
    for (const v of d.villains) lines.push(`   Opponent ${v.name} (${v.position}) range: ${v.rangeLabel}${v.custom ? " set by the user" : ""}, starting from [${v.rangeText}], about ${v.combos} weighted combos left.`);
    lines.push(`   Engine verdict: ${d.verdict.toUpperCase()}: ${d.title}.${d.evLossBb ? ` Estimated EV lost: ${d.evLossBb.toFixed(1)}bb.` : ""}`);
    if (d.model) lines.push(`   Model used: ${d.model.name}${d.model.exact ? " (exact for that game)" : " (approximation)"}. ${d.model.note}`);
    if (d.chart) lines.push(`   Preflop chart (${d.chart.situation}) recommends: ${d.chart.recommended}.`);
  });
  return lines.join("\n");
}

export const COACH_INSTRUCTIONS = `You are a poker coach reviewing one No-Limit Hold'em hand for a player who wants to improve.

You are given a fact sheet produced by a deterministic analysis engine. Rules:
- Use only the numbers in the fact sheet. Never calculate or estimate new equities, EVs or frequencies yourself. If the player asks for a number that is not there, say the engine did not compute it and reason qualitatively.
- The opponent ranges are simplified chart-based estimates narrowed by a heuristic, not solver output. Say so when a verdict is close or depends heavily on the range, and tell the player which read about the opponent would change the answer.
- Equity is raw showdown equity. On earlier streets, mention implied odds, reverse implied odds or position when they matter.
- When the fact sheet says "Model used" for a decision, that range or verdict comes from a push/fold equilibrium solved by the engine. You may call it an equilibrium of that model, and you must mention its stated limits.
- Otherwise do not call anything "GTO" or "solver-approved". Distinguish between the theoretical baseline and exploitative adjustments against this opponent type.
- Agree with the engine verdicts unless the fact sheet itself gives a reason to doubt one; if you do doubt one, say why.
- Be direct and specific to this hand. No generic poker advice, no filler, no praise for its own sake.

Format for the first review: plain text with short Markdown.
1. One sentence with the overall verdict.
2. "**Biggest leak**": the single most costly decision, with its numbers and what to do instead.
3. "**Street by street**": one or two sentences per decision that matters. Skip routine ones.
4. "**Takeaway**": one concrete habit or study drill.
Keep it under 220 words. For follow-up questions, answer in under 120 words.`;

/** The model request behind `/api/coach`, shared with the live coach evaluation so both send the same prompt. */
export function coachRequest(facts: string, messages: { role: "user" | "assistant"; content: string }[] = []) {
  return {
    model: process.env.OPENAI_MODEL || "gpt-5.5",
    instructions: COACH_INSTRUCTIONS,
    input: [{ role: "user" as const, content: `Fact sheet for the hand:\n\n${facts}\n\nReview this hand.` }, ...messages],
    max_output_tokens: 900,
  };
}

/** Used when no API key is configured, so the app still explains itself. */
export function fallbackExplanation(a: HandAnalysis): string {
  const worst = [...a.decisions].sort((x, y) => rank(y) - rank(x))[0];
  const flagged = a.decisions.filter((d) => d.verdict === "mistake" || d.verdict === "inaccuracy");
  const out: string[] = [];
  out.push(flagged.length ? `This hand has ${flagged.length} decision${flagged.length > 1 ? "s" : ""} worth another look.` : "Nothing in this hand stands out as an error against the assumed ranges.");
  if (flagged.length && worst) {
    out.push("", `**Biggest leak**: ${worst.street}, ${worst.title.toLowerCase()}. ${worst.reasons.slice(0, 2).join(" ")}`);
  }
  if (flagged.length > 1) {
    out.push("", "**Street by street**");
    for (const d of flagged) if (d !== worst) out.push(`- ${d.street}: ${d.title}. ${d.reasons[0] ?? ""}`);
  }
  const net = Number(a.summary.netBb.toFixed(1));
  out.push("", `**Hand result**: ${net > 0 ? "+" : ""}${net}bb.`);
  return out.join("\n");
}

const rank = (d: Decision) => (d.verdict === "mistake" ? 100 : d.verdict === "inaccuracy" ? 50 : 0) + (d.evLossBb ?? 0);
