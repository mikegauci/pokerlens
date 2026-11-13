import { Range, mustParse } from "./ranges";

/**
 * Simplified preflop charts for 6-max cash. They approximate published solver-derived charts but were not
 * solved in this repo, so they are heuristics: they ignore rake and bet sizing, and treat every seat the same
 * when facing a 3-bet.
 *
 * A token with a weight, such as "A9s:0.5", is a mixed hand: the chart takes that action that share of the time.
 * A hand's raise and call weights add up to at most 1; the rest is a fold.
 *
 * There are two sets: "deep" for about 40bb or more (written for 100bb) and "mid" for about 15-40bb, where
 * opens get tighter from early seats, re-raises get more linear because many of them are all-in, and calling
 * a 3-bet mostly disappears. Under about 15bb the push/fold solver takes over for shoves.
 */

export type ChartPos = "UTG" | "HJ" | "CO" | "BTN" | "SB";

/** Whether the first raiser opened from early or late position. */
export type OpenerGroup = "early" | "late";

export type DepthBand = "deep" | "mid";

/** Effective stacks below this many big blinds use the "mid" charts. */
export const MID_DEPTH_MAX_BB = 40;

export const DEPTH_LABELS: Record<DepthBand, string> = { deep: "100bb chart", mid: "15-40bb chart" };

export function depthBand(effectiveBb: number): DepthBand {
  return effectiveBb < MID_DEPTH_MAX_BB ? "mid" : "deep";
}

export interface ChartSet {
  rfi: Record<ChartPos, string>;
  threeBet: Record<OpenerGroup, string>;
  callOpen: Record<OpenerGroup, string>;
  bbDefend: Record<OpenerGroup, string>;
  fourBet: string;
  callThreeBet: string;
  fiveBet: string;
  callFourBet: string;
}

export const CHARTS: Record<DepthBand, ChartSet> = {
  deep: {
    rfi: {
      UTG: "55+, 44:0.5, ATs+, A9s:0.5, A5s, A4s-A2s:0.5, KTs+, K9s:0.5, QTs+, Q9s:0.5, JTs, J9s:0.5, T9s, 98s:0.5, 87s:0.25, 76s:0.25, AQo+, AJo:0.75, KQo:0.5",
      HJ: "44+, 33:0.5, A8s+, A7s:0.5, A5s-A3s, A2s:0.5, K9s+, K8s:0.5, QTs+, Q9s:0.75, JTs, J9s:0.75, T9s, T8s:0.5, 98s, 87s:0.5, 76s:0.5, AJo+, ATo:0.75, KQo, KJo:0.5, QJo:0.25",
      CO: "33+, 22:0.5, A2s+, K8s+, K7s:0.5, Q9s+, Q8s:0.5, J9s+, J8s:0.5, T8s+, 98s, 97s:0.5, 87s, 76s, 65s:0.5, AJo+, ATo, KJo+, KTo:0.5, QJo, QTo:0.5, JTo:0.5",
      BTN: "22+, A2s+, K2s+, Q7s+, Q6s-Q5s:0.5, J7s+, T7s+, 97s+, 96s:0.5, 86s+, 85s:0.5, 75s+, 64s+, 54s, A2o+, K9o+, K8o:0.5, QTo+, Q9o:0.5, JTo, J9o:0.5, T9o, 98o:0.25",
      SB: "22+, A2s+, K6s+, K5s-K4s:0.5, Q8s+, Q7s:0.5, J8s+, J7s:0.5, T8s+, T7s:0.5, 97s+, 96s:0.5, 87s, 86s:0.5, 76s, 75s:0.5, 65s, 54s:0.75, A8o+, A7o-A4o:0.5, KTo+, K9o:0.5, QTo+, Q9o:0.5, JTo, J9o:0.5, T9o:0.5",
    },
    threeBet: {
      early: "QQ+, AKs, AKo, A5s:0.5, A4s:0.5, KQs:0.5",
      late: "JJ+, TT:0.75, AQs+, AKo, AQo:0.5, A5s-A4s, A3s-A2s:0.5, KQs, KJs:0.5, 76s:0.5, 65s:0.5",
    },
    callOpen: {
      early: "JJ-88, 77:0.5, AQs-AJs, ATs:0.5, KQs:0.5, KJs, QJs, JTs:0.75, T9s:0.5, AQo:0.75",
      late: "TT:0.25, 99-66, 55-22:0.5, AJs-A9s, A8s:0.5, KJs:0.5, KTs, QTs+, JTs, T9s, 98s, 87s:0.5, AQo:0.5, AJo, KQo",
    },
    bbDefend: {
      early: "JJ-22, AQs-A6s, A5s-A4s:0.5, A3s-A2s, KQs:0.5, KJs-K8s, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, AQo-ATo, KJo+, QJo",
      late: "99-22, AJs-A6s, KTs-K2s, Q4s+, J6s+, T6s+, 96s+, 85s+, 74s+, 76s:0.5, 64s+, 65s:0.5, 53s+, 43s, AJo-A2o, K8o+, Q9o+, J9o+, T8o+, 98o, 87o",
    },
    fourBet: "KK+, QQ:0.75, AKs, AKo:0.75, A5s:0.5",
    callThreeBet: "QQ:0.25, JJ-99, 88:0.5, AQs, AJs:0.75, KQs, JTs, T9s:0.5, AKo:0.25",
    fiveBet: "AA:0.7, KK:0.7, AKs",
    callFourBet: "QQ, JJ, AKo, AQs, AA:0.3, KK:0.3",
  },
  mid: {
    rfi: {
      UTG: "55+, 44:0.5, ATs+, A9s:0.5, A5s:0.5, KTs+, QTs+, JTs, T9s:0.25, AJo+, KQo:0.5",
      HJ: "44+, 33:0.5, A8s+, A5s-A4s, A3s-A2s:0.5, K9s+, QTs+, Q9s:0.5, JTs, J9s:0.5, T9s, 98s:0.25, ATo+, KJo+, QJo:0.5",
      CO: "22+, A2s+, K7s+, Q9s+, J9s+, T8s+, 98s, 87s:0.5, 76s:0.25, A9o+, A8o:0.5, KTo+, QTo+, JTo",
      BTN: "22+, A2s+, K2s+, Q6s+, J7s+, T7s+, 97s+, 86s+, 76s, 65s:0.5, A2o+, K8o+, Q9o+, J9o+, T9o:0.5",
      SB: "22+, A2s+, K2s+, Q4s+, J7s+, T7s+, 97s+, 86s+, 76s, 65s:0.5, A2o+, K8o+, Q9o+, J9o+, T9o",
    },
    threeBet: {
      early: "TT+, AQs+, AKo, AQo:0.5, A5s:0.5",
      late: "88+, 77:0.5, ATs+, A5s-A2s:0.5, KJs+, QJs:0.5, AJo+, ATo:0.5, KQo:0.5",
    },
    callOpen: {
      early: "99-55, 44-22:0.25, AJs-ATs, KQs, KJs, QJs, JTs, AQo:0.5",
      late: "77:0.5, 66-22, A9s-A6s, KTs, QTs, JTs, T9s, 98s, A9o-A8o:0.5, ATo:0.5, KJo, KQo:0.5, QJo:0.5",
    },
    bbDefend: {
      early: "99-22, AJs-A6s, A5s:0.5, A4s-A2s, KJs-K9s, Q9s+, J9s+, T8s+, 98s, 87s, 76s, AQo:0.5, AJo-ATo, KJo+, QJo",
      late: "77:0.5, 66-22, A9s-A6s, A5s-A2s:0.5, KTs-K2s, Q5s+, QJs:0.5, J7s+, T7s+, 96s+, 86s+, 75s+, 65s, 54s, ATo:0.5, A9o-A2o, K8o+, KQo:0.5, Q9o+, J9o+, T9o, 98o",
    },
    fourBet: "TT+, AQs+, AKo, AQo:0.5, A5s:0.5",
    callThreeBet: "99-77:0.5, AJs, KQs, QJs:0.5",
    fiveBet: "QQ+, AKs, AKo",
    callFourBet: "JJ-TT, AQs",
  },
};

// The deep charts under their original names, used by the range trainer and anything that assumes 100bb.
export const RFI_TEXT = CHARTS.deep.rfi;
export const THREE_BET_TEXT = CHARTS.deep.threeBet;
export const CALL_OPEN_TEXT = CHARTS.deep.callOpen;
export const BB_DEFEND_TEXT = CHARTS.deep.bbDefend;
export const FOUR_BET_TEXT = CHARTS.deep.fourBet;
export const CALL_THREE_BET_TEXT = CHARTS.deep.callThreeBet;
export const FIVE_BET_TEXT = CHARTS.deep.fiveBet;
export const CALL_FOUR_BET_TEXT = CHARTS.deep.callFourBet;
export const LIMP_TEXT = "99-22, A9s-A2s, K9s-K5s, Q7s+, J7s+, T7s+, 97s+, 86s+, 76s, 65s, ATo-A2o, K9o+, Q9o+, J9o+, T9o";

const cache = new Map<string, Range>();
export function chart(text: string): Range {
  let r = cache.get(text);
  if (!r) {
    r = mustParse(text);
    cache.set(text, r);
  }
  return r;
}

/** Maps any table position to the chart it uses. Heads-up button plays the button chart. */
export function chartPos(position: string): ChartPos {
  if (position === "SB") return "SB";
  if (position === "BTN" || position === "BTN/SB") return "BTN";
  if (position === "CO") return "CO";
  if (position === "HJ") return "HJ";
  if (position === "BB") return "CO";
  return "UTG";
}

export function openerGroup(position: string): OpenerGroup {
  return ["CO", "BTN", "BTN/SB", "SB", "BB"].includes(position) ? "late" : "early";
}

/** The raising chart and the calling chart for one preflop situation. An empty `callText` means raise or fold. */
export interface ChartPair {
  raiseText: string;
  callText: string;
}

/** Folded to hero: open-raise or fold. */
export function firstInCharts(position: string, band: DepthBand = "deep"): ChartPair {
  return { raiseText: CHARTS[band].rfi[chartPos(position)], callText: "" };
}

/** Hero faces a single open-raise. The big blind defends wider because it closes the action at a discount. */
export function facingOpenCharts(position: string, opener: string, band: DepthBand = "deep"): ChartPair {
  const g = openerGroup(opener);
  const c = CHARTS[band];
  return { raiseText: c.threeBet[g], callText: position === "BB" ? c.bbDefend[g] : c.callOpen[g] };
}

/** Hero opened and faces a 3-bet. One chart for every position: a simplification. */
export function facingThreeBetCharts(band: DepthBand = "deep"): ChartPair {
  return { raiseText: CHARTS[band].fourBet, callText: CHARTS[band].callThreeBet };
}

/** How often a pair of charts raises, calls and folds a hand class. Weights are capped so the three add up to 1. */
export function frequencies(pair: ChartPair, cls: string): { raise: number; call: number; fold: number } {
  const raise = chart(pair.raiseText).get(cls) ?? 0;
  const call = Math.min(pair.callText ? (chart(pair.callText).get(cls) ?? 0) : 0, 1 - raise);
  return { raise, call, fold: Math.max(0, 1 - raise - call) };
}
