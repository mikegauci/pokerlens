import { Card, hashString, mulberry32 } from "./cards";
import { ChartPair, chart, facingOpenCharts, facingThreeBetCharts, firstInCharts } from "./charts";
import { ALL_CLASSES, GRID, combosOfClass } from "./ranges";

/**
 * Preflop range trainer: deals "position, action so far, hand" spots and checks the answer
 * against the simplified charts in `charts.ts`. Those charts are binary 6-max 100bb
 * approximations, not solver output, so a "wrong" answer on a borderline hand is close.
 *
 * Everything here is pure. The deal is a function of the stored progress (seed and turn),
 * so the same progress always produces the same spot.
 */

export const POSITIONS = ["UTG", "HJ", "CO", "BTN", "SB", "BB"] as const;
export type Position = (typeof POSITIONS)[number];

export type TrainerAction = "raise" | "call" | "fold";
export const TRAINER_ACTIONS: TrainerAction[] = ["raise", "call", "fold"];

/** `first-in`: folded to hero. `vs-open`: hero faces one open-raise. `vs-3bet`: hero opened and was 3-bet. */
export type SpotKind = "first-in" | "vs-open" | "vs-3bet";

export interface Spot {
  kind: SpotKind;
  hero: Position;
  /** The opener for `vs-open`, the 3-bettor for `vs-3bet`. */
  villain?: Position;
}

const spotsOfKind = (kind: SpotKind): Spot[] => {
  if (kind === "first-in") return POSITIONS.slice(0, 5).map((hero) => ({ kind, hero }));
  const out: Spot[] = [];
  for (let early = 0; early < 5; early++) {
    for (let late = early + 1; late < 6; late++) {
      // The earlier seat always opens. Facing an open, hero is the later seat; facing a 3-bet, hero is the opener.
      out.push(kind === "vs-open" ? { kind, hero: POSITIONS[late], villain: POSITIONS[early] } : { kind, hero: POSITIONS[early], villain: POSITIONS[late] });
    }
  }
  return out;
};

/** How often each kind of spot is dealt. Facing a 3-bet uses one chart for every seat, so it gets the smallest share. */
const KIND_WEIGHTS: [SpotKind, number][] = [
  ["first-in", 0.4],
  ["vs-open", 0.4],
  ["vs-3bet", 0.2],
];

const SPOTS_BY_KIND: Record<SpotKind, Spot[]> = {
  "first-in": spotsOfKind("first-in"),
  "vs-open": spotsOfKind("vs-open"),
  "vs-3bet": spotsOfKind("vs-3bet"),
};
export const ALL_SPOTS: Spot[] = KIND_WEIGHTS.flatMap(([kind]) => SPOTS_BY_KIND[kind]);

export const spotId = (s: Spot): string => (s.villain ? `${s.kind}:${s.hero}:${s.villain}` : `${s.kind}:${s.hero}`);
const SPOT_BY_ID = new Map(ALL_SPOTS.map((s) => [spotId(s), s]));

/** The raising and calling chart for a spot. Same mapping the hand review uses. */
export function spotCharts(s: Spot): ChartPair {
  if (s.kind === "first-in") return firstInCharts(s.hero);
  if (s.kind === "vs-open") return facingOpenCharts(s.hero, s.villain!);
  return facingThreeBetCharts();
}

const inChart = (text: string, hand: string) => (text ? (chart(text).get(hand) ?? 0) > 0 : false);

/** What the chart does with this hand. A hand in both charts raises, as in the hand review. */
export function correctAction(s: Spot, hand: string): TrainerAction {
  const { raiseText, callText } = spotCharts(s);
  return inChart(raiseText, hand) ? "raise" : inChart(callText, hand) ? "call" : "fold";
}

const COMBOS = (hand: string) => (hand.length === 2 ? 6 : hand[2] === "s" ? 4 : 12);

export interface SpotRange {
  actions: Record<string, TrainerAction>;
  /** Grid weights (0 or 1) for `RangeGrid`. */
  raise: Record<string, number>;
  call: Record<string, number>;
  /** Share of all 1326 starting combos. */
  raisePct: number;
  callPct: number;
  /** Steps on the 13x13 grid to the nearest hand the chart plays differently. 1 means on the edge. */
  edge: Record<string, number>;
}

const rangeCache = new Map<string, SpotRange>();
export function spotRange(s: Spot): SpotRange {
  const id = spotId(s);
  const hit = rangeCache.get(id);
  if (hit) return hit;
  const actions: Record<string, TrainerAction> = {};
  const raise: Record<string, number> = {};
  const call: Record<string, number> = {};
  let raiseCombos = 0;
  let callCombos = 0;
  for (const hand of ALL_CLASSES) {
    const a = correctAction(s, hand);
    actions[hand] = a;
    raise[hand] = a === "raise" ? 1 : 0;
    call[hand] = a === "call" ? 1 : 0;
    if (a === "raise") raiseCombos += COMBOS(hand);
    if (a === "call") callCombos += COMBOS(hand);
  }
  const edge: Record<string, number> = {};
  for (let i = 0; i < 13; i++) {
    for (let j = 0; j < 13; j++) {
      let best = 13;
      for (let y = 0; y < 13; y++) {
        for (let x = 0; x < 13; x++) {
          if (actions[GRID[y][x]] !== actions[GRID[i][j]]) best = Math.min(best, Math.max(Math.abs(y - i), Math.abs(x - j)));
        }
      }
      edge[GRID[i][j]] = best;
    }
  }
  const out = { actions, raise, call, raisePct: raiseCombos / 1326, callPct: callCombos / 1326, edge };
  rangeCache.set(id, out);
  return out;
}

/** Deal weight by distance from the edge of the range: obvious folds and premium hands teach little. */
export function edgeWeight(distance: number): number {
  return distance <= 1 ? 8 : distance === 2 ? 4 : distance === 3 ? 1.5 : 0.4;
}

// ---------------------------------------------------------------------------------------------
// Progress and spaced repetition
// ---------------------------------------------------------------------------------------------

/**
 * Leitner boxes measured in answers, not clock time, so scheduling is deterministic.
 * A miss goes to box 0 and returns after 3 answers. Each correct answer moves an item up one box.
 */
export const REVIEW_INTERVALS = [3, 10, 25, 60];
/** A hand answered correctly the first time starts here, so it returns later than a missed one. */
const FIRST_CORRECT_BOX = 2;
/** Items at this box are learned and are no longer scheduled. */
export const RETIRED_BOX = REVIEW_INTERVALS.length;

export interface ReviewItem {
  box: number;
  /** The turn on or after which this item is dealt again. */
  due: number;
}

export interface PositionRecord {
  seen: number;
  correct: number;
}

export interface TrainerProgress {
  version: 1;
  seed: number;
  /** Number of answers given so far. */
  turn: number;
  items: Record<string, ReviewItem>;
  positions: Record<Position, PositionRecord>;
}

export function newProgress(seed: number): TrainerProgress {
  const positions = Object.fromEntries(POSITIONS.map((p) => [p, { seen: 0, correct: 0 }])) as Record<Position, PositionRecord>;
  return { version: 1, seed: seed >>> 0, turn: 0, items: {}, positions };
}

const itemKey = (s: Spot, hand: string) => `${spotId(s)}|${hand}`;
const parseItemKey = (key: string): { spot: Spot; hand: string } | null => {
  const [id, hand] = key.split("|");
  const spot = SPOT_BY_ID.get(id);
  return spot && ALL_CLASSES.includes(hand) ? { spot, hand } : null;
};

const count = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0;

/** Reads stored progress. Anything malformed is dropped, so bad storage can never break the drill. */
export function parseProgress(json: string | null | undefined): TrainerProgress | null {
  if (!json) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== 1 || !count(r.seed) || !count(r.turn)) return null;
  const out = newProgress(r.seed);
  out.turn = r.turn;
  const items = r.items && typeof r.items === "object" ? (r.items as Record<string, unknown>) : {};
  for (const [key, v] of Object.entries(items)) {
    const item = v as Partial<ReviewItem> | null;
    if (item && count(item.box) && count(item.due) && parseItemKey(key)) out.items[key] = { box: Math.min(item.box, RETIRED_BOX), due: item.due };
  }
  const positions = r.positions && typeof r.positions === "object" ? (r.positions as Record<string, unknown>) : {};
  for (const p of POSITIONS) {
    const rec = positions[p] as Partial<PositionRecord> | null | undefined;
    if (rec && count(rec.seen) && count(rec.correct) && rec.correct <= rec.seen) out.positions[p] = { seen: rec.seen, correct: rec.correct };
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Dealing and answering
// ---------------------------------------------------------------------------------------------

export interface Deal {
  spot: Spot;
  /** Hand class, e.g. "A5s". */
  hand: string;
  /** Two concrete cards of that class, for display. */
  cards: [Card, Card];
  /** True when this spot was scheduled by spaced repetition rather than dealt fresh. */
  review: boolean;
}

function pickWeighted<T>(entries: [T, number][], rng: () => number): T {
  let x = rng() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [value, w] of entries) {
    x -= w;
    if (x < 0) return value;
  }
  return entries[entries.length - 1][0];
}

/** Hands that can reach a spot. Facing a 3-bet, hero only holds hands the chart opens from that seat. */
export function dealableHands(s: Spot): string[] {
  if (s.kind !== "vs-3bet") return ALL_CLASSES;
  const open = firstInCharts(s.hero).raiseText;
  return ALL_CLASSES.filter((h) => inChart(open, h));
}

/** Review items whose turn has come, most overdue first. */
export function dueItems(p: TrainerProgress): string[] {
  return Object.keys(p.items)
    .filter((k) => p.items[k].box < RETIRED_BOX && p.items[k].due <= p.turn)
    .sort((a, b) => p.items[a].due - p.items[b].due || (a < b ? -1 : 1));
}

/** The spot for the current turn. Pure: the same progress always deals the same spot. */
export function dealSpot(p: TrainerProgress): Deal {
  const rng = mulberry32(hashString(`${p.seed}:${p.turn}`));
  const due = dueItems(p)[0];
  const scheduled = due ? parseItemKey(due) : null;
  let spot: Spot;
  let hand: string;
  if (scheduled) {
    ({ spot, hand } = scheduled);
  } else {
    const kind = pickWeighted(KIND_WEIGHTS, rng);
    const spots = SPOTS_BY_KIND[kind];
    spot = spots[Math.floor(rng() * spots.length)];
    const { edge } = spotRange(spot);
    // Hands already in the review queue come back on their own schedule, not as fresh deals.
    const hands = dealableHands(spot);
    const fresh = hands.filter((h) => !p.items[itemKey(spot, h)]);
    hand = pickWeighted((fresh.length ? fresh : hands).map((h) => [h, edgeWeight(edge[h])]), rng);
  }
  const combos = combosOfClass(hand);
  const [a, b] = combos[Math.floor(rng() * combos.length)];
  return { spot, hand, cards: rng() < 0.5 ? [a, b] : [b, a], review: Boolean(scheduled) };
}

export interface AnswerResult {
  correct: boolean;
  expected: TrainerAction;
  /** True when the hand sits on the edge of the chart, where the simplification matters most. */
  borderline: boolean;
  progress: TrainerProgress;
}

/** Scores an answer and returns the updated progress. Does not mutate its input. */
export function answerSpot(p: TrainerProgress, deal: Deal, answer: TrainerAction): AnswerResult {
  const expected = correctAction(deal.spot, deal.hand);
  const correct = answer === expected;
  const key = itemKey(deal.spot, deal.hand);
  const prev = p.items[key];
  const box = correct ? Math.min(RETIRED_BOX, prev ? prev.box + 1 : FIRST_CORRECT_BOX) : 0;
  const turn = p.turn + 1;
  const due = turn + (REVIEW_INTERVALS[box] ?? 0);
  const pos = p.positions[deal.spot.hero];
  return {
    correct,
    expected,
    borderline: spotRange(deal.spot).edge[deal.hand] <= 1,
    progress: {
      ...p,
      turn,
      items: { ...p.items, [key]: { box, due } },
      positions: { ...p.positions, [deal.spot.hero]: { seen: pos.seen + 1, correct: pos.correct + (correct ? 1 : 0) } },
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------------------------------

const POSITION_NAMES: Record<Position, string> = {
  UTG: "under the gun",
  HJ: "in the hijack",
  CO: "in the cutoff",
  BTN: "on the button",
  SB: "in the small blind",
  BB: "in the big blind",
};

/** The action so far, in words. */
export function describeSpot(s: Spot): string {
  if (s.kind === "first-in") return s.hero === "UTG" ? "You are first to act." : "Everyone before you folds.";
  if (s.kind === "vs-open") return `${s.villain} opens with a raise and it is folded to you.`;
  return `You open with a raise and ${s.villain} 3-bets. Everyone else folds.`;
}

/** What "raise" means in this spot. */
export function raiseName(s: Spot): string {
  return s.kind === "first-in" ? "open-raise" : s.kind === "vs-open" ? "3-bet" : "4-bet";
}

export function spotTitle(s: Spot): string {
  if (s.kind === "first-in") return `${s.hero} first in`;
  if (s.kind === "vs-open") return `${s.hero} facing a ${s.villain} open`;
  return `${s.hero} opened, facing a ${s.villain} 3-bet`;
}

const isPair = (h: string) => h.length === 2;
/** Big pairs and big aces re-raise for value. Everything else in a re-raising chart is there as a bluff. */
const isValueReraise = (h: string) => (isPair(h) && "AKQJT".includes(h[0])) || h.startsWith("AK") || h.startsWith("AQ");

/** One plain sentence on why the chart plays this hand this way. */
export function explain(s: Spot, hand: string): string {
  const action = correctAction(s, hand);
  const where = POSITION_NAMES[s.hero];
  if (s.kind === "first-in") {
    const behind = 5 - POSITIONS.indexOf(s.hero);
    const left = `${behind} player${behind > 1 ? "s" : ""} still to act`;
    const pct = Math.round(spotRange(s).raisePct * 100);
    if (action === "raise") return `With ${left}, the chart opens about ${pct}% of hands ${where}, and ${hand} is strong enough to be one of them.`;
    return `With ${left}, the chart opens only about ${pct}% of hands ${where}, and ${hand} is too weak to be one of them; it never limps, so the choice is raise or fold.`;
  }
  if (s.kind === "vs-open") {
    const tight = ["UTG", "HJ"].includes(s.villain!);
    const range = `${s.villain}'s ${tight ? "tight early-position" : "wider late-position"} opening range`;
    if (action === "raise") {
      if (isValueReraise(hand)) return `${hand} is ahead of ${range} and of the hands that continue against a 3-bet, so it re-raises for value.`;
      if (hand[0] === "A") return `${hand} 3-bets as a bluff: the ace makes it less likely the opener holds AA or AK, and a suited ace still plays well when called.`;
      return `${hand} is one of the chart's 3-bet bluffs: it is suited and connected enough to play well when called, and it balances the big pairs that 3-bet for value.`;
    }
    if (action === "call") {
      if (s.hero === "BB") return `You already have a big blind in and you close the action, so the price is good enough to call ${hand} against ${range}.`;
      return `${hand} plays well enough against ${range} to continue, but is not strong enough to 3-bet for value, so it calls.`;
    }
    if (s.hero === "BB") return `Even at a discount in the big blind, ${hand} is too weak against ${range} and would too often make a second-best hand.`;
    return `${hand} is outside both the calling and 3-betting charts: against ${range} it is too often dominated, and players behind can still re-raise.`;
  }
  if (action === "raise") {
    if (hand === "A5s") return "A5s is the chart's 4-bet bluff: the ace makes AA and AK less likely, and it can still make the nut flush or a wheel when called.";
    return `${hand} is strong enough to 4-bet for value and play for stacks against a 3-betting range.`;
  }
  if (action === "call") return `${hand} is strong enough to see a flop against a 3-bet, but a 4-bet would only get called or re-raised by better hands.`;
  return `A 3-betting range is mostly big pairs and big aces, so ${hand} is too often dominated to continue, so it folds.`;
}
