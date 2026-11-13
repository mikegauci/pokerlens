import { describe, expect, it } from "vitest";
import { analyzeHand } from "../src/lib/poker/analyze";
import { mulberry32, parseCards } from "../src/lib/poker/cards";
import { equityVsRanges } from "../src/lib/poker/equity";
import { parseHand } from "../src/lib/poker/parser";
import {
  MULTIWAY_TOLERANCE_BB,
  SOLVE_TOLERANCE_BB,
  classEquity,
  clearShoveCache,
  equityVsRange,
  formatRange,
  pairCombos,
  solveFirstIn,
  solveHeadsUp,
} from "../src/lib/poker/pushfold";
import { ALL_CLASSES, combosOfClass, expandRange, mustParse } from "../src/lib/poker/ranges";
import { SAMPLES } from "../src/lib/poker/samples";

const DEPTHS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

describe("preflop equity table", () => {
  it("matches well-known all-in matchups", () => {
    expect(classEquity("AA", "KK")).toBeCloseTo(0.8195, 3);
    expect(classEquity("AKs", "QQ")).toBeCloseTo(0.4605, 3);
    expect(classEquity("22", "AKo")).toBeCloseTo(0.5265, 3);
    expect(classEquity("AA", "AA")).toBe(0.5);
  });
  it("gives the two sides of a matchup equities that sum to one", () => {
    for (const a of ["AA", "72o", "T9s", "K2o"]) for (const b of ALL_CLASSES) expect(classEquity(a, b) + classEquity(b, a)).toBeCloseTo(1, 10);
  });
  it("agrees with the Monte Carlo equity used by hand review", () => {
    // An independent path through the same evaluator: sampled boards against the enumerated table.
    const cases: [string, string, string][] = [
      ["Kd Qd", "KQs", "22+, A2s+, K9s+, QTs+, JTs, A7o+, KTo+, QJo"],
      ["7c 2d", "72o", "random"],
      ["As Ah", "AA", "TT+, AQs+, AKo"],
    ];
    for (const [cards, cls, text] of cases) {
      const hero = parseCards(cards);
      const range = mustParse(text);
      const mc = equityVsRanges(hero, [], [expandRange(range, hero)], 60000, mulberry32(7)).equity;
      expect(Math.abs(mc - equityVsRange(cls, Object.fromEntries(range)))).toBeLessThan(0.01);
    }
  });
  it("counts the ways two hands can be dealt together", () => {
    expect(pairCombos("AA", "AA")).toBe(6);
    expect(pairCombos("AA", "KK")).toBe(36);
    expect(pairCombos("AKs", "AKs")).toBe(12);
    expect(pairCombos("AKo", "72o")).toBe(144);
  });
});

describe("heads-up push/fold: undisputed cases", () => {
  it("always shoves and always calls with aces", () => {
    for (const s of DEPTHS) {
      const sol = solveHeadsUp(s);
      expect(sol.shove.AA).toBe(1);
      expect(sol.calls[0].AA).toBe(1);
    }
  });
  it("shoves almost any two cards with two big blinds, and calls with everything", () => {
    const sol = solveHeadsUp(2);
    expect(sol.shovePct).toBeGreaterThan(0.85);
    expect(sol.callPcts[0]).toBeGreaterThan(0.99);
    expect(solveHeadsUp(1.3).shovePct).toBe(1);
  });
  it("narrows both ranges as stacks get deeper", () => {
    const sols = DEPTHS.map((s) => solveHeadsUp(s));
    for (let i = 1; i < sols.length; i++) {
      expect(sols[i].shovePct).toBeLessThanOrEqual(sols[i - 1].shovePct + 1e-9);
      expect(sols[i].callPcts[0]).toBeLessThanOrEqual(sols[i - 1].callPcts[0] + 1e-9);
    }
  });
  it("never shoves 72o or calls with 32o at ten big blinds, and always shoves any pair", () => {
    const sol = solveHeadsUp(10);
    expect(sol.shove["72o"]).toBe(0);
    expect(sol.calls[0]["32o"]).toBe(0);
    for (const p of ["22", "55", "99", "KK"]) expect(sol.shove[p]).toBe(1);
  });
  it("is the exact two-player game and says so", () => {
    expect(solveHeadsUp(10).exact).toBe(true);
    expect(solveHeadsUp(10).exploitability).toBeLessThanOrEqual(SOLVE_TOLERANCE_BB);
  });
});

describe("heads-up push/fold: the calling range is what pot odds allow", () => {
  it("calls exactly the hands with enough equity against the shoving range", () => {
    for (const s of [3, 6, 10, 15, 20]) {
      const sol = solveHeadsUp(s);
      // Calling costs s - 1 more to win a pot of 2s.
      const need = (s - 1) / (2 * s);
      let allowed = 0;
      for (const cls of ALL_CLASSES) {
        const eq = equityVsRange(cls, sol.shove);
        if (sol.calls[0][cls] === 1) expect(eq).toBeGreaterThan(need - 0.002);
        if (sol.calls[0][cls] === 0) expect(eq).toBeLessThan(need + 0.002);
        if (eq >= need - 0.002) allowed += combosOfClass(cls).length / 1326;
      }
      expect(sol.callPcts[0]).toBeLessThanOrEqual(allowed + 1e-9);
    }
  });
});

describe("heads-up push/fold: published Nash chart", () => {
  // HoldemResources heads-up Nash chart, no ante (holdemresources.net/hune): the deepest stack in
  // big blinds at which each hand still shoves from the small blind or calls in the big blind.
  // Tolerance: the hand must take the action 0.3bb below the published stack and not take it 0.3bb above.
  const PUSHER: Record<string, number> = { K2o: 11.6, K5o: 14.2, K8o: 18.0, Q2o: 7.0, Q5o: 8.9, Q8o: 13.0, J2o: 4.6, J5o: 6.0, T7o: 9.0, "72o": 1.6, K2s: 19.3, Q2s: 12.7, J2s: 8.5 };
  const CALLER: Record<string, number> = { K2o: 8.1, K5o: 10.2, K9o: 17.1, Q2o: 5.6, Q8o: 9.7, QTo: 15.3, J2o: 4.2, JTo: 12.7, T7o: 5.5, "72o": 2.6, A2o: 15.8, "22": 15.0, K2s: 10.7, Q2s: 7.2 };
  const TOL = 0.3;
  const round = (x: number) => Math.round(x * 10) / 10;

  it("shoves each hand up to its published stack and no deeper", () => {
    for (const [cls, max] of Object.entries(PUSHER)) {
      expect(solveHeadsUp(round(max - TOL)).shove[cls], `${cls} below ${max}`).toBeGreaterThan(0.5);
      expect(solveHeadsUp(round(max + TOL)).shove[cls], `${cls} above ${max}`).toBeLessThan(0.5);
    }
  }, 30_000);
  it("calls with each hand up to its published stack and no deeper", () => {
    for (const [cls, max] of Object.entries(CALLER)) {
      expect(solveHeadsUp(round(max - TOL)).calls[0][cls], `${cls} below ${max}`).toBeGreaterThan(0.5);
      expect(solveHeadsUp(round(max + TOL)).calls[0][cls], `${cls} above ${max}`).toBeLessThan(0.5);
    }
  }, 30_000);
  it("reproduces the chart's gap for 63s: a shove at 2bb and 6.5bb, a fold at 4bb and 8bb", () => {
    // The chart lists 63s as "7.1 - 5.1, 2.3": it stops being a shove, then becomes one again.
    expect(solveHeadsUp(2).shove["63s"]).toBe(1);
    expect(solveHeadsUp(4).shove["63s"]).toBe(0);
    expect(solveHeadsUp(6.5).shove["63s"]).toBe(1);
    expect(solveHeadsUp(8).shove["63s"]).toBe(0);
  });
  it("is close to the commonly quoted ranges at ten big blinds", () => {
    const sol = solveHeadsUp(10);
    expect(sol.shovePct).toBeCloseTo(0.58, 2);
    expect(sol.callPcts[0]).toBeCloseTo(0.37, 2);
  });
});

describe("heads-up push/fold: equilibrium property", () => {
  it("leaves no single hand able to gain by switching action", () => {
    // Recomputed here from the equity table alone, without the solver's own EV code.
    for (const [s, ante] of [[2, 0], [5, 0], [10, 0], [10, 0.125], [15, 0], [20, 0]] as const) {
      const sol = solveHeadsUp(s, ante);
      const p = sol.shove;
      const c = sol.calls[0];
      let sbTotal = 0;
      let bbTotal = 0;
      let facing = 0;
      for (const hand of ALL_CLASSES) {
        // Small blind: shove or fold.
        let ways = 0;
        let push = 0;
        for (const opp of ALL_CLASSES) {
          const w = pairCombos(hand, opp);
          ways += w;
          push += w * ((1 - c[opp]) * (1 + ante) + c[opp] * (2 * classEquity(hand, opp) - 1) * s);
        }
        push /= ways;
        const fold = -(0.5 + ante);
        const sbGain = Math.max(push, fold) - (p[hand] * push + (1 - p[hand]) * fold);
        expect(sbGain, `SB ${hand} at ${s}bb`).toBeLessThan(0.02);
        sbTotal += (sbGain * combosOfClass(hand).length) / 1326;

        // Big blind: call or fold, given the hands that shove.
        let reach = 0;
        let call = 0;
        for (const opp of ALL_CLASSES) {
          const w = pairCombos(hand, opp) * p[opp];
          reach += w;
          call += w * (2 * classEquity(hand, opp) - 1) * s;
        }
        call /= reach;
        const bbFold = -(1 + ante);
        const bbGain = Math.max(call, bbFold) - (c[hand] * call + (1 - c[hand]) * bbFold);
        expect(bbGain, `BB ${hand} at ${s}bb`).toBeLessThan(0.02);
        bbTotal += bbGain * reach;
        facing += reach;
      }
      // Summed over every hand, the gain available to both players is inside the solver's stated tolerance.
      expect(sbTotal + bbTotal / (1326 * 1225)).toBeLessThanOrEqual(SOLVE_TOLERANCE_BB * 1.01);
      expect(facing).toBeGreaterThan(0);
      expect(sol.exploitability).toBeCloseTo(sbTotal + bbTotal / (1326 * 1225), 6);
    }
  });
  it("reports shove EVs that match the independent calculation", () => {
    const sol = solveHeadsUp(10);
    for (const hand of ["AA", "K2o", "72o", "T9s"]) {
      let ways = 0;
      let push = 0;
      for (const opp of ALL_CLASSES) {
        const w = pairCombos(hand, opp);
        ways += w;
        push += w * ((1 - sol.calls[0][opp]) * 1 + sol.calls[0][opp] * (2 * classEquity(hand, opp) - 1) * 10);
      }
      expect(sol.shoveEv[hand]).toBeCloseTo(push / ways, 9);
    }
  });
});

describe("push/fold: determinism and consistency", () => {
  it("gives the same answer when solved again from scratch", () => {
    const first = solveHeadsUp(9.5);
    clearShoveCache();
    const second = solveHeadsUp(9.5);
    expect(second).not.toBe(first);
    expect(second.shove).toEqual(first.shove);
    expect(second.calls).toEqual(first.calls);
    expect(second.iterations).toBe(first.iterations);
  });
  it("shoves wider with antes in the pot", () => {
    for (const s of [6, 10, 15]) expect(solveHeadsUp(s, 0.125).shovePct).toBeGreaterThan(solveHeadsUp(s).shovePct);
  });
  it("shoves tighter the more players are left to act, and labels that model an approximation", () => {
    let prev = 1;
    for (const behind of [1, 2, 3, 5, 8]) {
      const sol = solveFirstIn({ stackBb: 10, players: 9, playersBehind: behind, anteBb: 0.125 });
      expect(sol.exact).toBe(behind === 1);
      expect(sol.exploitability).toBeLessThanOrEqual(behind === 1 ? SOLVE_TOLERANCE_BB : MULTIWAY_TOLERANCE_BB);
      expect(sol.shovePct).toBeLessThan(prev);
      expect(sol.shove.AA).toBe(1);
      expect(sol.calls).toHaveLength(behind);
      for (const calls of sol.calls) expect(calls.AA).toBe(1);
      prev = sol.shovePct;
    }
  }, 20000);
  it("lets the big blind call wider than the small blind against a button shove", () => {
    // The big blind has more already in the pot, so it gets a better price.
    const sol = solveFirstIn({ stackBb: 10, players: 3, playersBehind: 2 });
    expect(sol.callPcts[1]).toBeGreaterThan(sol.callPcts[0]);
  });
  it("writes ranges in notation that parses back to the same range", () => {
    for (const s of [3, 8, 14]) {
      const sol = solveHeadsUp(s);
      for (const freq of [sol.shove, sol.calls[0]]) {
        const back = mustParse(formatRange(freq));
        for (const cls of ALL_CLASSES) expect(back.get(cls) ?? 0).toBeCloseTo(freq[cls], 2);
      }
    }
    expect(formatRange(Object.fromEntries(mustParse("22+, A2s+, K9s-K6s, KQo, 63s:0.4")))).toBe("22+, A2s+, K9s-K6s, 63s:0.4, KQo");
  });
});

/** A heads-up tournament hand, 100/200 blinds, where the small blind shoves and the big blind folds or calls. */
function headsUp(opts: { heroSeat: "SB" | "BB"; cards: string; stackBb: number; heroAction: "shove" | "fold" | "call" }): string {
  const chips = opts.stackBb * 200;
  const sb = opts.heroSeat === "SB" ? "Hero" : "villain";
  const bb = opts.heroSeat === "SB" ? "villain" : "Hero";
  const lines = [
    "PokerStars Hand #250000000777: Tournament #3999000222, $10+$1 USD Hold'em No Limit - Level V (100/200) - 2026/11/08 21:40:12 ET",
    "Table '3999000222 1' 2-max Seat #1 is the button",
    `Seat 1: ${sb} (${chips} in chips)`,
    `Seat 2: ${bb} (${chips} in chips)`,
    `${sb}: posts small blind 100`,
    `${bb}: posts big blind 200`,
    "*** HOLE CARDS ***",
    `Dealt to Hero [${opts.cards}]`,
  ];
  if (opts.heroSeat === "SB" && opts.heroAction === "fold") {
    lines.push("Hero: folds", "Uncalled bet (100) returned to villain", "villain collected 200 from pot");
  } else {
    lines.push(`${sb}: raises ${chips - 200} to ${chips} and is all-in`);
    if (opts.heroSeat === "SB" || opts.heroAction === "fold") lines.push(`${bb}: folds`, `Uncalled bet (${chips - 200}) returned to ${sb}`, `${sb} collected 400 from pot`);
    else lines.push(`Hero: calls ${chips - 200} and is all-in`, "*** FLOP *** [Qs 7h 4c]", "*** TURN *** [Qs 7h 4c] [2d]", "*** RIVER *** [Qs 7h 4c 2d] [9s]", "*** SHOW DOWN ***", `Hero collected ${chips * 2} from pot`);
  }
  lines.push("*** SUMMARY ***", "Total pot 400 | Rake 0");
  return lines.join("\n");
}
const review = (opts: Parameters<typeof headsUp>[0]) => analyzeHand(parseHand(headsUp(opts)), { iterations: 3000 }).decisions[0];

describe("hand review under about 15bb", () => {
  it("judges hero's own shove with the exact heads-up model", () => {
    const good = review({ heroSeat: "SB", cards: "Ks 2d", stackBb: 8, heroAction: "shove" });
    expect(good.verdict).toBe("good");
    expect(good.model!.exact).toBe(true);
    expect(good.model!.name).toMatch(/Push\/fold equilibrium, 8bb/);
    expect(good.chart).toBeUndefined();

    const bad = review({ heroSeat: "SB", cards: "7s 2d", stackBb: 12, heroAction: "shove" });
    expect(["inaccuracy", "mistake"]).toContain(bad.verdict);
    expect(bad.evLossBb!).toBeGreaterThan(0.05);
    // The loss it reports is the model's own number.
    expect(bad.evLossBb!).toBeCloseTo(-(solveHeadsUp(12).shoveEv["72o"] + 0.5), 6);
  });
  it("flags folding a hand that shoves, and accepts folding one that does not", () => {
    const aces = review({ heroSeat: "SB", cards: "As Ad", stackBb: 8, heroAction: "fold" });
    expect(aces.verdict).toBe("mistake");
    expect(aces.evLossBb!).toBeGreaterThan(1);
    expect(review({ heroSeat: "SB", cards: "7s 2d", stackBb: 12, heroAction: "fold" }).verdict).toBe("good");
  });
  it("agrees with the solved range for every hand: a shove is never flagged when the equilibrium shoves it", () => {
    const sol = solveHeadsUp(10);
    for (const [cards, cls] of [["Ks 2d", "K2o"], ["Qs 6d", "Q6o"], ["Ts 7d", "T7o"], ["8s 4s", "84s"], ["7s 2d", "72o"], ["5s 3d", "53o"], ["Js 3s", "J3s"]] as const) {
      const d = review({ heroSeat: "SB", cards, stackBb: 10, heroAction: "shove" });
      if (sol.shove[cls] === 1) expect(d.verdict, cls).toBe("good");
      if (sol.shove[cls] === 0) expect(d.verdict, cls).not.toBe("good");
    }
  });
  it("gives a shover the equilibrium range instead of a 100bb opening chart", () => {
    const call = review({ heroSeat: "BB", cards: "Ks 5d", stackBb: 8, heroAction: "call" });
    expect(call.villains[0].rangeLabel).toMatch(/Push\/fold equilibrium, 8bb/);
    expect(call.villains[0].rangeText).toBe(formatRange(solveHeadsUp(8).shove));
    expect(call.model!.exact).toBe(true);
    expect(call.exact).toBe(true);
    // K5o calls up to 10.2bb on the published chart, and 72o only up to 2.6bb.
    expect(call.verdict).toBe("good");
    const loose = review({ heroSeat: "BB", cards: "7s 2d", stackBb: 8, heroAction: "call" });
    expect(loose.verdict).toBe("mistake");
    expect(review({ heroSeat: "BB", cards: "7s 2d", stackBb: 8, heroAction: "fold" }).verdict).toBe("good");
    expect(review({ heroSeat: "BB", cards: "Ks 5d", stackBb: 8, heroAction: "fold" }).verdict).not.toBe("good");
  });
  it("leaves deep-stacked hands on the charts", () => {
    for (const s of SAMPLES.filter((x) => x.id !== "mtt-short-stack")) {
      for (const d of analyzeHand(parseHand(s.text), { iterations: 500 }).decisions) expect(d.model, s.id).toBeUndefined();
    }
    const deep = review({ heroSeat: "SB", cards: "Ks 2d", stackBb: 40, heroAction: "shove" });
    expect(deep.model).toBeUndefined();
    expect(deep.chart).toBeDefined();
  });
  it("uses a reshove equilibrium for the 12bb shove over hero's open in the tournament sample", () => {
    const a = analyzeHand(parseHand(SAMPLES.find((s) => s.id === "mtt-short-stack")!.text));
    const [open, call] = a.decisions;
    // Hero's open is 19bb effective against the small blind, so it stays a chart decision.
    expect(open.model).toBeUndefined();
    expect(call.model!.name).toMatch(/Reshove equilibrium, 11\.8bb/);
    expect(call.model!.exact).toBe(false);
    expect(call.villains[0].rangeLabel).toBe(call.model!.name);
    // The 100bb 3-bet chart gave the shover about 9% of hands; a 12bb stack shoves far wider.
    expect(call.villains[0].combos).toBeGreaterThan(300);
    expect(call.verdict).toBe("good");
    expect(call.reasons.join(" ")).toMatch(/no ICM/);
  });
});
