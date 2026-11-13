import { RANKS } from "./cards";
import { PREFLOP_EQUITY_MILLIONTHS } from "./preflop-equity-data";
import { ALL_CLASSES, Range, combosOfClass } from "./ranges";

/**
 * Push/fold equilibrium for short stacks.
 *
 * The game: one player moves all-in or folds; each player still to act calls or folds.
 * Nobody limps, raises small or calls and plays a flop. Payoffs are chips, so there is no ICM.
 *
 * What is exact and what is not:
 * - One shover and one caller (small blind against big blind, or a reshove against one opener)
 *   is a two-player zero-sum game. It is solved here to a stated distance from equilibrium, using
 *   exact hand-versus-hand all-in equities and exact card removal between the two hands.
 * - With two or more players left to act it is an APPROXIMATION: at most one player calls
 *   (nobody overcalls, so there are no three-way all-ins), and each caller's cards are treated as
 *   independent of the other callers' cards. Folded players' cards are ignored everywhere.
 *
 * Equities come from preflop-equity-data.ts, a checked-in table built by scripts/preflop-equity.ts
 * with the evaluator in this folder. It is checked in because enumerating every board for every
 * matchup takes minutes, far too slow to do when a page loads; the table is exact, not sampled.
 */

const N = ALL_CLASSES.length;
const CLASS_INDEX = new Map(ALL_CLASSES.map((c, i) => [c, i]));
const COMBOS = ALL_CLASSES.map((c) => combosOfClass(c).length);

/** Stacks at or below this many big blinds are reviewed with the push/fold model. */
export const PUSH_FOLD_MAX_BB = 15;

interface Tables {
  /** eq[i * N + j]: all-in equity of class i against class j. */
  eq: Float64Array;
  /** w[i * N + j]: ways to deal class i and class j at once without sharing a card. */
  w: Float64Array;
  /** w * eq, so one pass gives both a probability and an equity sum. */
  we: Float64Array;
}

let cached: Tables | null = null;
function tables(): Tables {
  if (cached) return cached;
  const eq = new Float64Array(N * N);
  const w = new Float64Array(N * N);
  const we = new Float64Array(N * N);
  let k = 0;
  for (let i = 0; i < N; i++) {
    eq[i * N + i] = 0.5;
    for (let j = i + 1; j < N; j++) {
      const e = PREFLOP_EQUITY_MILLIONTHS[k++] / 1e6;
      eq[i * N + j] = e;
      eq[j * N + i] = 1 - e;
    }
  }
  const combos = ALL_CLASSES.map(combosOfClass);
  for (let i = 0; i < N; i++) {
    for (let j = i; j < N; j++) {
      let n = 0;
      for (const [a, b] of combos[i]) for (const [c, d] of combos[j]) if (a !== c && a !== d && b !== c && b !== d) n++;
      w[i * N + j] = n;
      w[j * N + i] = n;
    }
  }
  for (let i = 0; i < N * N; i++) we[i] = w[i] * eq[i];
  cached = { eq, w, we };
  return cached;
}

const indexOf = (cls: string): number => {
  const i = CLASS_INDEX.get(cls);
  if (i === undefined) throw new Error(`Unknown hand class: "${cls}"`);
  return i;
};

/** Exact preflop all-in equity of one hand class against another. */
export function classEquity(a: string, b: string): number {
  return tables().eq[indexOf(a) * N + indexOf(b)];
}

/** Number of ways two hand classes can be dealt at once without sharing a card. */
export function pairCombos(a: string, b: string): number {
  return tables().w[indexOf(a) * N + indexOf(b)];
}

/** Exact all-in equity of a hand class against a weighted range, with card removal. */
export function equityVsRange(cls: string, range: Record<string, number>): number {
  const { w, we } = tables();
  const o = indexOf(cls) * N;
  let num = 0;
  let den = 0;
  for (let j = 0; j < N; j++) {
    const f = range[ALL_CLASSES[j]] ?? 0;
    num += we[o + j] * f;
    den += w[o + j] * f;
  }
  return den > 0 ? num / den : 0;
}

export interface ShoveGame {
  /** Effective stack in big blinds at the start of the hand, including blinds and antes already posted. */
  stack: number;
  /** Everything in the pot before the shove, in big blinds: blinds, antes and any raise being shoved over. */
  pot: number;
  shover: { posted: number; range?: Range };
  /** Players who can still call, in the order they act. `stack` defaults to the game's stack. */
  callers: { posted: number; stack?: number; range?: Range }[];
}

export interface ShoveSolution {
  game: ShoveGame;
  /** True for one shover and one caller, where the model has no approximation beyond its rules. */
  exact: boolean;
  /** How often each hand class shoves, 0..1. */
  shove: Record<string, number>;
  /** How often each hand class calls, per caller, 0..1. */
  calls: Record<string, number>[];
  /** Share of the shover's starting hands that shove. */
  shovePct: number;
  /** Share of each caller's starting hands that call. */
  callPcts: number[];
  /** Chip EV in big blinds of shoving each hand, measured from the start of the hand. Folding is `-shover.posted`. */
  shoveEv: Record<string, number>;
  /** Chip EV of calling for each caller and hand, given that the shove reached them. Folding is `-posted`. */
  callEv: Record<string, number>[];
  /** Total a best response could gain over these strategies, in big blinds per hand. Zero at an exact equilibrium. */
  exploitability: number;
  /** The exploitability the solver aimed to get under. */
  tolerance: number;
  iterations: number;
}

const weightsOf = (range: Range | undefined): Float64Array => {
  const out = new Float64Array(N);
  if (!range) return out.fill(1);
  for (const [cls, v] of range) out[indexOf(cls)] = Math.max(0, Math.min(1, v));
  return out;
};

const MAX_ITERATIONS = 6000;
const CHECK_EVERY = 100;
/**
 * How close to equilibrium a solution is taken: the most that best responses could gain, summed
 * over the players, in big blinds per hand. The multiway model is an approximation already and
 * costs more per iteration, so it is solved less finely.
 */
export const SOLVE_TOLERANCE_BB = 0.00002;
export const MULTIWAY_TOLERANCE_BB = 0.0002;
/** Frequencies this close to never or always are rounded, if the result stays inside the tolerance. */
const SNAP = 0.03;

const cache = new Map<string, ShoveSolution>();
const rangeKey = (r: Range | undefined) => (r ? [...r].filter(([, v]) => v > 0).map(([c, v]) => `${c}:${v}`).sort().join(",") : "*");

/**
 * Solves a shove game with CFR+ (regret matching that never lets a regret go negative, with
 * later iterations weighted more in the average). There is no randomness, so the same game
 * always gives the same answer.
 */
export function solveShoveGame(game: ShoveGame): ShoveSolution {
  const key = JSON.stringify([game.stack, game.pot, game.shover.posted, rangeKey(game.shover.range), game.callers.map((c) => [c.posted, c.stack ?? game.stack, rangeKey(c.range)])]);
  const hit = cache.get(key);
  if (hit) return hit;

  const { w, we } = tables();
  const K = game.callers.length;
  const q = weightsOf(game.shover.range);
  const r = game.callers.map((c) => weightsOf(c.range));
  const stackOf = game.callers.map((c) => Math.min(game.stack, c.stack ?? game.stack));
  // Chips at stake in a showdown with caller m: both stacks plus what everyone else left in the pot.
  const total = game.callers.map((c, m) => 2 * stackOf[m] + (game.pot - game.shover.posted - c.posted));
  const steal = game.pot - game.shover.posted;
  const shoverFold = -game.shover.posted;

  // norm[m][s]: weight of caller m's range that is still possible when the shover holds s.
  const norm = r.map((rm) => {
    const out = new Float64Array(N);
    for (let s = 0; s < N; s++) {
      let n = 0;
      for (let h = 0; h < N; h++) n += w[s * N + h] * rm[h];
      out[s] = n;
    }
    return out;
  });

  const kappa = Array.from({ length: K }, () => new Float64Array(N));
  const showdown = Array.from({ length: K }, () => new Float64Array(N));
  const rc = new Float64Array(N);

  /** Fills, for caller m, how often they call each shover hand and the shover's EV when they do. */
  const respond = (m: number, c: Float64Array) => {
    for (let h = 0; h < N; h++) rc[h] = r[m][h] * c[h];
    for (let s = 0; s < N; s++) {
      const o = s * N;
      let k = 0;
      let e = 0;
      for (let h = 0; h < N; h++) {
        k += w[o + h] * rc[h];
        e += we[o + h] * rc[h];
      }
      const n = norm[m][s];
      kappa[m][s] = n > 0 ? k / n : 0;
      showdown[m][s] = n > 0 ? (e * total[m] - k * stackOf[m]) / n : 0;
    }
  };

  /** Shover's EV of shoving each hand, from the current `kappa` and `showdown`. */
  const pushValues = (out: Float64Array) => {
    for (let s = 0; s < N; s++) {
      let reach = 1;
      let v = 0;
      for (let m = 0; m < K; m++) {
        v += reach * showdown[m][s];
        reach *= 1 - kappa[m][s];
      }
      out[s] = v + reach * steal;
    }
  };

  const g = new Float64Array(N);
  const reached = new Float64Array(N);
  /** Caller m's value of calling and of folding with each hand, weighted by how often the shove reaches them (`reached`). */
  const callValues = (m: number, p: Float64Array, call: Float64Array, fold: Float64Array) => {
    for (let s = 0; s < N; s++) {
      let reach = q[s] * p[s];
      for (let l = 0; l < m; l++) reach *= 1 - kappa[l][s];
      g[s] = reach;
    }
    for (let h = 0; h < N; h++) {
      const o = h * N;
      let reach = 0;
      let e = 0;
      for (let s = 0; s < N; s++) {
        reach += w[o + s] * g[s];
        e += we[o + s] * g[s];
      }
      reached[h] = reach;
      call[h] = e * total[m] - reach * stackOf[m];
      fold[h] = -game.callers[m].posted * reach;
    }
  };

  let joint = 0;
  for (let s = 0; s < N; s++) joint += q[s] * COMBOS[s];
  const shoverMass = joint;

  const vPush = new Float64Array(N);
  const vCall = new Float64Array(N);
  const vFold = new Float64Array(N);

  /** Sum over players of what a best response would gain, in big blinds per hand. */
  const exploitability = (p: Float64Array, c: Float64Array[]): number => {
    for (let m = 0; m < K; m++) respond(m, c[m]);
    pushValues(vPush);
    let gain = 0;
    for (let s = 0; s < N; s++) {
      const mix = p[s] * vPush[s] + (1 - p[s]) * shoverFold;
      gain += (q[s] * COMBOS[s] * (Math.max(vPush[s], shoverFold) - mix)) / shoverMass;
    }
    for (let m = 0; m < K; m++) {
      callValues(m, p, vCall, vFold);
      let mass = 0;
      let sum = 0;
      for (let h = 0; h < N; h++) {
        if (r[m][h] <= 0) continue;
        sum += r[m][h] * (Math.max(vCall[h], vFold[h]) - (c[m][h] * vCall[h] + (1 - c[m][h]) * vFold[h]));
        let n = 0;
        for (let s = 0; s < N; s++) n += w[h * N + s] * q[s];
        mass += r[m][h] * n;
      }
      if (mass > 0) gain += sum / mass;
    }
    return gain;
  };

  const p = new Float64Array(N).fill(0.5);
  const c = Array.from({ length: K }, () => new Float64Array(N).fill(0.5));
  const pSum = new Float64Array(N);
  const cSum = Array.from({ length: K }, () => new Float64Array(N));
  const pRegret = [new Float64Array(N), new Float64Array(N)];
  const cRegret = Array.from({ length: K }, () => [new Float64Array(N), new Float64Array(N)]);
  const pAvg = new Float64Array(N);
  const cAvg = Array.from({ length: K }, () => new Float64Array(N));

  const match = (reg: Float64Array[], i: number, yes: number, no: number, strat: Float64Array) => {
    const mix = strat[i] * yes + (1 - strat[i]) * no;
    const a = Math.max(0, reg[0][i] + yes - mix);
    const b = Math.max(0, reg[1][i] + no - mix);
    reg[0][i] = a;
    reg[1][i] = b;
    strat[i] = a + b > 0 ? a / (a + b) : 0.5;
  };

  const tolerance = K === 1 ? SOLVE_TOLERANCE_BB : MULTIWAY_TOLERANCE_BB;
  let iterations = 0;
  let exploit = Infinity;
  let weight = 0;
  for (let m = 0; m < K; m++) respond(m, c[m]);
  while (iterations < MAX_ITERATIONS) {
    iterations++;
    weight += iterations;
    for (let s = 0; s < N; s++) pSum[s] += iterations * p[s];
    for (let m = 0; m < K; m++) for (let h = 0; h < N; h++) cSum[m][h] += iterations * c[m][h];

    pushValues(vPush);
    for (let s = 0; s < N; s++) if (q[s] > 0) match(pRegret, s, vPush[s], shoverFold, p);
    for (let m = 0; m < K; m++) {
      callValues(m, p, vCall, vFold);
      for (let h = 0; h < N; h++) if (r[m][h] > 0) match(cRegret[m], h, vCall[h], vFold[h], c[m]);
      respond(m, c[m]);
    }

    if (iterations % CHECK_EVERY === 0 || iterations === MAX_ITERATIONS) {
      for (let s = 0; s < N; s++) pAvg[s] = q[s] > 0 ? pSum[s] / weight : 0;
      for (let m = 0; m < K; m++) for (let h = 0; h < N; h++) cAvg[m][h] = r[m][h] > 0 ? cSum[m][h] / weight : 0;
      exploit = exploitability(pAvg, cAvg);
      // Aim for half the tolerance, which leaves room to round near-pure frequencies below.
      if (exploit <= tolerance / 2) break;
      // `exploitability` overwrote kappa and showdown with the averages; put the current strategies back.
      for (let m = 0; m < K; m++) respond(m, c[m]);
    }
  }

  // CFR leaves traces such as 0.99 or 0.01 on hands that are really pure. Round them when that costs nothing that matters.
  const snap = (a: Float64Array) => a.map((x) => (x < SNAP ? 0 : x > 1 - SNAP ? 1 : x));
  const pSnap = snap(pAvg);
  const cSnap = cAvg.map(snap);
  const snapped = exploitability(pSnap, cSnap);
  if (snapped <= Math.max(tolerance, exploit)) {
    pAvg.set(pSnap);
    cAvg.forEach((a, m) => a.set(cSnap[m]));
    exploit = snapped;
  }
  for (let m = 0; m < K; m++) respond(m, cAvg[m]);
  pushValues(vPush);
  const record = (a: Float64Array) => Object.fromEntries(ALL_CLASSES.map((cls, i) => [cls, a[i]]));
  const pct = (freq: Float64Array, prior: Float64Array) => {
    let num = 0;
    let den = 0;
    for (let i = 0; i < N; i++) {
      num += prior[i] * COMBOS[i] * freq[i];
      den += prior[i] * COMBOS[i];
    }
    return den > 0 ? num / den : 0;
  };
  const callEv: Record<string, number>[] = [];
  for (let m = 0; m < K; m++) {
    callValues(m, pAvg, vCall, vFold);
    const ev = new Float64Array(N);
    for (let h = 0; h < N; h++) ev[h] = reached[h] > 0 ? vCall[h] / reached[h] : callIfReached(m, h);
    callEv.push(record(ev));
  }
  /** EV of calling when nothing reaches this caller in the solution: taken against the whole shoving prior. */
  function callIfReached(m: number, h: number): number {
    let reach = 0;
    let e = 0;
    for (let s = 0; s < N; s++) {
      reach += w[h * N + s] * q[s];
      e += we[h * N + s] * q[s];
    }
    return reach > 0 ? (e * total[m]) / reach - stackOf[m] : 0;
  }

  const solution: ShoveSolution = {
    game,
    exact: K === 1,
    shove: record(pAvg),
    calls: cAvg.map(record),
    shovePct: pct(pAvg, q),
    callPcts: cAvg.map((a, m) => pct(a, r[m])),
    shoveEv: record(vPush),
    callEv,
    exploitability: exploit,
    tolerance,
    iterations,
  };
  if (cache.size > 400) cache.clear();
  cache.set(key, solution);
  return solution;
}

export interface FirstInSpot {
  /** Effective stack in big blinds, including the blind and ante. */
  stackBb: number;
  /** Players dealt in. Folded players matter only through their antes. */
  players: number;
  /** Players still to act after the shover: 1 is the small blind against the big blind. */
  playersBehind: number;
  /** Ante per player in big blinds. */
  anteBb?: number;
  /** Stacks of the players behind, in action order, when they differ from the shover's. */
  stacksBehind?: number[];
}

/** The game where everyone has folded to a player who shoves or folds. */
export function firstInGame(spot: FirstInSpot): ShoveGame {
  const ante = spot.anteBb ?? 0;
  const k = Math.max(1, Math.min(spot.playersBehind, spot.players - 1));
  const callers: ShoveGame["callers"] = [];
  for (let i = 0; i < k; i++) {
    const fromEnd = k - 1 - i;
    callers.push({ posted: ante + (fromEnd === 0 ? 1 : fromEnd === 1 ? 0.5 : 0), stack: spot.stacksBehind?.[i] });
  }
  return {
    stack: spot.stackBb,
    pot: 1.5 + spot.players * ante,
    shover: { posted: ante + (k === 1 ? 0.5 : 0) },
    callers,
  };
}

export const solveFirstIn = (spot: FirstInSpot): ShoveSolution => solveShoveGame(firstInGame(spot));

/** Heads-up small blind against big blind: the exactly solvable game. */
/** Forgets cached solutions, so a test can check that solving again gives the same answer. */
export const clearShoveCache = () => cache.clear();

export const solveHeadsUp = (stackBb: number, anteBb = 0): ShoveSolution => solveFirstIn({ stackBb, players: 2, playersBehind: 1, anteBb });

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Writes a range in standard notation ("22+, A2s+, K9s-K6s, 63s:0.4"), merging runs of
 * neighbouring hands that have the same weight. Weights are rounded to two decimals.
 */
export function formatRange(weights: Record<string, number>): string {
  const wOf = (cls: string) => round2(weights[cls] ?? 0);
  const tag = (v: number) => (v >= 1 ? "" : `:${v}`);
  const out: string[] = [];

  let r = 12;
  while (r >= 0) {
    const v = wOf(RANKS[r] + RANKS[r]);
    let end = r;
    while (end > 0 && wOf(RANKS[end - 1] + RANKS[end - 1]) === v) end--;
    if (v > 0) {
      const lo = RANKS[end] + RANKS[end];
      const hi = RANKS[r] + RANKS[r];
      out.push((end === r ? hi : r === 12 ? `${lo}+` : `${hi}-${lo}`) + tag(v));
    }
    r = end - 1;
  }
  for (const suit of ["s", "o"]) {
    for (let hi = 12; hi >= 1; hi--) {
      let lo = hi - 1;
      while (lo >= 0) {
        const name = (l: number) => RANKS[hi] + RANKS[l] + suit;
        const v = wOf(name(lo));
        let end = lo;
        while (end > 0 && wOf(name(end - 1)) === v) end--;
        if (v > 0) out.push((end === lo ? name(lo) : lo === hi - 1 ? `${name(end)}+` : `${name(lo)}-${name(end)}`) + tag(v));
        lo = end - 1;
      }
    }
  }
  return out.join(", ");
}
