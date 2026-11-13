import { Card, RANKS, handClass, rankOf } from "./cards";
import { evaluate, findDraws } from "./evaluator";

/** A weighted two-card holding. */
export interface Combo {
  a: Card;
  b: Card;
  w: number;
}

/** Hand class ("AKs") to weight in 0..1. */
export type Range = Map<string, number>;

/** All 169 hand classes laid out as the usual 13x13 grid (suited above the diagonal). */
export const GRID: string[][] = Array.from({ length: 13 }, (_, i) =>
  Array.from({ length: 13 }, (_, j) => {
    const r1 = RANKS[12 - i];
    const r2 = RANKS[12 - j];
    if (i === j) return r1 + r2;
    return i < j ? r1 + r2 + "s" : r2 + r1 + "o";
  }),
);

export const ALL_CLASSES: string[] = GRID.flat();

export function combosOfClass(cls: string): [Card, Card][] {
  const hi = RANKS.indexOf(cls[0]);
  const lo = RANKS.indexOf(cls[1]);
  const out: [Card, Card][] = [];
  if (hi === lo) {
    for (let s1 = 0; s1 < 4; s1++) for (let s2 = s1 + 1; s2 < 4; s2++) out.push([hi * 4 + s1, lo * 4 + s2]);
  } else if (cls[2] === "s") {
    for (let s = 0; s < 4; s++) out.push([hi * 4 + s, lo * 4 + s]);
  } else {
    for (let s1 = 0; s1 < 4; s1++) for (let s2 = 0; s2 < 4; s2++) if (s1 !== s2) out.push([hi * 4 + s1, lo * 4 + s2]);
  }
  return out;
}

export interface ParsedRange {
  range: Range;
  errors: string[];
}

/**
 * Parses standard range notation: "22+, JJ-77, ATs+, A5s-A2s, KQo, AK, random".
 * A token may carry a weight, e.g. "AA:0.3".
 */
export function parseRange(text: string): ParsedRange {
  const range: Range = new Map();
  const errors: string[] = [];
  const add = (cls: string, w: number) => {
    if (ALL_CLASSES.includes(cls)) range.set(cls, w);
  };

  for (const raw of text.split(/[,\n]/)) {
    let tok = raw.trim();
    if (!tok) continue;
    let w = 1;
    const wm = tok.match(/^(.*):\s*([0-9.]+)$/);
    if (wm) {
      tok = wm[1].trim();
      w = Math.max(0, Math.min(1, parseFloat(wm[2])));
    }
    if (/^(random|any|any two|100%|\*)$/i.test(tok)) {
      for (const c of ALL_CLASSES) add(c, w);
      continue;
    }
    const norm = (t: string) => t.slice(0, 2).toUpperCase() + t.slice(2).toLowerCase();
    const single = /^([2-9TJQKA])([2-9TJQKA])([so])?(\+)?$/i;
    const dash = /^([2-9TJQKA])([2-9TJQKA])([so])?-([2-9TJQKA])([2-9TJQKA])([so])?$/i;

    const expand = (r1: number, r2: number, suit: string | undefined, weight: number) => {
      const hi = Math.max(r1, r2);
      const lo = Math.min(r1, r2);
      if (hi === lo) return add(RANKS[hi] + RANKS[lo], weight);
      if (suit) return add(RANKS[hi] + RANKS[lo] + suit, weight);
      add(RANKS[hi] + RANKS[lo] + "s", weight);
      add(RANKS[hi] + RANKS[lo] + "o", weight);
    };

    let m = norm(tok).match(single);
    if (m) {
      const r1 = RANKS.indexOf(m[1].toUpperCase());
      const r2 = RANKS.indexOf(m[2].toUpperCase());
      const suit = m[3]?.toLowerCase();
      if (r1 === r2 && suit) {
        errors.push(`"${tok}": a pair cannot be suited or offsuit`);
        continue;
      }
      if (!m[4]) {
        expand(r1, r2, suit, w);
      } else if (r1 === r2) {
        for (let r = r1; r <= 12; r++) expand(r, r, undefined, w);
      } else {
        const hi = Math.max(r1, r2);
        for (let lo = Math.min(r1, r2); lo < hi; lo++) expand(hi, lo, suit, w);
      }
      continue;
    }
    m = norm(tok).match(dash);
    if (m) {
      const a1 = RANKS.indexOf(m[1].toUpperCase());
      const a2 = RANKS.indexOf(m[2].toUpperCase());
      const b1 = RANKS.indexOf(m[4].toUpperCase());
      const b2 = RANKS.indexOf(m[5].toUpperCase());
      const suit = (m[3] ?? m[6])?.toLowerCase();
      if (a1 === a2 && b1 === b2) {
        for (let r = Math.min(a1, b1); r <= Math.max(a1, b1); r++) expand(r, r, undefined, w);
        continue;
      }
      const hiA = Math.max(a1, a2);
      const hiB = Math.max(b1, b2);
      if (hiA === hiB && a1 !== a2 && b1 !== b2) {
        const loA = Math.min(a1, a2);
        const loB = Math.min(b1, b2);
        for (let lo = Math.min(loA, loB); lo <= Math.max(loA, loB); lo++) expand(hiA, lo, suit, w);
        continue;
      }
      errors.push(`"${tok}": a dash range needs the same high card (e.g. A5s-A2s) or two pairs (JJ-77)`);
      continue;
    }
    errors.push(`"${tok}" is not valid range notation`);
  }
  return { range, errors };
}

export const mustParse = (text: string): Range => {
  const { range, errors } = parseRange(text);
  if (errors.length) throw new Error(errors.join("; "));
  return range;
};

/** Expands a range to weighted combos, dropping any that use a dead card. */
export function expandRange(range: Range, dead: Card[] = []): Combo[] {
  const deadSet = new Set(dead);
  const out: Combo[] = [];
  for (const [cls, w] of range) {
    if (w <= 0) continue;
    for (const [a, b] of combosOfClass(cls)) {
      if (!deadSet.has(a) && !deadSet.has(b)) out.push({ a, b, w });
    }
  }
  return out;
}

export function removeDead(combos: Combo[], dead: Card[]): Combo[] {
  const deadSet = new Set(dead);
  return combos.filter((c) => !deadSet.has(c.a) && !deadSet.has(c.b));
}

/** Share of all 1326 starting hands, weighted. */
export function rangePercent(range: Range): number {
  let total = 0;
  for (const [cls, w] of range) total += combosOfClass(cls).length * w;
  return total / 1326;
}

/** Average remaining weight per hand class, for drawing a range grid. */
export function classWeights(combos: Combo[]): Record<string, number> {
  const sum: Record<string, number> = {};
  for (const c of combos) {
    const cls = handClass(c.a, c.b);
    sum[cls] = (sum[cls] ?? 0) + c.w;
  }
  const out: Record<string, number> = {};
  for (const cls of Object.keys(sum)) out[cls] = Math.min(1, sum[cls] / combosOfClass(cls).length);
  return out;
}

export const totalWeight = (combos: Combo[]) => combos.reduce((s, c) => s + c.w, 0);

export type VillainAction = "bet" | "raise" | "call" | "check";

export interface NarrowContext {
  /** Size of the bet made or called, as a fraction of the pot before it. */
  sizeFrac?: number;
  /** Scales how many weak hands stay in a betting or raising range. 1 is the default. */
  bluffFactor?: number;
}

export interface Multipliers {
  strong: number;
  medium: number;
  draw: number;
  weak: number;
}

/**
 * How much of each strength bucket a player keeps after an action.
 * This is a transparent heuristic, not a solver output:
 * - betting and raising keep value hands and draws, and get more polarised on later streets and with bigger sizes;
 * - calling keeps medium hands and draws, and sheds more weak hands the bigger the bet;
 * - checking slightly discounts the strongest hands.
 */
export function multipliers(action: VillainAction, boardCards: number, ctx: NarrowContext = {}): Multipliers {
  const size = ctx.sizeFrac ?? 0.6;
  const bluff = ctx.bluffFactor ?? 1;
  const streetIdx = boardCards === 3 ? 0 : boardCards === 4 ? 1 : 2;
  const sizeTier = size < 0.4 ? 0 : size <= 0.75 ? 1 : 2;
  if (action === "bet" || action === "raise") {
    const raise = action === "raise" ? 0.5 : 1;
    return {
      strong: 1,
      medium: [0.6, 0.45, 0.3][streetIdx] * [1, 0.7, 0.4][sizeTier] * raise,
      draw: action === "raise" ? 0.6 : 0.75,
      weak: Math.min(1, [0.25, 0.2, 0.15][streetIdx] * raise * bluff),
    };
  }
  if (action === "call") {
    return { strong: streetIdx === 2 ? 0.7 : 0.8, medium: 1, draw: 1, weak: streetIdx === 2 ? 0.05 : [0.3, 0.15, 0.05][sizeTier] };
  }
  return { strong: 0.6, medium: 1, draw: 0.9, weak: 1 };
}

/** Fraction of all possible holdings that count as "strong" and "strong or medium" on a board. */
const STRONG_TOP = 0.15;
const MEDIUM_TOP = 0.45;

/** Reweights a range on the current board after a postflop action. */
export function narrowRange(combos: Combo[], board: Card[], action: VillainAction, ctx: NarrowContext = {}): Combo[] {
  if (board.length < 3 || combos.length === 0) return combos;
  const onBoard = new Set(board);
  const scores: number[] = [];
  for (let a = 0; a < 52; a++) {
    if (onBoard.has(a)) continue;
    for (let b = a + 1; b < 52; b++) {
      if (onBoard.has(b)) continue;
      scores.push(evaluate([a, b, ...board]));
    }
  }
  scores.sort((x, y) => y - x);
  const strongCut = scores[Math.floor(scores.length * STRONG_TOP)];
  const mediumCut = scores[Math.floor(scores.length * MEDIUM_TOP)];
  const k = multipliers(action, board.length, ctx);

  const out: Combo[] = [];
  for (const c of combos) {
    const s = evaluate([c.a, c.b, ...board]);
    let mult: number;
    if (s >= strongCut) mult = k.strong;
    else {
      const d = findDraws([c.a, c.b], board);
      const hasDraw = d.flushDraw || d.straightOutRanks >= 2;
      const made = s >= mediumCut ? k.medium : k.weak;
      mult = hasDraw ? Math.max(made, k.draw) : made;
    }
    const w = c.w * mult;
    if (w >= 0.005) out.push({ a: c.a, b: c.b, w });
  }
  return out.length ? out : combos;
}

export const sortedRanks = (cs: Card[]) => cs.map(rankOf).sort((a, b) => b - a);
