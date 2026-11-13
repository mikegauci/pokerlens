import { mulberry32 } from "./cards";
import type { Decision } from "./analyze";
import { HERO_LOOSE_CALL_TEXT, type HeroStyle, type Strength, makeStyledSession } from "./sample-session";
import { type HandResult, analyzeSessionHand, importSession } from "./session";

/**
 * Integrity lab: two signals from one player's hands, compared with a baseline of synthetic humans.
 *
 * 1. EV lost per decision against this app's engine. Only call-or-fold decisions facing a postflop bet
 *    are measured, because that is where the engine computes the EV of both options (equity against
 *    its assumed range versus the price). A human loses a little on many decisions and a lot on a few;
 *    a player who agrees with the engine almost every time is unusual, and real-time assistance would
 *    look like that if the assistance tool and this engine agree.
 * 2. Postflop bet sizes as a share of the pot. People vary their sizes; a simple bot often does not.
 *
 * Everything here is a prototype on synthetic players from the seeded simulator in `sample-session.ts`.
 * The engine is not a solver for these spots, so "agrees with the engine" is not "plays GTO".
 */

/** Buckets for EV lost on one decision, in big blinds. */
export const LOSS_BUCKETS = [
  { label: "0", lo: 0, hi: 0 },
  { label: "under 1", lo: 0, hi: 1 },
  { label: "1–3", lo: 1, hi: 3 },
  { label: "3–10", lo: 3, hi: 10 },
  { label: "10+", lo: 10, hi: Infinity },
] as const;

/** Buckets for a bet size as a share of the pot. */
export const SIZE_BUCKETS = [
  { label: "<30%", lo: 0, hi: 0.3 },
  { label: "30–40%", lo: 0.3, hi: 0.4 },
  { label: "40–50%", lo: 0.4, hi: 0.5 },
  { label: "50–60%", lo: 0.5, hi: 0.6 },
  { label: "60–70%", lo: 0.6, hi: 0.7 },
  { label: "70–80%", lo: 0.7, hi: 0.8 },
  { label: "80–100%", lo: 0.8, hi: 1 },
  { label: "100%+", lo: 1, hi: Infinity },
] as const;

/** Below these counts a signal is reported as not enough data instead of a flag. */
export const MIN_MEASURED = 30;
export const MIN_BETS = 20;

export interface IntegrityProfile {
  hands: number;
  /** EV lost on each measured decision, in big blinds. */
  losses: number[];
  /** Share of measured decisions in each `LOSS_BUCKETS` bucket. */
  lossShares: number[];
  /** Share of measured decisions where the player took the action with the higher EV. */
  agreement: number;
  meanLossBb: number;
  /** Hero's postflop bet and raise sizes as a share of the pot. */
  sizes: number[];
  /** Share of bets in each `SIZE_BUCKETS` bucket. */
  sizeShares: number[];
  /** Share of bets in the single most used size bucket. */
  modalSizeShare: number;
}

/** Index of the bucket a value falls in. A bucket with lo === hi holds exactly that value. */
function bucketOf(x: number, buckets: readonly { lo: number; hi: number }[]): number {
  const exact = buckets.findIndex((b) => b.lo === b.hi && x === b.lo);
  if (exact >= 0) return exact;
  const i = buckets.findIndex((b) => b.lo !== b.hi && x >= b.lo && x < b.hi);
  return i >= 0 ? i : buckets.length - 1;
}

const shares = (values: number[], buckets: readonly { lo: number; hi: number }[]) => {
  const counts = buckets.map(() => 0);
  for (const v of values) counts[bucketOf(v, buckets)]++;
  return counts.map((c) => (values.length ? c / values.length : 0));
};

/** A decision where the engine knows the EV of both options: calling or folding to a postflop bet. */
export function isMeasured(d: Decision): boolean {
  return d.street !== "preflop" && d.toCall > 0 && (d.action.type === "call" || d.action.type === "fold") && d.evCall !== undefined;
}

/** EV lost against the better of call and fold, in big blinds. Zero when the player chose the better one. */
export function lossBb(d: Decision, bb: number): number {
  const ev = d.evCall! / bb;
  return Math.max(0, d.action.type === "fold" ? ev : -ev);
}

/** Builds the two signals from analysed hands. */
export function profileOf(results: HandResult[]): IntegrityProfile {
  const losses: number[] = [];
  const sizes: number[] = [];
  for (const r of results) {
    const a = r.analysis;
    if (!a) continue;
    for (const d of a.decisions) {
      if (isMeasured(d)) losses.push(lossBb(d, a.hand.bb));
      if (d.street !== "preflop" && (d.action.type === "bet" || d.action.type === "raise") && d.betPct !== undefined) sizes.push(d.betPct);
    }
  }
  const sizeShares = shares(sizes, SIZE_BUCKETS);
  return {
    hands: results.length,
    losses,
    lossShares: shares(losses, LOSS_BUCKETS),
    agreement: losses.length ? losses.filter((l) => l === 0).length / losses.length : 0,
    meanLossBb: losses.length ? losses.reduce((x, y) => x + y, 0) / losses.length : 0,
    sizes,
    sizeShares,
    modalSizeShare: sizes.length ? Math.max(...sizeShares) : 0,
  };
}

// ---------------------------------------------------------------- synthetic players

export type PlayerKind = "human" | "assisted" | "bot";

export interface SyntheticPlayer {
  id: string;
  kind: PlayerKind;
  label: string;
  description: string;
  seed: number;
  style: HeroStyle;
}

/** People pick sizes by feel: a base size by hand strength, scaled up or down at random. */
const humanSizing = (st: Strength, rng: () => number) => (st === "strong" ? 0.7 : 0.5) * (0.6 + 0.8 * rng());
/** An assistance tool offers a few solver-style sizes: small, medium or overbet. */
const assistedSizing = (st: Strength, rng: () => number) =>
  st === "strong" ? (rng() < 0.5 ? 0.75 : 1.25) : st === "medium" ? 0.33 : rng() < 0.5 ? 0.33 : 0.75;
/** A simple bot bets the same share of the pot every time. */
const botSizing = () => 0.5;

/** A human with leaks of a random size, drawn from a seeded generator so the baseline never changes. */
function humanStyle(seed: number): HeroStyle {
  const rng = mulberry32(seed);
  const between = (lo: number, hi: number) => lo + (hi - lo) * rng();
  return {
    looseCall: rng() < 0.5 ? HERO_LOOSE_CALL_TEXT : "",
    callThreeBet: rng() < 0.5 ? "JJ-TT" : null,
    riverFoldMedium: between(0.2, 0.9),
    riverCallAir: between(0.05, 0.4),
    callAir: between(0.1, 0.4),
    betSize: humanSizing,
  };
}

export const BASELINE_HANDS = 1500;
/** Seeds of the synthetic humans that make up the baseline. */
export const BASELINE_SEEDS = [101, 202, 303, 404, 505, 606, 707, 808];

export const BASELINE: SyntheticPlayer[] = BASELINE_SEEDS.map((seed, i) => ({
  id: `human-${i + 1}`,
  kind: "human",
  label: `Human ${i + 1}`,
  description: "Synthetic human with leaks of random size.",
  seed,
  style: humanStyle(seed),
}));

/** The players the lab can inspect. None of them is part of the baseline. */
export const PLAYERS: SyntheticPlayer[] = [
  {
    id: "human",
    kind: "human",
    label: "A regular",
    description: "Plays the charts with a few leaks of random size and picks bet sizes by feel, like the baseline players. Not one of them.",
    seed: 9001,
    style: humanStyle(9001),
  },
  {
    id: "assisted",
    kind: "assisted",
    label: "Assisted player",
    description: "Asks this app's engine before every call or fold facing a bet and takes the higher-EV option, and bets a few solver-style sizes. Stands in for real-time assistance.",
    seed: 9002,
    style: { looseCall: "", callThreeBet: null, riverFoldMedium: 0, riverCallAir: 0, callAir: 0, betSize: assistedSizing, engine: true },
  },
  {
    id: "bot",
    kind: "bot",
    label: "Simple bot",
    description: "Plays the charts with fixed rules: calls with any pair or draw, folds nothing hands, and bets half the pot every time.",
    seed: 9003,
    style: { looseCall: "", callThreeBet: null, riverFoldMedium: 0, riverCallAir: 0, callAir: 0, betSize: botSizing },
  },
];

/**
 * Simulates and analyses one synthetic player's hands. Both signals come from postflop decisions, so
 * only hands where the player acts after the flop are analysed; the rest are counted but skipped.
 */
export function playerProfile(p: SyntheticPlayer, hands = BASELINE_HANDS): IntegrityProfile {
  const imported = importSession(makeStyledSession(p.style, p.seed, hands));
  const postflop = imported.hands.filter(({ hand }) => hand.actions.some((a) => a.player === hand.hero && a.street !== "preflop"));
  return { ...profileOf(postflop.map((h) => analyzeSessionHand(h))), hands: imported.hands.length };
}

// ---------------------------------------------------------------- comparison

export interface Range {
  min: number;
  max: number;
}

export interface Baseline {
  players: number;
  /** Losses of every baseline decision pooled, for the distribution chart. */
  lossShares: number[];
  sizeShares: number[];
  agreement: Range;
  meanLossBb: Range;
  modalSizeShare: Range;
}

const range = (xs: number[]): Range => ({ min: Math.min(...xs), max: Math.max(...xs) });

export function baselineOf(profiles: IntegrityProfile[]): Baseline {
  const losses = profiles.flatMap((p) => p.losses);
  const sizes = profiles.flatMap((p) => p.sizes);
  return {
    players: profiles.length,
    lossShares: shares(losses, LOSS_BUCKETS),
    sizeShares: shares(sizes, SIZE_BUCKETS),
    agreement: range(profiles.map((p) => p.agreement)),
    meanLossBb: range(profiles.map((p) => p.meanLossBb)),
    modalSizeShare: range(profiles.map((p) => p.modalSizeShare)),
  };
}

export type SignalState = "flag" | "normal" | "too-few";

export interface Signals {
  /** Agrees with the engine more often, and loses less per decision, than every baseline human. */
  closeToEngine: SignalState;
  /** Uses one size bucket for a larger share of bets than every baseline human. */
  uniformSizing: SignalState;
}

/** Flags a player only when it falls outside the whole baseline range, and only with enough data. */
export function signalsOf(p: IntegrityProfile, b: Baseline): Signals {
  return {
    closeToEngine: p.losses.length < MIN_MEASURED ? "too-few" : p.agreement > b.agreement.max && p.meanLossBb < b.meanLossBb.min ? "flag" : "normal",
    uniformSizing: p.sizes.length < MIN_BETS ? "too-few" : p.modalSizeShare > b.modalSizeShare.max ? "flag" : "normal",
  };
}

export interface LabResult {
  hands: number;
  baselineProfiles: IntegrityProfile[];
  baseline: Baseline;
  /** In the order of `PLAYERS`. */
  players: { id: string; profile: IntegrityProfile; signals: Signals }[];
}

/**
 * Runs the whole lab: the baseline humans, then each player compared with them. Yields progress for
 * the generating script. Pure and deterministic: the same seeds always give the same result.
 * It takes about 15 seconds, so the result is checked in as `integrity-data.ts` rather than run in the page.
 */
export function* labSteps(hands = BASELINE_HANDS): Generator<{ done: number; total: number }, LabResult> {
  const total = BASELINE.length + PLAYERS.length;
  const baseProfiles: IntegrityProfile[] = [];
  for (const p of BASELINE) {
    baseProfiles.push(round(playerProfile(p, hands)));
    yield { done: baseProfiles.length, total };
  }
  const baseline = round(baselineOf(baseProfiles));
  const players: LabResult["players"] = [];
  for (const player of PLAYERS) {
    const profile = round(playerProfile(player, hands));
    players.push({ id: player.id, profile, signals: signalsOf(profile, baseline) });
    yield { done: BASELINE.length + players.length, total };
  }
  return { hands, baselineProfiles: baseProfiles, baseline, players };
}

/** Rounds every number to four decimals, so the checked-in data is compact and compares exactly. */
export function round<T>(x: T): T {
  return JSON.parse(JSON.stringify(x, (_, v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : v)));
}

export function runLab(hands = BASELINE_HANDS): LabResult {
  const steps = labSteps(hands);
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
  }
}
