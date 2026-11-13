import { describe, expect, it } from "vitest";
import { analyzeHand, type AnalysisOptions } from "../src/lib/poker/analyze";
import { parseCards } from "../src/lib/poker/cards";
import { CHARTS, chart, depthBand, frequencies, type ChartSet } from "../src/lib/poker/charts";
import { parseHand } from "../src/lib/poker/parser";
import { aggressionEv, type AggressionSpot } from "../src/lib/poker/raise-ev";
import { expandRange, parseRange, rangePercent } from "../src/lib/poker/ranges";
import { realization } from "../src/lib/poker/realization";
import { SAMPLES } from "../src/lib/poker/samples";
import { ALL_SPOTS, answerSpot, newProgress, type Deal } from "../src/lib/poker/trainer";

const run = (id: string, opts: AnalysisOptions = {}) => analyzeHand(parseHand(SAMPLES.find((s) => s.id === id)!.text), opts);
const pairsOf = (c: ChartSet) => [
  ...(["early", "late"] as const).flatMap((g) => [
    { raiseText: c.threeBet[g], callText: c.callOpen[g] },
    { raiseText: c.threeBet[g], callText: c.bbDefend[g] },
  ]),
  { raiseText: c.fourBet, callText: c.callThreeBet },
  { raiseText: c.fiveBet, callText: c.callFourBet },
];

describe("mixed, depth-aware preflop charts", () => {
  it("parse, and never raise and call a hand more than all of the time", () => {
    for (const set of Object.values(CHARTS)) {
      for (const text of [...Object.values(set.rfi), ...pairsOf(set).flatMap((p) => [p.raiseText, p.callText])]) expect(parseRange(text).errors).toEqual([]);
      for (const pair of pairsOf(set)) {
        for (const [cls, w] of chart(pair.callText)) expect((chart(pair.raiseText).get(cls) ?? 0) + w).toBeLessThanOrEqual(1);
      }
    }
  });
  it("split a hand's frequencies into raise, call and fold that add up to one", () => {
    const f = frequencies({ raiseText: CHARTS.deep.threeBet.late, callText: CHARTS.deep.callOpen.late }, "TT");
    expect(f).toEqual({ raise: 0.75, call: 0.25, fold: 0 });
    expect(frequencies({ raiseText: CHARTS.deep.rfi.UTG, callText: "" }, "A9s")).toEqual({ raise: 0.5, call: 0, fold: 0.5 });
  });
  it("open each seat wider than the seat before it", () => {
    for (const set of Object.values(CHARTS)) {
      const widths = (["UTG", "HJ", "CO", "BTN"] as const).map((p) => rangePercent(chart(set.rfi[p])));
      expect([...widths].sort((a, b) => a - b)).toEqual(widths);
    }
  });
  it("use the 15-40bb charts under 40bb, where calling a 3-bet and opening from early seats get tighter", () => {
    expect(depthBand(100)).toBe("deep");
    expect(depthBand(40)).toBe("deep");
    expect(depthBand(30)).toBe("mid");
    expect(rangePercent(chart(CHARTS.mid.rfi.UTG))).toBeLessThan(rangePercent(chart(CHARTS.deep.rfi.UTG)));
    expect(rangePercent(chart(CHARTS.mid.callThreeBet))).toBeLessThan(rangePercent(chart(CHARTS.deep.callThreeBet)) / 2);
  });
  it("judge the 31bb tournament open with the 15-40bb chart", () => {
    expect(run("mtt-short-stack").decisions[0].chart).toMatchObject({ depth: "mid", recommended: "raise" });
    expect(run("river-lead").decisions[0].chart!.depth).toBe("deep");
  });
  it("accept either action for a hand the chart mixes", () => {
    // 76s in the big blind against a button open: the chart 3-bets it half the time and calls the rest.
    const d = run("flush-draw-price").decisions[0];
    expect(d.chart!.freq).toEqual({ raise: 0.5, call: 0.5, fold: 0 });
    expect(d.action.type).toBe("call");
    expect(d.verdict).toBe("good");
    expect(d.title).toBe("Part of a mixed strategy");
  });
});

describe("the range trainer with mixed hands", () => {
  const utg = ALL_SPOTS.find((s) => s.kind === "first-in" && s.hero === "UTG")!;
  const deal = (hand: string): Deal => ({ spot: utg, hand, cards: parseCards("As 9s") as [number, number], review: false });
  it("accepts either action for a hand the chart plays half the time", () => {
    const p = newProgress(1);
    expect(answerSpot(p, deal("A9s"), "raise").correct).toBe(true);
    expect(answerSpot(p, deal("A9s"), "fold").correct).toBe(true);
    expect(answerSpot(p, deal("A9s"), "fold").freq).toEqual({ raise: 0.5, call: 0, fold: 0.5 });
  });
  it("still marks a pure hand wrong when the answer is never taken", () => {
    const p = newProgress(1);
    expect(answerSpot(p, deal("AKs"), "fold").correct).toBe(false);
    expect(answerSpot(p, deal("72o"), "raise").correct).toBe(false);
  });
});

describe("equity realisation", () => {
  const ak = parseCards("Ah Kd");
  it("is all of the equity in position, on the river, and when nobody can bet again", () => {
    expect(realization({ street: "flop", inPosition: true, heroCards: ak, exact: false }).factor).toBe(1);
    expect(realization({ street: "river", inPosition: false, heroCards: ak, exact: false }).factor).toBe(1);
    expect(realization({ street: "flop", inPosition: false, heroCards: ak, exact: true }).factor).toBe(1);
  });
  it("is less out of position, and less with more cards to come", () => {
    const flop = realization({ street: "flop", inPosition: false, heroCards: ak, exact: false }).factor;
    const turn = realization({ street: "turn", inPosition: false, heroCards: ak, exact: false }).factor;
    expect(flop).toBeLessThan(turn);
    expect(turn).toBeLessThan(1);
  });
  it("favours suited, connected hands over offsuit gappers preflop", () => {
    const f = (cards: string) => realization({ street: "preflop", inPosition: false, heroCards: parseCards(cards), exact: false }).factor;
    expect(f("8h 7h")).toBeGreaterThan(f("Kd 7c"));
  });
  it("never adds equity, so a call never looks better than on raw equity", () => {
    for (const s of SAMPLES) {
      for (const d of run(s.id).decisions) {
        if (!d.realization) continue;
        expect(d.realization.equity).toBeLessThanOrEqual(d.equity!);
        expect(d.realization.evCall!).toBeLessThanOrEqual(d.evCall! + 1e-9);
      }
    }
  });
  it("turns a raw-equity call out of position into a losing one when the price is close", () => {
    // KJo calls a 3-bet out of position: +EV on raw equity, -EV once realisation is counted.
    const d = run("kjo-3bet-pot").decisions[1];
    expect(d.evCall!).toBeGreaterThan(0);
    expect(d.realization!.evCall!).toBeLessThan(0);
  });
});

describe("EV of betting and raising", () => {
  const board = parseCards("Kh 9h 4c 2s 7d");
  const spot = (hero: string, rangeText: string, added: number, over: Partial<AggressionSpot> = {}): AggressionSpot => ({
    heroCards: parseCards(hero),
    board,
    villain: expandRange(parseRange(rangeText).range, [...parseCards(hero), ...board]),
    pot: 10,
    toCall: 0,
    heroStack: 100,
    villainStack: 100,
    heroCommitted: 0,
    villainCommitted: 0,
    equity: 0,
    added,
    actual: true,
    iterations: 2000,
    rng: () => 0.5,
    ...over,
  });

  it("makes a pure bluff break even against an opponent who defends exactly the minimum", () => {
    // 3h 2h has nothing here; every hand in the range beats it.
    const o = aggressionEv(spot("3c 2h", "KK, 99, AK, KQ", 10))!;
    expect(o.equityWhenCalled).toBe(0);
    expect(o.foldPct).toBeCloseTo(10 / 20, 6);
    expect(o.ev).toBeCloseTo(0, 6);
  });
  it("gains more with the nuts the more it bets", () => {
    const range = "AA, QQ, AK, AQ, KQ, KJ, KT, 99, 88";
    const evAt = (size: number) => aggressionEv(spot("Kd Ks", range, size, { equity: 1 }))!.gain;
    expect(evAt(5)).toBeGreaterThan(0);
    expect(evAt(10)).toBeGreaterThan(evAt(5));
    expect(evAt(20)).toBeGreaterThan(evAt(10));
  });
  it("on the river, is exact for the model: enumerated equity, no sampling", () => {
    const a = aggressionEv(spot("Ah Kd", "KK, 99, AK, KQ, KJ, QJ", 7, { equity: 0.5 }))!;
    const b = aggressionEv(spot("Ah Kd", "KK, 99, AK, KQ, KJ, QJ", 7, { equity: 0.5, rng: () => 0.1 }))!;
    expect(a).toEqual(b);
  });
  it("flags checking back a set on the river by what a bet would have won", () => {
    const a = run("missed-value");
    const d = a.decisions.find((x) => x.street === "river")!;
    expect(d.verdict).toBe("inaccuracy");
    expect(d.aggression!.actual).toBe(false);
    expect(d.aggression!.gain).toBeGreaterThan(0);
    expect(d.evLossBb).toBeCloseTo(d.aggression!.gain / a.hand.bb, 6);
  });
  it("is only computed after the flop, heads-up", () => {
    for (const s of SAMPLES) for (const d of run(s.id).decisions) if (d.aggression) expect(d.street).not.toBe("preflop");
  });
});
