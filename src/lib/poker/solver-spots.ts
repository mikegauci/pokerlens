import { parseCards } from "./cards";
import { expandRange, parseRange } from "./ranges";
import type { RiverSpot } from "./solver";

/** A river spot as the player types it: text for the board and ranges, big blinds for chips. */
export interface SpotInput {
  board: string;
  pot: number;
  stack: number;
  /** Bet sizes as percentages of the pot, e.g. "33, 75". */
  sizes: string;
  allowRaise: boolean;
  oop: string;
  ip: string;
}

export interface SpotPreset extends SpotInput {
  id: string;
  title: string;
  story: string;
  /** What to look for in the answer. */
  lesson: string;
}

export const SPOT_PRESETS: SpotPreset[] = [
  {
    id: "polar-vs-bluffcatcher",
    title: "Textbook: nuts or air against a bluff-catcher",
    story: "The in-position player holds either a set of sevens or queen-high. The out-of-position player always holds top pair, which beats the bluffs and loses to the sets. One bet size: the pot.",
    lesson: "The bettor bets every set and bluffs just often enough that top pair gains nothing by calling: one bluff for every two value bets at this size. The caller calls half the time, which is just enough that a bluff gains nothing.",
    board: "Ks 7d 4c 9h 2s",
    pot: 10,
    stack: 10,
    sizes: "100",
    allowRaise: false,
    oop: "AK",
    ip: "77, QJs",
  },
  {
    id: "river-lead",
    title: "Big blind leads the river into the button",
    story: "From the sample hand: the button opens and bets flop and turn on J♠ 8♦ 3♣ 5♥, the big blind calls twice, and the K♦ falls. The ranges are an example of what each player could hold after that action. Edit them to match your own read.",
    lesson: "In the sample hand the big blind led for 71% of the pot. At equilibrium with these ranges it almost never leads: it checks and lets the button decide. Follow the check to see which hands the button bets for value and as bluffs, and how the big blind's one-pair hands mix between calling and folding.",
    board: "Js 8d 3c 5h Kd",
    pot: 22.5,
    stack: 89,
    sizes: "33, 71",
    allowRaise: true,
    oop: "KJ, QJ, JT, J9s, J8s, A8s, K8s, 98s, 87s, T9, Q9s, QTs, KTs, KQ:0.5, TT, 99, 77:0.5, 66:0.5, 88:0.5, 55, 33, 76s, 64s, 97s, A5s, 85s",
    ip: "AA, KK, QQ, JJ, 88, 55, 33, AJ, KJ, QJs, JTs, J9s, J8s, AK, AQ:0.5, KQ, KTs, QTs, T9s, Q9s, A5s, A4s, 76s, 97s, 64s",
  },
];

/** Turns typed input into a spot the solver accepts, or explains what is wrong with it. */
export function toRiverSpot(input: SpotInput): { spot?: RiverSpot; errors: string[] } {
  const errors: string[] = [];
  const board = parseCards(input.board);
  if (board.length !== 5 || new Set(board).size !== 5) errors.push("The board needs five different cards, for example \"Js 8d 3c 5h Kd\".");
  if (!(input.pot > 0)) errors.push("The pot must be greater than zero.");
  if (!(input.stack > 0)) errors.push("The stack must be greater than zero.");

  const sizeTokens = input.sizes.split(/[,\s]+/).filter(Boolean);
  const betSizes = sizeTokens.map((t) => parseFloat(t.replace("%", "")) / 100);
  if (!betSizes.length || betSizes.length > 3 || betSizes.some((s) => !(s >= 0.05 && s <= 5))) {
    errors.push("Give one to three bet sizes between 5 and 500 percent of the pot, for example \"33, 75\".");
  }

  const ranges = ([["Out-of-position", input.oop], ["In-position", input.ip]] as const).map(([who, text]) => {
    const parsed = parseRange(text);
    for (const e of parsed.errors) errors.push(`${who} range: ${e}.`);
    const combos = expandRange(parsed.range, board);
    if (!parsed.errors.length && !combos.length) errors.push(`${who} range has no hands left on this board.`);
    return combos;
  });

  if (errors.length) return { errors };
  return { errors, spot: { board, pot: input.pot, stack: input.stack, betSizes, allowRaise: input.allowRaise, ranges: [ranges[0], ranges[1]] } };
}
