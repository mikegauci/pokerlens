import { handClass } from "./cards";
import { AnalysisOptions, Decision, HandAnalysis, Verdict, analyzeHand } from "./analyze";
import { HandParseError, ParsedHand, parseHand } from "./parser";

/**
 * Session import and leak report: split a file of many hands, parse and analyse each one,
 * and aggregate EV lost by spot type, verdict counts and the basic preflop stats.
 * Pure functions with no React or network, so the same input always gives the same report.
 */

/**
 * Monte Carlo iterations per decision when analysing a whole session. Single-hand review uses 4000;
 * a session uses 1000 so a few hundred hands finish in seconds. Decisions that close the action still
 * get four times as many, as in hand review. The sample is seeded per hand, so the result is deterministic.
 */
export const SESSION_ITERATIONS = 1000;

/** Below this many hands, every stat on the report is flagged as too noisy to read much into. */
export const SMALL_SAMPLE_HANDS = 100;
/** Below this many opportunities, a single stat is flagged as unreliable. */
export const MIN_OPPORTUNITIES = 30;

// ---------------------------------------------------------------- splitting

/**
 * A hand starts on a line like "PokerStars Hand #123:", "PokerStars Zoom Hand #123:" or GGPoker's "Poker Hand #RC123:".
 * An 888poker hand starts on "#Game No : 123", or on its "***** 888poker Hand History for Game 123 *****" line when
 * that comes first.
 */
const HAND_START = /^﻿?(?:[A-Za-z][\w .'-]*? Hand #[A-Z]*\d+:|#Game No\s*:|\*{5} .+? Hand History for Game \d+)/i;
const GAME_NO = /^﻿?#Game No\s*:/i;

/** Hand id from any supported header, used to report failures and skip duplicates. */
const handIdOf = (block: string) => block.match(/Hand #([A-Z]*\d+)/i)?.[1] ?? block.match(/Hand History for Game (\d+)/i)?.[1] ?? block.match(/#Game No\s*:\s*(\d+)/i)?.[1] ?? null;

/**
 * Splits a session file into one text block per hand. Any text before the first hand header is
 * returned as its own block so it can be reported, not silently dropped.
 */
export function splitSession(text: string): string[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    // An 888 header line right after "#Game No" belongs to the same hand.
    const afterGameNo = GAME_NO.test(current.filter((l) => l.trim()).at(-1)?.trim() ?? "");
    if (HAND_START.test(line.trim()) && !afterGameNo && current.some((l) => l.trim())) {
      blocks.push(current);
      current = [];
    }
    current.push(line.replace(/^﻿/, ""));
  }
  blocks.push(current);
  return blocks.map((b) => b.join("\n").trim()).filter(Boolean);
}

// ---------------------------------------------------------------- import

export interface ImportedHand {
  /** 1-based position of the hand in the file. */
  position: number;
  text: string;
  hand: ParsedHand;
}

export interface FailedHand {
  position: number;
  /** Hand number from the header, if it could be read. */
  handId: string | null;
  reason: string;
}

export interface ImportResult {
  /** Blocks found in the file, including the ones that failed. */
  blocks: number;
  hands: ImportedHand[];
  failed: FailedHand[];
}

/** Splits and parses a session. A hand that cannot be read is recorded with its reason and the rest carry on. */
export function importSession(text: string): ImportResult {
  const blocks = splitSession(text);
  const hands: ImportedHand[] = [];
  const failed: FailedHand[] = [];
  const seen = new Map<string, number>();
  blocks.forEach((block, i) => {
    const position = i + 1;
    const handId = handIdOf(block);
    if (!HAND_START.test(block.split("\n")[0])) {
      failed.push({ position, handId, reason: "Text before the first hand header, or a block that does not start with one." });
      return;
    }
    if (handId && seen.has(handId)) {
      failed.push({ position, handId, reason: `Duplicate of hand #${handId} at position ${seen.get(handId)}, skipped so it is not counted twice.` });
      return;
    }
    try {
      const hand = parseHand(block, { allowNoDecision: true });
      if (handId) seen.set(handId, position);
      hands.push({ position, text: block, hand });
    } catch (e) {
      failed.push({ position, handId, reason: e instanceof HandParseError || e instanceof Error ? e.message : "Could not read this hand." });
    }
  });
  return { blocks: blocks.length, hands, failed };
}

// ---------------------------------------------------------------- preflop stats

export interface PreflopFacts {
  /** Hero had at least one preflop decision. False for a walk or when hero was all-in from the blinds. */
  hadDecision: boolean;
  /** Hero called or raised preflop. Posting a blind and checking the big blind do not count. */
  vpip: boolean;
  /** Hero raised preflop. */
  pfr: boolean;
  /** Hero faced exactly one raise with chips behind to re-raise. */
  threeBetOpportunity: boolean;
  /** Hero made the second raise of the hand. */
  threeBet: boolean;
}

/**
 * Replays the preflop betting to read the standard stats, using the definitions common to tracking
 * software: VPIP and PFR count every hand where hero had a preflop decision (walks are excluded);
 * a 3-bet opportunity is facing a single raise with chips left to re-raise, counted once per hand.
 */
export function preflopFacts(hand: ParsedHand): PreflopFacts {
  const hero = hand.hero;
  const stacks: Record<string, number> = Object.fromEntries(hand.players.map((p) => [p.name, p.stack]));
  const committed: Record<string, number> = Object.fromEntries(hand.players.map((p) => [p.name, 0]));
  const folded = new Set<string>();
  const allIn = new Set<string>();
  let currentBet = 0;
  let raises = 0;
  const facts: PreflopFacts = { hadDecision: false, vpip: false, pfr: false, threeBetOpportunity: false, threeBet: false };

  for (const a of hand.actions) {
    if (a.street !== "preflop") break;
    const p = a.player;
    if (p === hero && a.type !== "post") {
      facts.hadDecision = true;
      const toCall = Math.max(0, currentBet - committed[hero]);
      const othersCanAct = hand.players.some((o) => o.name !== hero && !folded.has(o.name) && !allIn.has(o.name));
      if (raises === 1 && stacks[hero] > toCall && othersCanAct) facts.threeBetOpportunity = true;
      if (a.type === "call" || a.type === "raise" || a.type === "bet") facts.vpip = true;
      if (a.type === "raise" || a.type === "bet") {
        facts.pfr = true;
        if (raises === 1) facts.threeBet = true;
      }
    }
    if (a.type === "post") {
      stacks[p] -= a.amount;
      if (a.post !== "ante") {
        committed[p] += a.amount;
        currentBet = Math.max(currentBet, committed[p]);
      }
    } else if (a.type === "fold") folded.add(p);
    else if (a.type === "call" || a.type === "bet" || a.type === "raise") {
      const add = a.type === "raise" ? (a.to ?? 0) - committed[p] : a.amount;
      stacks[p] -= add;
      committed[p] += add;
      currentBet = Math.max(currentBet, committed[p]);
      if (a.type !== "call") raises++;
    }
    if (a.allIn || stacks[p] <= 0) allIn.add(p);
  }
  return facts;
}

export interface Stat {
  /** Times the action was taken. */
  count: number;
  /** Times it could have been taken: the denominator. */
  opportunities: number;
  /** count / opportunities, or null with no opportunities. */
  value: number | null;
  /** 95% Wilson score interval for the true rate, or null with no opportunities. */
  interval: [number, number] | null;
  /** Fewer than MIN_OPPORTUNITIES, so the number says little about how hero plays. */
  unreliable: boolean;
}

/** 95% Wilson score interval: better behaved than the normal approximation for small samples and rates near 0 or 1. */
export function wilson(count: number, n: number, z = 1.96): [number, number] | null {
  if (n <= 0) return null;
  const p = count / n;
  const z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

export function makeStat(count: number, opportunities: number): Stat {
  return {
    count,
    opportunities,
    value: opportunities > 0 ? count / opportunities : null,
    interval: wilson(count, opportunities),
    unreliable: opportunities < MIN_OPPORTUNITIES,
  };
}

// ---------------------------------------------------------------- spot types

export type SpotType =
  | "pf_unopened"
  | "pf_vs_open"
  | "pf_vs_3bet"
  | "pf_vs_4bet"
  | "pf_pushfold"
  | "post_first"
  | "post_facing_bet"
  | "river_first"
  | "river_facing_bet";

export interface SpotInfo {
  label: string;
  explain: string;
  /** Where the verdicts in this spot come from, so the report can say how firm they are. */
  basis: string;
}

/** Spot types in display order. Every hero decision falls into exactly one. */
export const SPOTS: Record<SpotType, SpotInfo> = {
  pf_unopened: {
    label: "Preflop, unopened pot",
    explain: "Nobody has raised yet: you open-raise, limp, fold, or check your big blind option after limps.",
    basis: "100bb 6-max opening chart. A chart lookup, so no EV figure.",
  },
  pf_vs_open: {
    label: "Preflop, facing an open",
    explain: "One player has raised and you call, 3-bet or fold.",
    basis: "100bb calling and 3-bet charts; an all-in call or fold is judged by exact equity against the assumed range.",
  },
  pf_vs_3bet: {
    label: "Preflop, facing a 3-bet",
    explain: "There have been two raises, usually your open and a re-raise.",
    basis: "100bb 4-bet and calling charts; all-in decisions by equity.",
  },
  pf_vs_4bet: {
    label: "Preflop, facing a 4-bet or more",
    explain: "Three or more raises: ranges are narrow and stacks are often committed.",
    basis: "Narrow 5-bet and calling charts; all-in decisions by equity.",
  },
  pf_pushfold: {
    label: "Preflop, short-stack push/fold",
    explain: "About 15bb or less: shove or fold first in, reshove over an open, or call or fold against a shove whose range comes from the push/fold model.",
    basis: "Push/fold equilibrium (chip EV, no ICM). EV is exact for that model heads-up and an approximation with more players behind.",
  },
  post_first: {
    label: "Flop or turn, first to bet",
    explain: "No bet to face on the flop or turn: you bet or check.",
    basis: "Equity bands against the narrowed range. A heuristic, so no EV figure.",
  },
  post_facing_bet: {
    label: "Flop or turn, facing a bet",
    explain: "You call, raise or fold against a bet with cards still to come.",
    basis: "Equity against pot odds. Ignores implied odds and future betting unless the call puts you all-in.",
  },
  river_first: {
    label: "River, first to bet",
    explain: "No bet to face on the river: you value bet, bluff or check.",
    basis: "Equity bands against the narrowed range. A heuristic, so no EV figure.",
  },
  river_facing_bet: {
    label: "River, facing a bet",
    explain: "You call or fold against a river bet. No more cards or betting can follow a call.",
    basis: "Equity against pot odds, exact for the assumed range: the firmest EV figures in the report.",
  },
};

export const SPOT_ORDER = Object.keys(SPOTS) as SpotType[];

/** Classifies one hero decision. Uses only the hand's actions and fields `Decision` already has. */
export function spotOf(hand: ParsedHand, d: Decision): SpotType {
  if (d.street === "preflop") {
    if (d.model) return "pf_pushfold";
    let raises = 0;
    for (let i = 0; i < d.actionIndex; i++) {
      const a = hand.actions[i];
      if (a.street === "preflop" && (a.type === "raise" || a.type === "bet")) raises++;
    }
    return raises === 0 ? "pf_unopened" : raises === 1 ? "pf_vs_open" : raises === 2 ? "pf_vs_3bet" : "pf_vs_4bet";
  }
  const facing = d.toCall > 0;
  if (d.street === "river") return facing ? "river_facing_bet" : "river_first";
  return facing ? "post_facing_bet" : "post_first";
}

// ---------------------------------------------------------------- per-hand analysis

export interface HandResult {
  position: number;
  handId: string;
  facts: PreflopFacts;
  heroPosition: string;
  heroClass: string;
  netBb: number;
  /** Null for a walk: there was no decision to analyse. */
  analysis: HandAnalysis | null;
  spots: SpotType[];
  /** Set when the analysis itself failed, so the hand is reported instead of aborting the session. */
  error?: string;
}

/** Analyses one imported hand. Never throws: a failure is returned on the result. */
export function analyzeSessionHand(h: ImportedHand, opts: AnalysisOptions = {}): HandResult {
  const { hand } = h;
  const hero = hand.players.find((p) => p.isHero)!;
  const facts = preflopFacts(hand);
  const base: HandResult = {
    position: h.position,
    handId: hand.id,
    facts,
    heroPosition: hero.position,
    heroClass: handClass(hand.heroCards[0], hand.heroCards[1]),
    netBb: 0,
    analysis: null,
    spots: [],
  };
  const heroActed = hand.actions.some((a) => a.player === hand.hero && a.type !== "post");
  try {
    const analysis = analyzeHand(hand, { iterations: SESSION_ITERATIONS, ...opts });
    base.netBb = analysis.summary.netBb;
    if (!heroActed) return base;
    return { ...base, analysis, spots: analysis.decisions.map((d) => spotOf(hand, d)) };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "Analysis failed." };
  }
}

// ---------------------------------------------------------------- report

export interface SpotSummary {
  spot: SpotType;
  decisions: number;
  counts: Record<Verdict, number>;
  /** Sum of the EV figures the engine computed for decisions in this spot. */
  evLossBb: number;
  /** Mistakes and inaccuracies with an EV figure. */
  measured: number;
  /** Mistakes and inaccuracies judged by a chart or heuristic, with no EV figure. */
  unmeasured: number;
}

export interface MistakeEntry {
  position: number;
  handId: string;
  decisionIndex: number;
  actionIndex: number;
  spot: SpotType;
  street: Decision["street"];
  verdict: Verdict;
  title: string;
  evLossBb: number;
  heroClass: string;
  heroPosition: string;
  exact: boolean;
  model?: string;
}

export interface LeakReport {
  blocks: number;
  imported: number;
  failed: FailedHand[];
  /** Hands with at least one analysed decision. */
  analysed: number;
  /** Hands where hero never acted, such as walks. */
  noDecision: number;
  tournament: number;
  cash: number;
  decisions: number;
  counts: Record<Verdict, number>;
  evLossBb: number;
  evLossPer100: number | null;
  netBb: number;
  spots: SpotSummary[];
  biggest: MistakeEntry[];
  stats: { vpip: Stat; pfr: Stat; threeBet: Stat };
  smallSample: boolean;
}

const emptyCounts = (): Record<Verdict, number> => ({ good: 0, ok: 0, inaccuracy: 0, mistake: 0 });

/** Aggregates analysed hands into the leak report. `imported` supplies the file-level counts and failures. */
export function buildReport(imported: ImportResult, results: HandResult[], biggestCount = 10): LeakReport {
  const spotMap = new Map<SpotType, SpotSummary>(
    SPOT_ORDER.map((spot) => [spot, { spot, decisions: 0, counts: emptyCounts(), evLossBb: 0, measured: 0, unmeasured: 0 }]),
  );
  const failed = [...imported.failed];
  const counts = emptyCounts();
  const mistakes: MistakeEntry[] = [];
  let evLossBb = 0;
  let netBb = 0;
  let decisions = 0;
  let analysed = 0;
  let noDecision = 0;
  let tournament = 0;
  let vpip = 0, pfr = 0, preflopOpps = 0, threeBet = 0, threeBetOpps = 0;

  for (const r of [...results].sort((a, b) => a.position - b.position)) {
    if (r.error) {
      failed.push({ position: r.position, handId: r.handId, reason: `Parsed, but the analysis failed: ${r.error}` });
      continue;
    }
    netBb += r.netBb;
    if (r.facts.hadDecision) {
      preflopOpps++;
      if (r.facts.vpip) vpip++;
      if (r.facts.pfr) pfr++;
    }
    if (r.facts.threeBetOpportunity) {
      threeBetOpps++;
      if (r.facts.threeBet) threeBet++;
    }
    if (!r.analysis) {
      noDecision++;
      continue;
    }
    analysed++;
    if (r.analysis.hand.isTournament) tournament++;
    r.analysis.decisions.forEach((d, i) => {
      const spot = r.spots[i];
      const s = spotMap.get(spot)!;
      s.decisions++;
      s.counts[d.verdict]++;
      counts[d.verdict]++;
      decisions++;
      const loss = d.evLossBb ?? 0;
      s.evLossBb += loss;
      evLossBb += loss;
      const flagged = d.verdict === "mistake" || d.verdict === "inaccuracy";
      if (flagged && d.evLossBb !== undefined) s.measured++;
      else if (flagged) s.unmeasured++;
      if (d.evLossBb !== undefined && d.evLossBb > 0) {
        mistakes.push({
          position: r.position,
          handId: r.handId,
          decisionIndex: d.index,
          actionIndex: d.actionIndex,
          spot,
          street: d.street,
          verdict: d.verdict,
          title: d.title,
          evLossBb: d.evLossBb,
          heroClass: r.heroClass,
          heroPosition: r.heroPosition,
          exact: d.exact || Boolean(d.model?.exact),
          model: d.model?.name,
        });
      }
    });
  }

  mistakes.sort((a, b) => b.evLossBb - a.evLossBb || a.position - b.position || a.decisionIndex - b.decisionIndex);
  failed.sort((a, b) => a.position - b.position);
  const counted = analysed + noDecision;
  return {
    blocks: imported.blocks,
    imported: imported.hands.length,
    failed,
    analysed,
    noDecision,
    tournament,
    cash: analysed - tournament,
    decisions,
    counts,
    evLossBb,
    evLossPer100: counted > 0 ? (evLossBb / counted) * 100 : null,
    netBb,
    spots: SPOT_ORDER.map((s) => spotMap.get(s)!),
    biggest: mistakes.slice(0, biggestCount),
    stats: { vpip: makeStat(vpip, preflopOpps), pfr: makeStat(pfr, preflopOpps), threeBet: makeStat(threeBet, threeBetOpps) },
    smallSample: counted < SMALL_SAMPLE_HANDS,
  };
}

/** Imports and analyses a whole session in one call. The page runs the same steps in chunks to stay responsive. */
export function analyzeSession(text: string, opts: AnalysisOptions = {}): { imported: ImportResult; results: HandResult[]; report: LeakReport } {
  const imported = importSession(text);
  const results = imported.hands.map((h) => analyzeSessionHand(h, opts));
  return { imported, results, report: buildReport(imported, results) };
}

export interface SessionOutcome {
  report: LeakReport;
  /** Hand text by file position, for the hands the report links to, so their review can be opened. */
  texts: Record<number, string>;
}

/**
 * The same work as `analyzeSession`, one hand per step, so a caller can report progress and yield
 * between hands. Yields hands done and the total; returns the report.
 */
export function* sessionSteps(text: string, opts: AnalysisOptions = {}): Generator<{ done: number; total: number }, SessionOutcome> {
  const imported = importSession(text);
  const total = imported.hands.length;
  const results: HandResult[] = [];
  yield { done: 0, total };
  for (const h of imported.hands) {
    results.push(analyzeSessionHand(h, opts));
    yield { done: results.length, total };
  }
  const report = buildReport(imported, results);
  const linked = new Set(report.biggest.map((m) => m.position));
  const texts = Object.fromEntries(imported.hands.filter((h) => linked.has(h.position)).map((h) => [h.position, h.text]));
  return { report, texts };
}
