import { Range, mustParse } from "./ranges";

/**
 * Simplified preflop charts for 6-max cash, around 100bb deep.
 * They approximate published solver-derived charts but are binary (no mixed frequencies)
 * and ignore rake, stack depth and sizing. Treat borderline hands as close.
 */

export type ChartPos = "UTG" | "HJ" | "CO" | "BTN" | "SB";

export const RFI_TEXT: Record<ChartPos, string> = {
  UTG: "44+, A9s+, A5s-A2s, K9s+, Q9s+, J9s+, T9s, 98s, 87s, 76s, AJo+, KQo",
  HJ: "33+, A7s+, A5s-A2s, K8s+, Q9s+, J9s+, T8s+, 98s, 87s, 76s, ATo+, KJo+, QJo",
  CO: "22+, A2s+, K7s+, Q8s+, J8s+, T8s+, 97s+, 87s, 76s, 65s, ATo+, KTo+, QTo+, JTo",
  BTN: "22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 85s+, 75s+, 64s+, 54s, A2o+, K8o+, Q9o+, J9o+, T9o, 98o",
  SB: "22+, A2s+, K4s+, Q7s+, J7s+, T7s+, 96s+, 86s+, 75s+, 65s, 54s, A4o+, K9o+, Q9o+, J9o+, T9o",
};

/** Whether the first raiser opened from early or late position. */
export type OpenerGroup = "early" | "late";

export const THREE_BET_TEXT: Record<OpenerGroup, string> = {
  early: "QQ+, AKs, AKo, A5s, A4s, KQs",
  late: "TT+, AQs+, AKo, AQo, A5s-A2s, KQs, KJs, 76s, 65s",
};

export const CALL_OPEN_TEXT: Record<OpenerGroup, string> = {
  early: "JJ-77, AQs-ATs, KJs, QJs, JTs, T9s, AQo",
  late: "99-22, AJs-A8s, KTs, QTs+, JTs, T9s, 98s, 87s, AJo, KQo",
};

export const BB_DEFEND_TEXT: Record<OpenerGroup, string> = {
  early: "JJ-22, AQs-A2s, KJs-K8s, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, AQo-ATo, KJo+, QJo",
  late: "99-22, AJs-A6s, KTs-K2s, Q4s+, J6s+, T6s+, 96s+, 85s+, 74s+, 64s+, 53s+, 43s, AJo-A2o, K8o+, Q9o+, J9o+, T8o+, 98o, 87o",
};

export const FOUR_BET_TEXT = "QQ+, AKs, AKo, A5s";
export const CALL_THREE_BET_TEXT = "JJ-88, AQs, AJs, KQs, JTs, T9s";
export const FIVE_BET_TEXT = "KK+, AKs";
export const CALL_FOUR_BET_TEXT = "QQ, JJ, AKo, AQs, AA:0.3, KK:0.3";
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
