import { Card, handClass, hashString, mulberry32 } from "./cards";
import {
  BB_DEFEND_TEXT,
  CALL_FOUR_BET_TEXT,
  CALL_OPEN_TEXT,
  CALL_THREE_BET_TEXT,
  FIVE_BET_TEXT,
  FOUR_BET_TEXT,
  LIMP_TEXT,
  RFI_TEXT,
  THREE_BET_TEXT,
  chart,
  chartPos,
  facingOpenCharts,
  facingThreeBetCharts,
  firstInCharts,
  openerGroup,
} from "./charts";
import { equityVsRanges } from "./equity";
import { describeHand } from "./evaluator";
import { Action, POSTFLOP_ORDER, ParsedHand, Street } from "./parser";
import { Combo, Range, classWeights, expandRange, narrowRange, parseRange, removeDead, totalWeight } from "./ranges";

export type Verdict = "good" | "ok" | "inaccuracy" | "mistake";

/** Tolerances, exported so the UI can state them. */
export const MARGINS = {
  /** Equity band around the break-even point treated as "close" when more betting can follow. */
  close: 0.05,
  /** Band used when the decision closes the action, covering Monte Carlo noise only. */
  exact: 0.03,
  valueBet: 0.6,
  bluff: 0.35,
};

export interface VillainView {
  name: string;
  position: string;
  rangeLabel: string;
  /** Preflop range text this estimate started from. */
  rangeText: string;
  custom: boolean;
  /** Weighted number of combos left. */
  combos: number;
  weights: Record<string, number>;
}

export interface ChartAdvice {
  situation: string;
  recommended: "raise" | "call" | "fold" | "check";
  inRaise: boolean;
  inCall: boolean;
  raiseText: string;
  callText: string;
}

export interface Decision {
  index: number;
  actionIndex: number;
  street: Street;
  board: Card[];
  /** Pot before hero acts, including bets already made on this street. */
  pot: number;
  toCall: number;
  heroStack: number;
  effectiveStack: number;
  spr: number | null;
  action: { type: Action["type"]; added: number; to?: number; allIn: boolean };
  handDesc: string;
  inPosition: boolean | null;
  equity?: number;
  potOdds?: number;
  /** Chip EV of calling relative to folding, assuming the hand is checked down afterwards. */
  evCall?: number;
  /** Hero's bet or raise as a fraction of the pot. */
  betPct?: number;
  /** How often villains must fold for a pure bluff of this size to break even. */
  breakevenFold?: number;
  /** True when no further betting is possible, so equity versus pot odds is exact for the assumed range. */
  exact: boolean;
  chart?: ChartAdvice;
  verdict: Verdict;
  title: string;
  reasons: string[];
  evLossBb?: number;
  villains: VillainView[];
}

export interface Snapshot {
  actionIndex: number;
  street: Street;
  board: Card[];
  pot: number;
  stacks: Record<string, number>;
  committed: Record<string, number>;
  folded: string[];
  player: string;
  text: string;
  decisionIndex: number | null;
}

export interface HandAnalysis {
  hand: ParsedHand;
  decisions: Decision[];
  timeline: Snapshot[];
  summary: {
    heroPosition: string;
    heroClass: string;
    heroStackBb: number;
    netBb: number;
    counts: Record<Verdict, number>;
    evLossBb: number;
  };
}

export interface AnalysisOptions {
  iterations?: number;
  /** Villain name to range text. Replaces the estimated preflop range for that player. */
  rangeOverrides?: Record<string, string>;
  /** How often opponents bluff when they bet or raise after the flop. */
  profile?: VillainProfile;
}

export type VillainProfile = "passive" | "standard" | "aggressive";
export const PROFILES: Record<VillainProfile, { label: string; bluffFactor: number; hint: string }> = {
  passive: { label: "Rarely bluffs", bluffFactor: 0.4, hint: "Typical of low-stakes player pools: big bets are mostly value." },
  standard: { label: "Standard", bluffFactor: 1, hint: "A reasonable mix of value bets and bluffs." },
  aggressive: { label: "Bluffs a lot", bluffFactor: 2.2, hint: "An aggressive opponent who bets missed draws and weak hands often." },
};

const ALL_RANGE: Range = parseRange("random").range;
const OVERLIMP = "88-22, A9s-A2s, K9s, Q9s, J9s, T8s+, 97s+, 86s+, 76s, 65s, 54s";

const pct = (x: number) => `${Math.round(x * 100)}%`;

interface VillainState {
  label: string;
  text: string;
  custom: boolean;
  combos: Combo[];
}

function boardFor(hand: ParsedHand, street: Street): Card[] {
  if (street === "preflop") return [];
  if (street === "flop") return hand.board.slice(0, 3);
  if (street === "turn") return hand.board.slice(0, 4);
  return hand.board.slice(0, 5);
}

export function analyzeHand(hand: ParsedHand, opts: AnalysisOptions = {}): HandAnalysis {
  const iterations = opts.iterations ?? 4000;
  const overrides = opts.rangeOverrides ?? {};
  const bluffFactor = PROFILES[opts.profile ?? "standard"].bluffFactor;
  const bb = hand.bb;
  const inBb = (x: number) => `${(x / bb).toFixed(1).replace(/\.0$/, "")}bb`;
  const hero = hand.hero;
  const heroPlayer = hand.players.find((p) => p.isHero)!;
  const posOf: Record<string, string> = Object.fromEntries(hand.players.map((p) => [p.name, p.position]));
  const heroClass = handClass(hand.heroCards[0], hand.heroCards[1]);

  const stacks: Record<string, number> = Object.fromEntries(hand.players.map((p) => [p.name, p.stack]));
  const committed: Record<string, number> = Object.fromEntries(hand.players.map((p) => [p.name, 0]));
  const invested: Record<string, number> = Object.fromEntries(hand.players.map((p) => [p.name, 0]));
  const folded = new Set<string>();
  const villains: Record<string, VillainState> = {};

  let pot = 0;
  let currentBet = 0;
  let street: Street = "preflop";
  let raises = 0;
  let limpers = 0;
  let firstRaiser: string | null = null;
  let heroRole: "none" | "limp" | "open" | "raise" = "none";

  const decisions: Decision[] = [];
  const timeline: Snapshot[] = [];

  const setVillainRange = (name: string, label: string, text: string) => {
    const override = overrides[name]?.trim();
    const useText = override || text;
    const parsed = parseRange(useText);
    const range = parsed.range.size ? parsed.range : ALL_RANGE;
    villains[name] = {
      label: override ? "Custom range" : label,
      text: useText,
      custom: Boolean(override),
      combos: expandRange(range, [...hand.heroCards, ...boardFor(hand, street)]),
    };
  };

  const updatePreflopRange = (a: Action) => {
    const pos = posOf[a.player];
    if (a.type === "raise" || a.type === "bet") {
      if (raises === 0) setVillainRange(a.player, `${pos} open-raise`, RFI_TEXT[chartPos(pos)]);
      else if (raises === 1) {
        const g = openerGroup(posOf[firstRaiser ?? a.player]);
        setVillainRange(a.player, `3-bet vs ${g} position open`, THREE_BET_TEXT[g]);
      } else if (raises === 2) setVillainRange(a.player, "4-bet", FOUR_BET_TEXT);
      else setVillainRange(a.player, "5-bet or more", FIVE_BET_TEXT);
    } else if (a.type === "call") {
      if (raises === 0) setVillainRange(a.player, "Limp", LIMP_TEXT);
      else if (raises === 1) {
        const g = openerGroup(posOf[firstRaiser ?? a.player]);
        if (pos === "BB") setVillainRange(a.player, `BB defend vs ${g} position open`, BB_DEFEND_TEXT[g]);
        else setVillainRange(a.player, `Call vs ${g} position open`, CALL_OPEN_TEXT[g]);
      } else if (raises === 2) setVillainRange(a.player, "Call vs 3-bet", CALL_THREE_BET_TEXT);
      else setVillainRange(a.player, "Call vs 4-bet", CALL_FOUR_BET_TEXT);
    } else if (a.type === "check") {
      setVillainRange(a.player, "BB checked its option", "random");
    }
  };

  const preflopAdvice = (toCall: number): ChartAdvice => {
    const pos = heroPlayer.position;
    let situation: string;
    let raiseText: string;
    let callText = "";
    if (raises === 0) {
      if (toCall === 0) {
        situation = "Big blind option after limps";
        raiseText = RFI_TEXT.CO;
      } else if (limpers > 0) {
        situation = `${pos} over ${limpers} limper${limpers > 1 ? "s" : ""}`;
        raiseText = RFI_TEXT[chartPos(pos)];
        callText = OVERLIMP;
      } else {
        situation = `${pos} first in (open-raise or fold)`;
        ({ raiseText, callText } = firstInCharts(pos));
      }
    } else if (raises === 1) {
      const opener = posOf[firstRaiser!];
      situation = `${pos} facing a ${opener} open`;
      ({ raiseText, callText } = facingOpenCharts(pos, opener));
    } else if (raises === 2) {
      if (heroRole === "open") {
        situation = `${pos} opened and faces a 3-bet`;
        ({ raiseText, callText } = facingThreeBetCharts());
      } else {
        situation = `${pos} cold, facing an open and a 3-bet`;
        raiseText = FIVE_BET_TEXT;
        callText = "QQ, AKo";
      }
    } else {
      situation = `${pos} facing a 4-bet or more`;
      raiseText = FIVE_BET_TEXT;
      callText = CALL_FOUR_BET_TEXT;
    }
    const inRaise = (chart(raiseText).get(heroClass) ?? 0) > 0;
    const inCall = callText ? (chart(callText).get(heroClass) ?? 0) > 0 : false;
    const recommended = inRaise ? "raise" : inCall ? "call" : toCall > 0 ? "fold" : "check";
    return { situation, recommended, inRaise, inCall, raiseText, callText };
  };

  const activeVillains = () => hand.players.filter((p) => !p.isHero && !folded.has(p.name) && villains[p.name]);

  const buildDecision = (a: Action, actionIndex: number): Decision => {
    const board = boardFor(hand, street);
    const toCall = Math.min(Math.max(0, currentBet - committed[hero]), stacks[hero]);
    const opponents = activeVillains();
    const liveOpponents = hand.players.filter((p) => !p.isHero && !folded.has(p.name));
    const effectiveStack = Math.min(stacks[hero], Math.max(0, ...liveOpponents.map((p) => stacks[p.name] + committed[p.name] - committed[hero])));
    const added = a.type === "raise" ? (a.to ?? 0) - committed[hero] : a.amount;

    let inPosition: boolean | null = null;
    if (street !== "preflop" && liveOpponents.length) {
      const heroIdx = POSTFLOP_ORDER.indexOf(heroPlayer.position);
      inPosition = liveOpponents.every((p) => POSTFLOP_ORDER.indexOf(p.position) < heroIdx);
    }

    const views: VillainView[] = opponents.map((p) => {
      const v = villains[p.name];
      const live = removeDead(v.combos, board);
      return {
        name: p.name,
        position: p.position,
        rangeLabel: v.label,
        rangeText: v.text,
        custom: v.custom,
        combos: Math.round(totalWeight(live) * 10) / 10,
        weights: classWeights(live),
      };
    });

    const d: Decision = {
      index: decisions.length,
      actionIndex,
      street,
      board,
      pot,
      toCall,
      heroStack: stacks[hero],
      effectiveStack,
      spr: street === "flop" && pot > 0 ? effectiveStack / pot : null,
      action: { type: a.type, added, to: a.to, allIn: a.allIn },
      handDesc: street === "preflop" ? heroClass : describeHand(hand.heroCards, board),
      inPosition,
      exact: false,
      verdict: "good",
      title: "",
      reasons: [],
      villains: views,
    };

    if (opponents.length) {
      const rng = mulberry32(hashString(`${hand.id}:${actionIndex}`));
      const othersCanBet = liveOpponents.some((p) => stacks[p.name] > 0);
      d.exact = toCall > 0 && (street === "river" || toCall >= stacks[hero] || !othersCanBet);
      // Decisions that close the action are judged strictly, so they get a larger sample.
      const n = d.exact ? iterations * 4 : iterations;
      const res = equityVsRanges(hand.heroCards, board, opponents.map((p) => villains[p.name].combos), n, rng);
      if (res.samples > 0) d.equity = res.equity;
    }

    if (toCall > 0) {
      d.potOdds = toCall / (pot + toCall);
      if (d.equity !== undefined) d.evCall = d.equity * (pot + toCall) - toCall;
    }
    if (a.type === "bet" || a.type === "raise") {
      d.betPct = pot > 0 ? added / pot : undefined;
      d.breakevenFold = added / (added + pot);
    }

    if (street === "preflop") judgePreflop(d);
    else judgePostflop(d);
    return d;
  };

  const judgeByPotOdds = (d: Decision, margin: number) => {
    const eq = d.equity!;
    const need = d.potOdds!;
    const ev = d.evCall!;
    const facts = `You needed ${pct(need)} equity to call ${inBb(d.toCall)} into ${inBb(d.pot)} and had about ${pct(eq)} against the assumed range.`;
    if (d.action.type === "fold") {
      if (eq > need + margin) {
        d.verdict = "mistake";
        d.title = "Folded with enough equity to call";
        d.evLossBb = ev / bb;
        d.reasons.push(facts, `Calling was worth about +${inBb(ev)} compared with folding.`);
      } else if (eq >= need - margin) {
        d.verdict = "ok";
        d.title = "Close fold";
        d.reasons.push(facts, "This is within the margin of error, so either option is defensible.");
      } else {
        d.verdict = "good";
        d.title = "Good fold";
        d.reasons.push(facts, `Calling would lose about ${inBb(-ev)} on average.`);
      }
    } else if (d.action.type === "call") {
      if (eq < need - margin) {
        if (d.exact) {
          d.verdict = "mistake";
          d.title = "Called without the price";
          d.evLossBb = -ev / bb;
          d.reasons.push(facts, `No more betting can follow, so this call loses about ${inBb(-ev)} on average.`);
        } else {
          d.verdict = "inaccuracy";
          d.title = "Call needs implied odds";
          d.reasons.push(facts, "The direct price is not there. The call only works if you expect to win extra bets on later streets when you improve.");
        }
      } else if (eq <= need + margin) {
        d.verdict = "ok";
        d.title = "Close call";
        d.reasons.push(facts, "This is within the margin of error, so either option is defensible.");
      } else {
        d.verdict = "good";
        d.title = "Good call";
        d.reasons.push(facts, `Calling is worth about +${inBb(ev)} compared with folding.`);
        if (!d.exact && eq > 0.75) d.reasons.push("With this much equity, raising for value is worth considering.");
      }
    }
  };

  const judgePreflop = (d: Decision) => {
    const advice = preflopAdvice(d.toCall);
    d.chart = advice;
    const act = d.action.type;
    const rec = advice.recommended;
    const facingRaise = raises > 0;

    // An all-in call or fold is a pure price decision, so use equity instead of the chart.
    if (d.exact && d.equity !== undefined && (act === "call" || act === "fold")) {
      judgeByPotOdds(d, MARGINS.exact);
      d.reasons.push("This is an all-in decision, so the comparison of equity and pot odds is exact for the assumed range.");
      return;
    }

    const chartLine = `Chart for "${advice.situation}": raise ${advice.raiseText}${advice.callText ? `; call ${advice.callText}` : ""}.`;
    if (act === "check") {
      d.verdict = "good";
      d.title = rec === "raise" ? "Checked a hand that can raise" : "Free play";
      if (rec === "raise") {
        d.verdict = "ok";
        d.reasons.push(`${heroClass} is strong enough to raise over the limpers for value.`);
      } else d.reasons.push("Checking your option costs nothing.");
    } else if (act === rec || (act === "raise" && advice.inRaise) || (act === "call" && advice.inCall)) {
      d.verdict = "good";
      d.title = act === "raise" ? (raises === 0 ? "Standard open" : raises === 1 ? "Standard 3-bet" : "Standard re-raise") : act === "call" ? "Standard call" : "Standard fold";
      d.reasons.push(`${heroClass} is ${act === "fold" ? "outside" : "inside"} the ${act === "fold" ? "continuing" : act === "raise" ? "raising" : "calling"} range here.`);
    } else if (act === "raise") {
      if (rec === "call") {
        d.verdict = "ok";
        d.title = "Aggressive, but reasonable";
        d.reasons.push(`${heroClass} is usually a call here. Raising it sometimes is fine as long as it is not every time.`);
      } else {
        d.verdict = "inaccuracy";
        d.title = raises === 0 ? "Loose open" : "Light re-raise";
        d.reasons.push(
          raises === 0
            ? `${heroClass} is outside the opening range from ${heroPlayer.position}. Opening too wide here means playing dominated hands out of position against the players behind.`
            : `${heroClass} is outside the value and standard bluff range for this spot.`,
        );
      }
    } else if (act === "call") {
      if (rec === "raise") {
        if (!facingRaise) {
          const sb = heroPlayer.position === "SB";
          d.verdict = sb ? "ok" : "inaccuracy";
          d.title = sb ? "Completed the small blind" : "Limped a raising hand";
          d.reasons.push(
            sb
              ? "Completing is part of some small blind strategies, though this chart raises or folds."
              : `${heroClass} is strong enough to open-raise. Limping gives up the chance to win the blinds and lets the big blind see a cheap flop.`,
          );
        } else {
          d.verdict = "ok";
          d.title = "Flatted a hand that usually re-raises";
          d.reasons.push(`${heroClass} is in the re-raising range here. Calling is playable but leaves value behind and keeps weaker hands in.`);
        }
      } else {
        d.verdict = facingRaise ? "mistake" : "inaccuracy";
        d.title = facingRaise ? "Loose call" : "Open-limp";
        d.reasons.push(
          facingRaise
            ? `${heroClass} is outside both the calling and re-raising ranges, so it is often dominated by the raiser's range.`
            : `${heroClass} is not in the opening range. The chart folds it instead of limping.`,
        );
      }
    } else if (act === "fold") {
      if (rec === "raise") {
        d.verdict = facingRaise ? "mistake" : "inaccuracy";
        d.title = facingRaise ? "Folded a hand strong enough to re-raise" : "Folded a standard open";
        d.reasons.push(`${heroClass} is inside the raising range here.`);
      } else if (rec === "check") {
        d.verdict = "mistake";
        d.title = "Folded when checking was free";
      } else {
        d.verdict = "inaccuracy";
        d.title = "Too tight";
        d.reasons.push(`${heroClass} is inside the calling range here.`);
      }
    }
    d.reasons.push(chartLine);
    if (d.equity !== undefined && d.potOdds !== undefined) {
      d.reasons.push(`For reference: about ${pct(d.equity)} raw equity against the assumed range, with ${pct(d.potOdds)} needed on price alone. Preflop, position and playability matter as much as raw equity.`);
    }
  };

  const judgePostflop = (d: Decision) => {
    const act = d.action.type;
    const eq = d.equity;
    if (eq === undefined) {
      d.verdict = "ok";
      d.title = "No range to compare against";
      d.reasons.push("No opponent range could be estimated for this spot.");
      return;
    }
    const river = d.street === "river";

    if (d.toCall > 0 && (act === "fold" || act === "call")) {
      judgeByPotOdds(d, d.exact ? MARGINS.exact : MARGINS.close);
      if (d.exact) d.reasons.push("No more betting can follow, so the comparison of equity and pot odds is exact for the assumed range.");
      return;
    }

    if (d.toCall === 0 && act === "fold") {
      d.verdict = "mistake";
      d.title = "Folded when checking was free";
      return;
    }

    const size = d.betPct !== undefined ? `${pct(d.betPct)} of the pot` : "";
    const have = `You have ${d.handDesc} with about ${pct(eq)} equity against the assumed range.`;

    if (act === "bet" || act === "raise") {
      const verb = act === "bet" ? "bet" : "raise";
      const fe = d.breakevenFold ?? 0;
      if (eq >= MARGINS.valueBet) {
        d.verdict = "good";
        d.title = act === "bet" ? "Value bet" : "Value raise";
        d.reasons.push(have, `You are ahead of the range often enough to ${verb} for value (${size}).`);
        if (act === "bet" && d.betPct !== undefined && d.betPct < 0.3 && eq > 0.75 && river) {
          d.reasons.push("With this much equity on the river, a larger size would usually win more.");
        }
      } else if (eq <= MARGINS.bluff) {
        d.verdict = "ok";
        d.title = act === "bet" ? "Bluff" : "Bluff raise";
        d.reasons.push(have, `As a bluff, this ${verb} of ${size} needs folds more than ${pct(fe)} of the time to break even before counting your equity when called.`);
        if (river) d.reasons.push("On the river you have no more cards to come, so the bluff depends entirely on fold equity.");
      } else {
        d.verdict = river || act === "raise" ? "inaccuracy" : "ok";
        d.title = act === "raise" ? "Raised a medium-strength hand" : river ? "Thin river bet" : "Thin bet";
        d.reasons.push(
          have,
          river || act === "raise"
            ? "Hands in the middle tend to fold out worse and get called by better when they put more money in. Checking or calling keeps the pot the right size."
            : "This is a thin bet. It can protect your equity and charge draws, but be ready for a raise.",
        );
      }
      return;
    }

    if (act === "check") {
      if (river && eq >= 0.75 && d.inPosition) {
        d.verdict = "inaccuracy";
        d.title = "Missed river value";
        d.reasons.push(have, "Checking back closes the action, so a hand this strong gives up a bet that worse hands would call.");
      } else if (eq >= 0.8) {
        d.verdict = "ok";
        d.title = "Slow-play";
        d.reasons.push(have, "Checking a hand this strong is fine occasionally, but betting usually builds a bigger pot.");
      } else {
        d.verdict = "good";
        d.title = "Reasonable check";
        d.reasons.push(have);
      }
      return;
    }

    if (act === "call") {
      d.verdict = "good";
      d.title = "Call";
      d.reasons.push(have);
    }
  };

  const describe = (a: Action): string => {
    const who = a.player === hero ? "Hero" : `${a.player} (${posOf[a.player]})`;
    const ai = a.allIn ? " and is all-in" : "";
    switch (a.type) {
      case "post":
        return `${who} posts ${a.post === "ante" ? "ante" : a.post === "sb" ? "small blind" : "big blind"} ${inBb(a.amount)}`;
      case "fold":
        return `${who} folds`;
      case "check":
        return `${who} checks`;
      case "call":
        return `${who} calls ${inBb(a.amount)}${ai}`;
      case "bet":
        return `${who} bets ${inBb(a.amount)}${ai}`;
      case "raise":
        return `${who} raises to ${inBb(a.to ?? a.amount)}${ai}`;
    }
  };

  hand.actions.forEach((a, i) => {
    if (a.street !== street) {
      street = a.street;
      currentBet = 0;
      for (const n of Object.keys(committed)) committed[n] = 0;
      const board = boardFor(hand, street);
      for (const v of Object.values(villains)) v.combos = removeDead(v.combos, board);
    }
    for (const r of hand.returned) {
      if (r.afterAction === i) {
        pot -= r.amount;
        stacks[r.player] += r.amount;
        invested[r.player] -= r.amount;
      }
    }

    let decisionIndex: number | null = null;
    if (a.player === hero && a.type !== "post") {
      const d = buildDecision(a, i);
      decisions.push(d);
      decisionIndex = d.index;
    }

    const p = a.player;
    const potBefore = pot;
    if (a.type === "post") {
      stacks[p] -= a.amount;
      invested[p] += a.amount;
      pot += a.amount;
      if (a.post !== "ante") {
        committed[p] += a.amount;
        currentBet = Math.max(currentBet, committed[p]);
      }
    } else if (a.type === "fold") {
      folded.add(p);
    } else if (a.type === "call" || a.type === "bet" || a.type === "raise") {
      const add = a.type === "raise" ? (a.to ?? 0) - committed[p] : a.amount;
      stacks[p] -= add;
      invested[p] += add;
      committed[p] += add;
      pot += add;
      currentBet = Math.max(currentBet, committed[p]);
    }

    if (a.type !== "post" && a.type !== "fold") {
      if (p !== hero) {
        if (street === "preflop") updatePreflopRange(a);
        else if (villains[p]) {
          const chips = pot - potBefore;
          const base = a.type === "call" ? potBefore - chips : potBefore;
          const sizeFrac = chips > 0 && base > 0 ? chips / base : undefined;
          villains[p].combos = narrowRange(villains[p].combos, boardFor(hand, street), a.type as "bet" | "raise" | "call" | "check", { sizeFrac, bluffFactor });
        }
        else setVillainRange(p, "Unknown (any two cards)", "random");
      }
      if (street === "preflop") {
        if (a.type === "raise" || a.type === "bet") {
          if (raises === 0) firstRaiser = p;
          if (p === hero) heroRole = raises === 0 ? "open" : "raise";
          raises++;
        } else if (a.type === "call" && raises === 0) {
          limpers++;
          if (p === hero) heroRole = "limp";
        }
      }
    }

    timeline.push({
      actionIndex: i,
      street,
      board: boardFor(hand, street),
      pot,
      stacks: { ...stacks },
      committed: { ...committed },
      folded: [...folded],
      player: p,
      text: describe(a),
      decisionIndex,
    });
  });

  for (const r of hand.returned) {
    if (r.afterAction >= hand.actions.length) invested[r.player] -= r.amount;
  }

  const counts: Record<Verdict, number> = { good: 0, ok: 0, inaccuracy: 0, mistake: 0 };
  let evLossBb = 0;
  for (const d of decisions) {
    counts[d.verdict]++;
    evLossBb += d.evLossBb ?? 0;
  }

  return {
    hand,
    decisions,
    timeline,
    summary: {
      heroPosition: heroPlayer.position,
      heroClass,
      heroStackBb: heroPlayer.stack / bb,
      netBb: ((hand.collected[hero] ?? 0) - invested[hero]) / bb,
      counts,
      evLossBb,
    },
  };
}
