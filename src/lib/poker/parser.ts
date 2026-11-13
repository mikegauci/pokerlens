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

export interface ParseOptions {
  /**
   * Accept a hand where hero never acted, such as a walk in the big blind. Single-hand review rejects
   * these because there is nothing to review, but session stats need them to count hands correctly.
   */
  allowNoDecision?: boolean;
}

export type HandFormat = "pokerstars" | "ggpoker" | "888poker";

export const FORMAT_NAMES: Record<HandFormat, string> = { pokerstars: "PokerStars", ggpoker: "GGPoker", "888poker": "888poker" };

/** Header line of an 888poker hand (also used by its skins): "***** 888poker Hand History for Game 123 *****". */
const HEADER_888 = /^\*{5} (.+?) Hand History for Game (\d+)/i;

/**
 * Works out which site wrote a hand history from its header, or null when no known header is found.
 * GGPoker writes "Poker Hand #RC123:" with a letter prefix on the id; PokerStars writes "PokerStars Hand #123:".
 */
export function detectFormat(text: string): HandFormat | null {
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const l = raw.replace(/^\uFEFF/, "").trim();
    if (!l) continue;
    if (HEADER_888.test(l) || /^#Game No\s*:/i.test(l)) return "888poker";
    if (/^Poker Hand #[A-Z]{2}\d+:/i.test(l)) return "ggpoker";
    if (/Hand #\d+:?/i.test(l)) return "pokerstars";
  }
  return null;
}

/**
 * Parses a No-Limit Hold'em hand history (cash or tournament) in PokerStars, GGPoker or 888poker text format.
 * Every format ends up as the same ParsedHand, so the rest of the engine does not know which site the hand came from.
 * Throws HandParseError with a readable message when the text cannot be used.
 */
export function parseHand(text: string, opts: ParseOptions = {}): ParsedHand {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/^\uFEFF/, "").trim())
    .filter(Boolean);
  if (lines.length < 5) throw new HandParseError("That doesn't look like a complete hand history.");
  const format = detectFormat(text);
  if (!format) {
    throw new HandParseError('No hand header found. Expected a PokerStars, GGPoker or 888poker hand, starting with a line like "PokerStars Hand #123: Hold\'em No Limit ...".');
  }
  return format === "888poker" ? parse888(lines, opts) : parseStarsLike(lines, format, opts);
}

/** PokerStars and GGPoker: GGPoker's export follows the PokerStars layout with a few differences handled here. */
function parseStarsLike(lines: string[], format: HandFormat, opts: ParseOptions): ParsedHand {
  const header = lines.find((l) => /Hand #/i.test(l))!;
  checkGame(header);

  const id = header.match(/Hand #([A-Z]*\d+)/i)?.[1] ?? "unknown";
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

  const seated: Seated[] = [];
  for (const l of body) {
    if (/^\*\*\*/.test(l)) break;
    const m = l.match(/^Seat (\d+): (.+?) \(([^)]*?[\d.,]+)[^)]*in chips\)(.*)$/i);
    if (m && !/sitting out/i.test(m[4])) seated.push({ seat: parseInt(m[1], 10), name: m[2], stack: num(m[3]) });
  }

  // GGPoker writes a "Dealt to" line for every player, with cards only for the hero.
  const dealt = body.find((l) => /^Dealt to .+?\[/i.test(l)) ?? body.find((l) => /^Dealt to /i.test(l));
  const dm = dealt?.match(/^Dealt to (.+?) \[(.+?)\]/i);
  const names = seated.map((s) => s.name).sort((a, b) => b.length - a.length);
  const actions: Action[] = [];
  const shown: Record<string, Card[]> = {};
  const collected: Record<string, number> = {};
  const returned: ParsedHand["returned"] = [];
  let street: Street = "preflop";
  let board: Card[] = [];

  for (const l of body) {
    // GGPoker's run-it-twice writes "*** FIRST FLOP ***" and "*** SECOND FLOP ***". The first run is used as the board.
    const deal = l.match(/^\*\*\* (FIRST )?(FLOP|TURN|RIVER) \*\*\*/i);
    if (deal) {
      street = deal[2].toLowerCase() as Street;
      board = parseCards(l);
      continue;
    }
    if (/^\*\*\* SECOND (FLOP|TURN|RIVER)/i.test(l)) continue;
    const ret = l.match(/^Uncalled bet \(([^)]+)\) returned to (.+)$/i);
    if (ret) {
      returned.push({ player: ret[2], amount: num(ret[1]), afterAction: actions.length });
      continue;
    }
    const col = l.match(/^(.+?) collected ([^ ]+) from/i);
    if (col && names.includes(col[1])) {
      collected[col[1]] = round2((collected[col[1]] ?? 0) + num(col[2]));
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

  return finish({
    id,
    site: FORMAT_NAMES[format],
    isTournament,
    currency,
    sb,
    bb,
    table,
    buttonSeat,
    seated,
    dealt: dm ? { name: dm[1], cards: dm[2] } : dealt ? null : undefined,
    board,
    actions,
    shown,
    collected,
    returned,
  }, opts);
}

/**
 * 888poker (and skins that share its export). It differs from PokerStars in ways that matter for the pot:
 * a raise is written as the chips put in by that action ("raises [$6.37]"), not "raises X to Y"; an all-in
 * is not marked; and an uncalled bet is not written as returned. All three are derived here from the stacks.
 */
function parse888(lines: string[], opts: ParseOptions): ParsedHand {
  const header = lines.find((l) => HEADER_888.test(l));
  const gameNo = lines.find((l) => /^#Game No\s*:/i.test(l));
  const id = header?.match(HEADER_888)?.[2] ?? gameNo?.match(/(\d+)/)?.[1] ?? "unknown";
  const site = header?.match(HEADER_888)?.[1] ?? "888poker";

  const stakesLine = lines.find((l) => /Blinds/i.test(l) && /\d\s*\/\s*\D*\d/.test(l));
  if (!stakesLine) throw new HandParseError('Could not read the blinds. Expected a line like "$0.50/$1 Blinds No Limit Holdem".');
  checkGame(stakesLine);
  const stakes = stakesLine.match(/([\d.,]+)\s*\/\s*[^\d\s]*([\d.,]+)\s+Blinds/i);
  if (!stakes) throw new HandParseError("Could not read the blinds.");
  const sb = num(stakes[1]);
  const bb = num(stakes[2]);

  const tableLine = lines.find((l) => /^Table /i.test(l) || /^Tournament #/i.test(l)) ?? "";
  const isTournament = /^Tournament #/i.test(tableLine);
  const table = isTournament
    ? (tableLine.match(/Tournament #(\d+)/i)?.[1] ?? "") + (tableLine.match(/Table #?(\d+)/i) ? ` ${tableLine.match(/Table #?(\d+)/i)![1]}` : "")
    : (tableLine.match(/^Table (.+?)(?: \d+ Max)?(?: \(.*\))?$/i)?.[1] ?? "");
  const currency = isTournament ? "" : (stakesLine.match(/[$€£]/)?.[0] ?? "");
  const buttonSeat = parseInt(lines.find((l) => /^Seat \d+ is the button/i.test(l))?.match(/\d+/)?.[0] ?? "1", 10);

  const seated: Seated[] = [];
  for (const l of lines) {
    if (/^\*\* Dealing/i.test(l)) break;
    const m = l.match(/^Seat (\d+): (.+?) \(\s*([^)]*?)\s*\)$/i);
    if (m && /\d/.test(m[3])) seated.push({ seat: parseInt(m[1], 10), name: m[2], stack: num(m[3]) });
  }

  const dealt = lines.find((l) => /^Dealt to /i.test(l));
  const dm = dealt?.match(/^Dealt to (.+?) \[(.+?)\]/i);
  const names = seated.map((s) => s.name).sort((a, b) => b.length - a.length);
  const stacks: Record<string, number> = Object.fromEntries(seated.map((s) => [s.name, s.stack]));
  const actions: Action[] = [];
  const shown: Record<string, Card[]> = {};
  const collected: Record<string, number> = {};
  const returned: ParsedHand["returned"] = [];
  let street: Street = "preflop";
  let board: Card[] = [];
  let committed: Record<string, number> = {};
  let currentBet = 0;

  // When betting on a street ends with one player having put in more than anyone else (everyone folded,
  // or a call for less all-in), the difference goes back to that player. PokerStars writes this line; 888 does not.
  const settleStreet = () => {
    const sorted = Object.entries(committed).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return;
    const extra = round2(sorted[0][1] - (sorted[1]?.[1] ?? 0));
    if (extra > 0) {
      returned.push({ player: sorted[0][0], amount: extra, afterAction: actions.length });
      stacks[sorted[0][0]] = round2(stacks[sorted[0][0]] + extra);
    }
  };
  const put = (player: string, chips: number) => {
    stacks[player] = round2(stacks[player] - chips);
    committed[player] = round2((committed[player] ?? 0) + chips);
    return stacks[player] <= 0.0001;
  };

  let inSummary = false;
  for (const l of lines) {
    const deal = l.match(/^\*\* Dealing (flop|turn|river) \*\*\s*\[(.+?)\]/i);
    if (deal) {
      settleStreet();
      street = deal[1].toLowerCase() as Street;
      board = [...board, ...parseCards(deal[2])];
      committed = {};
      currentBet = 0;
      continue;
    }
    if (/^\*\* Summary \*\*/i.test(l)) {
      if (!inSummary) settleStreet();
      inSummary = true;
      continue;
    }
    const col = l.match(/^(.+?) collected \[\s*([^\]]+?)\s*\]/i);
    if (col && names.includes(col[1])) {
      collected[col[1]] = round2((collected[col[1]] ?? 0) + num(col[2]));
      continue;
    }
    const name = names.find((n) => l.startsWith(n + " "));
    if (!name) continue;
    const rest = l.slice(name.length + 1);
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^shows \[(.+?)\]/i))) {
      shown[name] = parseCards(m[1]);
      continue;
    }
    if (inSummary) continue;
    if ((m = rest.match(/^posts (small blind|big blind|ante|dead blind) \[([^\]]+)\]/i))) {
      const kind = m[1].toLowerCase();
      if (kind === "dead blind") {
        // "posts dead blind [$1 + $2]": the small-blind part is dead money, the big-blind part is a live bet.
        const parts = m[2].split("+").map(num);
        const live = parts.length > 1 ? parts[parts.length - 1] : parts[0];
        const dead = round2(parts.reduce((a, b) => a + b, 0) - live);
        if (dead > 0) {
          stacks[name] = round2(stacks[name] - dead);
          actions.push({ street, player: name, type: "post", amount: dead, allIn: stacks[name] <= 0.0001, post: "ante" });
        }
        const allIn = put(name, live);
        currentBet = Math.max(currentBet, committed[name]);
        actions.push({ street, player: name, type: "post", amount: live, allIn, post: "bb" });
      } else if (kind === "ante") {
        const amount = num(m[2]);
        stacks[name] = round2(stacks[name] - amount);
        actions.push({ street, player: name, type: "post", amount, allIn: stacks[name] <= 0.0001, post: "ante" });
      } else {
        const amount = num(m[2]);
        const allIn = put(name, amount);
        currentBet = Math.max(currentBet, committed[name]);
        actions.push({ street, player: name, type: "post", amount, allIn, post: kind === "small blind" ? "sb" : "bb" });
      }
    } else if (/^folds/i.test(rest)) {
      actions.push({ street, player: name, type: "fold", amount: 0, allIn: false });
    } else if (/^checks/i.test(rest)) {
      actions.push({ street, player: name, type: "check", amount: 0, allIn: false });
    } else if ((m = rest.match(/^(calls|bets|raises) \[([^\]]+)\]/i))) {
      const kind = m[1].toLowerCase();
      const chips = num(m[2]);
      const allIn = put(name, chips);
      if (kind === "calls") {
        actions.push({ street, player: name, type: "call", amount: chips, allIn });
      } else if (kind === "bets") {
        currentBet = committed[name];
        actions.push({ street, player: name, type: "bet", amount: chips, allIn });
      } else {
        const to = committed[name];
        actions.push({ street, player: name, type: "raise", amount: round2(to - currentBet), to, allIn });
        currentBet = to;
      }
    }
  }
  if (!inSummary) settleStreet();

  return finish({
    id,
    site,
    isTournament,
    currency,
    sb,
    bb,
    table,
    buttonSeat,
    seated,
    dealt: dm ? { name: dm[1], cards: dm[2] } : dealt ? null : undefined,
    board,
    actions,
    shown,
    collected,
    returned,
  }, opts);
}

interface Seated {
  seat: number;
  name: string;
  stack: number;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

function checkGame(line: string) {
  if (!/Hold'?em/i.test(line)) throw new HandParseError("Only Texas Hold'em hands are supported right now.");
  if (!/No Limit/i.test(line)) throw new HandParseError("Only No-Limit hands are supported right now.");
}

/** Checks shared by every format, then assigns positions. `dealt` is undefined with no "Dealt to" line, null when it has no readable cards. */
function finish(
  h: Omit<ParsedHand, "game" | "players" | "hero" | "heroCards"> & { seated: Seated[]; dealt: { name: string; cards: string } | null | undefined },
  opts: ParseOptions,
): ParsedHand {
  if (h.seated.length < 2) throw new HandParseError("Could not find at least two seated players.");
  if (h.dealt === undefined) throw new HandParseError('No "Dealt to ..." line, so I can\'t tell which player is you.');
  if (h.dealt === null) throw new HandParseError("Could not read your hole cards.");
  const hero = h.dealt.name;
  const heroCards = parseCards(h.dealt.cards);
  if (heroCards.length !== 2) throw new HandParseError("Expected exactly two hole cards.");

  const positions = assignPositions(h.seated.map((s) => s.seat), h.buttonSeat);
  const players: Player[] = h.seated.map((s) => ({ ...s, position: positions[s.seat], isHero: s.name === hero }));
  if (!players.some((p) => p.isHero)) throw new HandParseError(`"${hero}" was dealt cards but has no seat.`);

  if (!opts.allowNoDecision && !h.actions.some((a) => a.player === hero && a.type !== "post")) {
    throw new HandParseError("You didn't make any decisions in this hand, so there is nothing to review.");
  }

  const { seated: _seated, dealt: _dealt, ...rest } = h;
  void _seated;
  void _dealt;
  return { ...rest, game: h.isTournament ? "NLHE tournament" : "NLHE cash", players, hero, heroCards };
}
