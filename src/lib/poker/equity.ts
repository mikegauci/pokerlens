import { Card } from "./cards";
import { evaluate } from "./evaluator";
import { Combo } from "./ranges";

export interface EquityResult {
  /** Win share plus half of ties, 0..1. */
  equity: number;
  win: number;
  tie: number;
  samples: number;
}

/**
 * Monte Carlo equity of hero's two cards against one or more weighted ranges.
 * Each trial samples a holding for every villain (respecting card removal),
 * runs out the board and compares showdown strength.
 */
export function equityVsRanges(
  hero: Card[],
  board: Card[],
  villains: Combo[][],
  iterations: number,
  rng: () => number,
): EquityResult {
  const base = new Uint8Array(52);
  for (const c of hero) base[c] = 1;
  for (const c of board) base[c] = 1;

  const pools = villains.map((combos) => {
    const live = combos.filter((c) => !base[c.a] && !base[c.b] && c.w > 0);
    const cum = new Float64Array(live.length);
    let total = 0;
    for (let i = 0; i < live.length; i++) {
      total += live[i].w;
      cum[i] = total;
    }
    return { live, cum, total };
  });
  if (pools.some((p) => p.live.length === 0)) return { equity: 0, win: 0, tie: 0, samples: 0 };

  const used = new Uint8Array(52);
  const deck = new Int8Array(52);
  const need = 5 - board.length;
  const heroCards = [hero[0], hero[1], 0, 0, 0, 0, 0];
  const villCards = [0, 0, 0, 0, 0, 0, 0];
  const picked: Combo[] = new Array(villains.length);

  let win = 0;
  let tie = 0;
  let samples = 0;

  for (let it = 0; it < iterations; it++) {
    used.set(base);
    let ok = true;
    for (let v = 0; v < pools.length && ok; v++) {
      const p = pools[v];
      let chosen: Combo | null = null;
      for (let attempt = 0; attempt < 24; attempt++) {
        const x = rng() * p.total;
        let lo = 0;
        let hi = p.live.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (p.cum[mid] > x) hi = mid;
          else lo = mid + 1;
        }
        const c = p.live[lo];
        if (!used[c.a] && !used[c.b]) {
          chosen = c;
          break;
        }
      }
      if (!chosen) ok = false;
      else {
        used[chosen.a] = 1;
        used[chosen.b] = 1;
        picked[v] = chosen;
      }
    }
    if (!ok) continue;

    let n = 0;
    for (let c = 0; c < 52; c++) if (!used[c]) deck[n++] = c;
    for (let i = 0; i < board.length; i++) heroCards[2 + i] = board[i];
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(rng() * (n - i));
      const t = deck[i];
      deck[i] = deck[j];
      deck[j] = t;
      heroCards[2 + board.length + i] = deck[i];
    }
    for (let i = 2; i < 7; i++) villCards[i] = heroCards[i];

    const hs = evaluate(heroCards);
    let best = -1;
    let tiedWith = 0;
    for (let v = 0; v < picked.length; v++) {
      villCards[0] = picked[v].a;
      villCards[1] = picked[v].b;
      const vs = evaluate(villCards);
      if (vs > best) best = vs;
      if (vs === hs) tiedWith++;
    }
    samples++;
    if (hs > best) win++;
    else if (hs === best) tie += 1 / (tiedWith + 1);
  }

  if (samples === 0) return { equity: 0, win: 0, tie: 0, samples: 0 };
  return { equity: (win + tie) / samples, win: win / samples, tie: tie / samples, samples };
}
