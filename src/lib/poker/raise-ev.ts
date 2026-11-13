import { Card } from "./cards";
import { equityVsRanges } from "./equity";
import { evaluate, findDraws } from "./evaluator";
import { Combo } from "./ranges";

/**
 * EV of betting or raising on one street against one opponent, so it can be compared with checking, calling
 * or folding. The model is deliberately simple and says so:
 *
 * - The opponent continues with the strongest part of its range, just enough of it to meet the minimum
 *   defence frequency (pot / (pot + your bet)), and folds the rest. Strength is the hand made now, with a
 *   flush draw or an open-ended straight draw counted one category higher before the river.
 * - The opponent never re-raises.
 * - After a call the hand is checked down, the same assumption as the EV of calling.
 *
 * On the river this is the EV against an opponent who defends exactly the minimum with its best hands.
 * Before the river it ignores later betting, so it is a rough guide, not a verdict.
 */
export interface AggressionOption {
  kind: "bet" | "raise";
  /** True when this is the size hero actually chose; false for the standard size the review tried instead. */
  actual: boolean;
  /** Chips hero puts in with this action, including any call. */
  added: number;
  /** For a raise: hero's total on this street after raising. */
  to?: number;
  /** Share of the opponent's range that folds. */
  foldPct: number;
  /** Hero's equity against the hands that continue. */
  equityWhenCalled: number;
  /** Chip EV of the bet or raise, relative to folding now (or, when there is no bet to call, to giving up the pot). */
  ev: number;
  /** The best of the passive options: check when there is nothing to call, otherwise the better of call and fold. */
  passive: "check" | "call" | "fold";
  passiveEv: number;
  /** ev - passiveEv: what the bet or raise gains (or loses) compared with the best passive play. */
  gain: number;
}

export interface AggressionSpot {
  heroCards: Card[];
  board: Card[];
  /** Live, weighted combos of the one opponent. */
  villain: Combo[];
  /** Pot before hero acts, including the opponent's bet. */
  pot: number;
  toCall: number;
  /** Hero's chips behind before this action. */
  heroStack: number;
  /** Opponent's chips behind after its bet. */
  villainStack: number;
  /** Hero's chips already in on this street, and the opponent's. */
  heroCommitted: number;
  villainCommitted: number;
  /** Hero's raw equity against the whole range, used for the passive options. */
  equity: number;
  /** Chips hero puts in with the action being evaluated. */
  added: number;
  actual: boolean;
  iterations: number;
  rng: () => number;
}

/** Ranks a combo for the defence model: made-hand strength now, with a strong draw counted one category up before the river. */
function strength(c: Combo, board: Card[]): number {
  const made = evaluate([c.a, c.b, ...board]);
  if (board.length >= 5) return made;
  const d = findDraws([c.a, c.b], board);
  return d.flushDraw || d.straightOutRanks >= 2 ? made + (1 << 20) : made;
}

/** Exact equity on a complete board, Monte Carlo before it. */
function equityVs(hero: Card[], board: Card[], combos: Combo[], iterations: number, rng: () => number): number {
  if (board.length < 5) return equityVsRanges(hero, board, [combos], iterations, rng).equity;
  const hs = evaluate([...hero, ...board]);
  let win = 0;
  let total = 0;
  for (const c of combos) {
    const vs = evaluate([c.a, c.b, ...board]);
    total += c.w;
    if (hs > vs) win += c.w;
    else if (hs === vs) win += c.w / 2;
  }
  return total > 0 ? win / total : 0;
}

/** The standard size the review tries when hero did not bet or raise: two thirds of the pot, or a raise to three times the bet. */
export function standardSize(spot: { pot: number; toCall: number; heroCommitted: number; villainCommitted: number; heroStack: number }): number {
  const wanted = spot.toCall > 0 ? 3 * spot.villainCommitted - spot.heroCommitted : (2 / 3) * spot.pot;
  return Math.min(spot.heroStack, Math.max(wanted, spot.toCall));
}

export function aggressionEv(s: AggressionSpot): AggressionOption | null {
  const dead = new Set([...s.heroCards, ...s.board]);
  const live = s.villain.filter((c) => c.w > 0 && !dead.has(c.a) && !dead.has(c.b));
  const totalW = live.reduce((t, c) => t + c.w, 0);
  if (!totalW || s.added <= s.toCall || s.villainStack <= 0) return null;

  // Chips the opponent would have to add to call, limited by its stack; anything above that comes back to hero.
  const heroTo = s.heroCommitted + s.added;
  const villainCall = Math.min(heroTo - s.villainCommitted, s.villainStack);
  const effectiveAdded = Math.min(s.added, s.villainCommitted + villainCall - s.heroCommitted);

  const mdf = s.pot / (s.pot + s.added);
  const sorted = [...live].sort((x, y) => strength(y, s.board) - strength(x, s.board));
  const continuing: Combo[] = [];
  let need = mdf * totalW;
  for (const c of sorted) {
    if (need <= 1e-9) break;
    const w = Math.min(c.w, need);
    continuing.push({ ...c, w });
    need -= w;
  }
  const callW = continuing.reduce((t, c) => t + c.w, 0);
  const foldPct = 1 - callW / totalW;
  const eqCalled = callW > 0 ? equityVs(s.heroCards, s.board, continuing, s.iterations, s.rng) : 0;

  const ev = foldPct * s.pot + (1 - foldPct) * (eqCalled * (s.pot + effectiveAdded + villainCall) - effectiveAdded);
  const callEv = s.equity * (s.pot + s.toCall) - s.toCall;
  const passive = s.toCall > 0 ? (callEv > 0 ? "call" : "fold") : "check";
  const passiveEv = s.toCall > 0 ? Math.max(callEv, 0) : s.equity * s.pot;
  return {
    kind: s.toCall > 0 ? "raise" : "bet",
    actual: s.actual,
    added: s.added,
    to: s.toCall > 0 ? heroTo : undefined,
    foldPct,
    equityWhenCalled: eqCalled,
    ev,
    passive,
    passiveEv,
    gain: ev - passiveEv,
  };
}
