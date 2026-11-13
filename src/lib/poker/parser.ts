import { Card, parseCards } from "./cards";

export type Street = "preflop" | "flop" | "turn" | "river";
export type ActionType = "post" | "fold" | "check" | "call" | "bet" | "raise";

export interface Action {
  street: Street;
  player: string;
  type: ActionType;
  /** Chips added by this action (0 for fold and check). */
  amount: number;
  /** For raises: total committed on this street after the raise. */
  to?: number;
  allIn: boolean;
  /** For posts: which forced bet. */
  post?: "sb" | "bb" | "ante";
}

export interface Player {
  seat: number;
  name: string;
  stack: number;
  position: string;
  isHero: boolean;
}

export interface ParsedHand {
  id: string;
  site: string;
  game: string;
  isTournament: boolean;
  currency: string;
  sb: number;
  bb: number;
  table: string;
  buttonSeat: number;
  players: Player[];
  hero: string;
  heroCards: Card[];
  board: Card[];
  actions: Action[];
  shown: Record<string, Card[]>;
  /** Player to amount collected. */
  collected: Record<string, number>;
  /** Uncalled bets returned, in order, used when replaying the pot. */
  returned: { player: string; amount: number; afterAction: number }[];
}

export class HandParseError extends Error {}

const num = (s: string) => parseFloat(s.replace(/[^0-9.]/g, ""));

const POSITION_NAMES: Record<number, string[]> = {
  0: [],
  1: ["CO"],
  2: ["HJ", "CO"],
  3: ["UTG", "HJ", "CO"],
  4: ["UTG", "MP", "HJ", "CO"],
  5: ["UTG", "UTG+1", "MP", "HJ", "CO"],
  6: ["UTG", "UTG+1", "MP", "LJ", "HJ", "CO"],
  7: ["UTG", "UTG+1", "UTG+2", "MP", "LJ", "HJ", "CO"],
};

/** Assigns position names to seats, in seat order, given the button seat. */
export function assignPositions(seats: number[], buttonSeat: number): Record<number, string> {
  const sorted = [...seats].sort((a, b) => a - b);
  let btnIdx = sorted.indexOf(buttonSeat);
  if (btnIdx < 0) {
    // Dead button: use the nearest seat before it.
    const before = sorted.filter((s) => s < buttonSeat);
    btnIdx = before.length ? sorted.indexOf(before[before.length - 1]) : sorted.length - 1;
  }
  const n = sorted.length;
  const fromButton = Array.from({ length: n }, (_, i) => sorted[(btnIdx + i) % n]);
  const out: Record<number, string> = {};
  if (n === 2) {
    out[fromButton[0]] = "BTN/SB";
    out[fromButton[1]] = "BB";
    return out;
  }
  out[fromButton[0]] = "BTN";
  out[fromButton[1]] = "SB";
  out[fromButton[2]] = "BB";
  const names = POSITION_NAMES[Math.min(n - 3, 7)] ?? [];
  for (let i = 3; i < n; i++) out[fromButton[i]] = names[i - 3] ?? "MP";
  return out;
}

/** Order in which positions act after the flop. */
export const POSTFLOP_ORDER = ["SB", "BB", "UTG", "UTG+1", "UTG+2", "MP", "LJ", "HJ", "CO", "BTN", "BTN/SB"];

/**
 * Parses a PokerStars-format No-Limit Hold'em hand history (cash or tournament).
 * Throws HandParseError with a readable message when the text cannot be used.
 */
export function parseHand(text: string): ParsedHand {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 5) throw new HandParseError("That doesn't look like a complete hand history.");

  const header = lines.find((l) => /Hand #/i.test(l));
  if (!header) throw new HandParseError('No hand header found. Expected a line like "PokerStars Hand #123: Hold\'em No Limit ...".');
  if (!/Hold'?em/i.test(header)) throw new HandParseError("Only Texas Hold'em hands are supported right now.");
  if (!/No Limit/i.test(header)) throw new HandParseError("Only No-Limit hands are supported right now.");

  const id = header.match(/Hand #(\d+)/i)?.[1] ?? "unknown";
  const site = header.match(/^(\w+)/)?.[1] ?? "Unknown";
  const isTournament = /Tournament/i.test(header);
  const stakes = header.match(/\(([^)]*?)([\d.,]+)\/[^\d)]*([\d.,]+)[^)]*\)/);
  if (!stakes) throw new HandParseError("Could not read the blinds from the header.");
  const sb = num(stakes[2]);
  const bb = num(stakes[3]);
  const currency = isTournament ? "" : (header.match(/[$€£]/)?.[0] ?? "");

  const tableLine = lines.find((l) => /^Table /i.test(l)) ?? "";
  const table = tableLine.match(/Table '([^']+)'/)?.[1] ?? "";
  const buttonSeat = parseInt(tableLine.match(/Seat #(\d+) is the button/i)?.[1] ?? "1", 10);

  const summaryIdx = lines.findIndex((l) => /^\*\*\* SUMMARY/i.test(l));
  const body = summaryIdx >= 0 ? lines.slice(0, summaryIdx) : lines;

  const seated: { seat: number; name: string; stack: number }[] = [];
  for (const l of body) {
    if (/^\*\*\*/.test(l)) break;
    const m = l.match(/^Seat (\d+): (.+?) \(([^)]*?[\d.,]+)[^)]*in chips\)(.*)$/i);
    if (m && !/sitting out/i.test(m[4])) seated.push({ seat: parseInt(m[1], 10), name: m[2], stack: num(m[3]) });
  }
  if (seated.length < 2) throw new HandParseError("Could not find at least two seated players.");

  const dealt = body.find((l) => /^Dealt to /i.test(l));
  if (!dealt) throw new HandParseError('No "Dealt to ..." line, so I can\'t tell which player is you.');
  const dm = dealt.match(/^Dealt to (.+?) \[(.+?)\]/i);
  if (!dm) throw new HandParseError("Could not read your hole cards.");
  const hero = dm[1];
  const heroCards = parseCards(dm[2]);
  if (heroCards.length !== 2) throw new HandParseError("Expected exactly two hole cards.");

  const positions = assignPositions(seated.map((s) => s.seat), buttonSeat);
  const players: Player[] = seated.map((s) => ({ ...s, position: positions[s.seat], isHero: s.name === hero }));
  if (!players.some((p) => p.isHero)) throw new HandParseError(`"${hero}" was dealt cards but has no seat.`);

  // Longest names first so "Bob: Jr" is not mistaken for "Bob".
  const names = players.map((p) => p.name).sort((a, b) => b.length - a.length);
  const actions: Action[] = [];
  const shown: Record<string, Card[]> = {};
  const collected: Record<string, number> = {};
  const returned: ParsedHand["returned"] = [];
  let street: Street = "preflop";
  let board: Card[] = [];

  for (const l of body) {
    if (/^\*\*\* FLOP \*\*\*/i.test(l)) {
      street = "flop";
      board = parseCards(l);
      continue;
    }
    if (/^\*\*\* TURN \*\*\*/i.test(l)) {
      street = "turn";
      board = parseCards(l);
      continue;
    }
    if (/^\*\*\* RIVER \*\*\*/i.test(l)) {
      street = "river";
      board = parseCards(l);
      continue;
    }
    const ret = l.match(/^Uncalled bet \(([^)]+)\) returned to (.+)$/i);
    if (ret) {
      returned.push({ player: ret[2], amount: num(ret[1]), afterAction: actions.length });
      continue;
    }
    const col = l.match(/^(.+?) collected ([^ ]+) from/i);
    if (col && names.includes(col[1])) {
      collected[col[1]] = (collected[col[1]] ?? 0) + num(col[2]);
      continue;
    }
    const name = names.find((n) => l.startsWith(n + ": "));
    if (!name) continue;
    const rest = l.slice(name.length + 2);
    const allIn = /all-in/i.test(rest);
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^posts (small blind|big blind|the ante|small & big blinds) ([^ ]+)/i))) {
      const kind = m[1].toLowerCase();
      actions.push({ street, player: name, type: "post", amount: num(m[2]), allIn, post: kind.includes("ante") ? "ante" : kind === "small blind" ? "sb" : "bb" });
    } else if (/^folds/i.test(rest)) {
      actions.push({ street, player: name, type: "fold", amount: 0, allIn: false });
    } else if (/^checks/i.test(rest)) {
      actions.push({ street, player: name, type: "check", amount: 0, allIn: false });
    } else if ((m = rest.match(/^calls ([^ ]+)/i))) {
      actions.push({ street, player: name, type: "call", amount: num(m[1]), allIn });
    } else if ((m = rest.match(/^bets ([^ ]+)/i))) {
      actions.push({ street, player: name, type: "bet", amount: num(m[1]), allIn });
    } else if ((m = rest.match(/^raises ([^ ]+) to ([^ ]+)/i))) {
      actions.push({ street, player: name, type: "raise", amount: num(m[1]), to: num(m[2]), allIn });
    } else if ((m = rest.match(/^shows \[(.+?)\]/i))) {
      shown[name] = parseCards(m[1]);
    }
  }

  if (!actions.some((a) => a.player === hero && a.type !== "post")) {
    throw new HandParseError("You didn't make any decisions in this hand, so there is nothing to review.");
  }

  return {
    id,
    site,
    game: isTournament ? "NLHE tournament" : "NLHE cash",
    isTournament,
    currency,
    sb,
    bb,
    table,
    buttonSeat,
    players,
    hero,
    heroCards,
    board,
    actions,
    shown,
    collected,
    returned,
  };
}
