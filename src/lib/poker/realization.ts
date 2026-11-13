import { Card, rankOf, suitOf } from "./cards";
import type { Street } from "./parser";

/**
 * Equity realisation: the share of its raw equity a hand actually wins when there is betting still to come.
 * A hand out of position wins less than its raw equity because it is bet off the best hand or cannot get value;
 * suited and connected hands realise more because they make strong hands, offsuit gappers less.
 *
 * The factors below are rules of thumb in the range solver studies report (about 0.7 to 1.0 out of position,
 * about 1.0 in position). They were not solved in this repo, so a verdict that uses them is approximate.
 * When no more betting can follow (river, or someone is all-in) the factor is 1: raw equity is what you win.
 */
export interface Realization {
  factor: number;
  /** One plain sentence on where the factor comes from. */
  note: string;
}

const NONE: Realization = { factor: 1, note: "No more betting can follow, so the hand realises all of its equity." };

export function realization({ street, inPosition, heroCards, exact }: { street: Street; inPosition: boolean | null; heroCards: Card[]; exact: boolean }): Realization {
  if (exact || street === "river") return NONE;
  const where = inPosition ? "in position" : "out of position";
  if (street === "preflop") {
    const [a, b] = heroCards;
    const suited = suitOf(a) === suitOf(b);
    const gap = Math.abs(rankOf(a) - rankOf(b));
    const pair = gap === 0;
    let factor = inPosition ? 1 : 0.8;
    let shape = "";
    if (pair) shape = "a pair";
    else if (suited && gap <= 2) {
      factor += 0.05;
      shape = "a suited, connected hand";
    } else if (!suited && gap >= 3) {
      factor -= 0.1;
      shape = "an offsuit hand with a gap";
    }
    factor = Math.min(1, Math.round(factor * 100) / 100);
    return { factor, note: `Rule of thumb for ${shape ? `${shape} played ` : "a hand played "}${where} after the flop.` };
  }
  if (inPosition) return { factor: 1, note: "In position you act last on every street, so the hand is assumed to realise its raw equity." };
  const factor = street === "flop" ? 0.85 : 0.92;
  return { factor, note: `Rule of thumb out of position with ${street === "flop" ? "two cards" : "one card"} to come: you act first, so you are bet off some of your equity.` };
}
