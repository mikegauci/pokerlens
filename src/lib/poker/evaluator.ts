import { Card, RANKS, rankOf, suitOf } from "./cards";

export const CATEGORY = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  TRIPS: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  QUADS: 7,
  STRAIGHT_FLUSH: 8,
} as const;

export const CATEGORY_NAMES = [
  "high card",
  "a pair",
  "two pair",
  "three of a kind",
  "a straight",
  "a flush",
  "a full house",
  "four of a kind",
  "a straight flush",
];

/** Highest rank of a straight in a 13-bit rank mask, or -1. The wheel returns 3 (five-high). */
export function straightHigh(mask: number): number {
  for (let hi = 12; hi >= 4; hi--) {
    if (((mask >> (hi - 4)) & 0x1f) === 0x1f) return hi;
  }
  if ((mask & 0x100f) === 0x100f) return 3;
  return -1;
}

const pack = (cat: number, k1 = 0, k2 = 0, k3 = 0, k4 = 0, k5 = 0) =>
  (cat << 20) | (k1 << 16) | (k2 << 12) | (k3 << 8) | (k4 << 4) | k5;

/** Top `n` ranks from a mask, high to low, skipping ranks in `skipMask`. */
function topRanks(mask: number, n: number, skipMask = 0): number[] {
  const out: number[] = [];
  const m = mask & ~skipMask;
  for (let r = 12; r >= 0 && out.length < n; r--) {
    if (m & (1 << r)) out.push(r);
  }
  while (out.length < n) out.push(0);
  return out;
}

/**
 * Scores the best five-card hand from 5 to 7 cards. Higher is better; equal scores tie.
 * The category is `score >> 20`.
 */
export function evaluate(cards: Card[]): number {
  const rc = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const sc = [0, 0, 0, 0];
  const sm = [0, 0, 0, 0];
  let mask = 0;
  for (let i = 0; i < cards.length; i++) {
    const r = rankOf(cards[i]);
    const s = suitOf(cards[i]);
    rc[r]++;
    sc[s]++;
    sm[s] |= 1 << r;
    mask |= 1 << r;
  }

  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (sc[s] >= 5) flushSuit = s;

  if (flushSuit >= 0) {
    const sh = straightHigh(sm[flushSuit]);
    if (sh >= 0) return pack(CATEGORY.STRAIGHT_FLUSH, sh);
  }

  let quad = -1;
  const trips: number[] = [];
  const pairs: number[] = [];
  for (let r = 12; r >= 0; r--) {
    if (rc[r] === 4) quad = r;
    else if (rc[r] === 3) trips.push(r);
    else if (rc[r] === 2) pairs.push(r);
  }

  if (quad >= 0) {
    const [k] = topRanks(mask, 1, 1 << quad);
    return pack(CATEGORY.QUADS, quad, k);
  }
  if (trips.length > 0 && (trips.length > 1 || pairs.length > 0)) {
    const pairRank = Math.max(trips[1] ?? -1, pairs[0] ?? -1);
    return pack(CATEGORY.FULL_HOUSE, trips[0], pairRank);
  }
  if (flushSuit >= 0) {
    const k = topRanks(sm[flushSuit], 5);
    return pack(CATEGORY.FLUSH, k[0], k[1], k[2], k[3], k[4]);
  }
  const sh = straightHigh(mask);
  if (sh >= 0) return pack(CATEGORY.STRAIGHT, sh);
  if (trips.length > 0) {
    const k = topRanks(mask, 2, 1 << trips[0]);
    return pack(CATEGORY.TRIPS, trips[0], k[0], k[1]);
  }
  if (pairs.length >= 2) {
    const [k] = topRanks(mask, 1, (1 << pairs[0]) | (1 << pairs[1]));
    return pack(CATEGORY.TWO_PAIR, pairs[0], pairs[1], k);
  }
  if (pairs.length === 1) {
    const k = topRanks(mask, 3, 1 << pairs[0]);
    return pack(CATEGORY.PAIR, pairs[0], k[0], k[1], k[2]);
  }
  const k = topRanks(mask, 5);
  return pack(CATEGORY.HIGH_CARD, k[0], k[1], k[2], k[3], k[4]);
}

export const categoryOf = (score: number) => score >> 20;

export interface Draws {
  flushDraw: boolean;
  /** Number of distinct ranks that complete a straight (2+ is open-ended or a double gutshot). */
  straightOutRanks: number;
}

/** Draws for hole cards on a flop or turn. Returns no draws on other streets. */
export function findDraws(hole: Card[], board: Card[]): Draws {
  const none = { flushDraw: false, straightOutRanks: 0 };
  if (board.length < 3 || board.length > 4) return none;
  const all = [...hole, ...board];
  const sc = [0, 0, 0, 0];
  let mask = 0;
  for (const c of all) {
    sc[suitOf(c)]++;
    mask |= 1 << rankOf(c);
  }
  const flushDraw = hole.some((c) => sc[suitOf(c)] === 4);

  let straightOutRanks = 0;
  if (straightHigh(mask) < 0) {
    let boardMask = 0;
    for (const c of board) boardMask |= 1 << rankOf(c);
    for (let r = 0; r < 13; r++) {
      if (mask & (1 << r)) continue;
      const made = straightHigh(mask | (1 << r));
      // Only count it if the straight is not already on the board plus that card.
      if (made >= 0 && straightHigh(boardMask | (1 << r)) !== made) straightOutRanks++;
    }
  }
  return { flushDraw, straightOutRanks };
}

const rankName = (r: number) =>
  ["Twos", "Threes", "Fours", "Fives", "Sixes", "Sevens", "Eights", "Nines", "Tens", "Jacks", "Queens", "Kings", "Aces"][r];

/** Plain-English description of hero's holding, e.g. "top pair, King kicker + flush draw". */
export function describeHand(hole: Card[], board: Card[]): string {
  if (board.length < 3) return "";
  const score = evaluate([...hole, ...board]);
  const cat = categoryOf(score);
  const boardRanks = board.map(rankOf).sort((a, b) => b - a);
  const distinctBoard = [...new Set(boardRanks)];
  const [h1, h2] = hole.map(rankOf).sort((a, b) => b - a);
  const pocketPair = h1 === h2;
  let label: string;

  const playsBoard = board.length === 5 && evaluate(board) === score;

  if (playsBoard) {
    label = `playing the board (${CATEGORY_NAMES[cat]})`;
  } else if (cat === CATEGORY.PAIR) {
    const pairRank = (score >> 16) & 0xf;
    if (pocketPair) {
      if (h1 > distinctBoard[0]) label = `an overpair (${rankName(h1)})`;
      else if (h1 < distinctBoard[distinctBoard.length - 1]) label = `an underpair (${rankName(h1)})`;
      else label = `a pocket pair below top card (${rankName(h1)})`;
    } else if (pairRank === h1 || pairRank === h2) {
      const kicker = pairRank === h1 ? h2 : h1;
      const idx = distinctBoard.indexOf(pairRank);
      const which = idx === 0 ? "top pair" : idx === 1 ? "second pair" : idx === distinctBoard.length - 1 ? "bottom pair" : "a low pair";
      label = `${which} (${rankName(pairRank)}, ${RANKS[kicker]} kicker)`;
    } else {
      label = `${RANKS[h1]}-high (the pair is on the board)`;
    }
  } else if (cat === CATEGORY.HIGH_CARD) {
    label = `${RANKS[h1]}-high, no pair`;
  } else if (cat === CATEGORY.TRIPS) {
    label = pocketPair ? `a set of ${rankName(h1)}` : `trip ${rankName((score >> 16) & 0xf)}`;
  } else if (cat === CATEGORY.TWO_PAIR) {
    const boardPaired = distinctBoard.length < boardRanks.length;
    const p1 = (score >> 16) & 0xf;
    const p2 = (score >> 12) & 0xf;
    label = `two pair (${rankName(p1)} and ${rankName(p2)}${boardPaired ? ", board is paired" : ""})`;
  } else {
    label = CATEGORY_NAMES[cat];
  }

  const d = findDraws(hole, board);
  const draws: string[] = [];
  if (d.flushDraw && cat < CATEGORY.FLUSH) draws.push("flush draw");
  if (cat < CATEGORY.STRAIGHT) {
    if (d.straightOutRanks >= 2) draws.push("open-ended straight draw");
    else if (d.straightOutRanks === 1) draws.push("gutshot");
  }
  return draws.length ? `${label} + ${draws.join(" + ")}` : label;
}
