// Cards are integers 0..51: rank * 4 + suit. Rank 0 = deuce, 12 = ace.
export type Card = number;

export const RANKS = "23456789TJQKA";
export const SUITS = "cdhs";

export const rankOf = (c: Card) => c >> 2;
export const suitOf = (c: Card) => c & 3;

export function parseCard(s: string): Card {
  const r = RANKS.indexOf(s[0]?.toUpperCase() ?? "");
  const su = SUITS.indexOf(s[1]?.toLowerCase() ?? "");
  if (r < 0 || su < 0 || s.length !== 2) throw new Error(`Invalid card: "${s}"`);
  return r * 4 + su;
}

/** Parses "Ah Kd", "[Ah Kd]" or "AhKd". */
export function parseCards(s: string): Card[] {
  const m = s.match(/[2-9TJQKAtjqka][cdhsCDHS]/g);
  return m ? m.map(parseCard) : [];
}

export const cardStr = (c: Card) => RANKS[rankOf(c)] + SUITS[suitOf(c)];
export const cardsStr = (cs: Card[]) => cs.map(cardStr).join(" ");

/** "AKs", "AKo" or "TT" for two hole cards. */
export function handClass(a: Card, b: Card): string {
  let hi = rankOf(a);
  let lo = rankOf(b);
  if (lo > hi) [hi, lo] = [lo, hi];
  if (hi === lo) return RANKS[hi] + RANKS[lo];
  return RANKS[hi] + RANKS[lo] + (suitOf(a) === suitOf(b) ? "s" : "o");
}

/** Small deterministic PRNG so the same hand always produces the same numbers. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
