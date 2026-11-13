import { describe, expect, it } from "vitest";
import { handClass } from "../src/lib/poker/cards";
import { LEAKS, Leak, NodeReport, RiverSolution, buildTree, solveRiver } from "../src/lib/poker/solver";
import { SPOT_PRESETS, SpotInput, toRiverSpot } from "../src/lib/poker/solver-spots";

/**
 * Validation scenarios for the river solver.
 * The toy game (nuts or air against a bluff-catcher) has a known closed-form equilibrium,
 * so the solver's frequencies and EVs can be checked against the textbook answer.
 * The other tests are properties any equilibrium must have.
 */
const preset = (id: string) => SPOT_PRESETS.find((p) => p.id === id)!;
const solve = (input: SpotInput, target = 0.001) => solveRiver(toRiverSpot(input).spot!, { target });

/** Share of one hand class that takes an action, weighted by how often each combo is at the node. */
function classFrequency(s: RiverSolution, report: NodeReport, cls: string, action: number) {
  const actions = s.nodes[report.id].actions.length;
  let reach = 0;
  let mass = 0;
  s.combos[report.player].forEach((c, i) => {
    if (handClass(c.a, c.b) !== cls) return;
    reach += report.reach[i];
    mass += report.reach[i] * report.strategy[i * actions + action];
  });
  return mass / reach;
}

const nodeAt = (s: RiverSolution, ...path: number[]) => s.reports[s.nodes.find((n) => n.path.join() === path.join())!.id]!;

describe("river tree", () => {
  it("ends every line in a fold or a showdown and never bets more than the stack", () => {
    const { spot } = toRiverSpot(preset("river-lead"));
    const nodes = buildTree(spot!);
    for (const n of nodes) {
      expect(Math.max(...n.committed)).toBeLessThanOrEqual(spot!.stack);
      if (n.player === null) expect(n.terminal).not.toBeNull();
      else expect(n.actions.length).toBeGreaterThanOrEqual(2);
      if (n.terminal === "showdown") expect(n.committed[0]).toBe(n.committed[1]);
    }
    expect(nodes[0].actions.map((a) => a.kind)).toEqual(["check", "bet", "bet"]);
  });
  it("collapses sizes larger than the stack into one all-in bet", () => {
    const { spot } = toRiverSpot({ ...preset("polar-vs-bluffcatcher"), sizes: "100, 200, 300" });
    const root = buildTree(spot!)[0];
    expect(root.actions.map((a) => a.added)).toEqual([0, 10]);
    expect(root.actions[1].allIn).toBe(true);
  });
  it("explains bad input", () => {
    expect(toRiverSpot({ ...preset("river-lead"), board: "Js 8d 3c" }).errors[0]).toMatch(/five/);
    expect(toRiverSpot({ ...preset("river-lead"), oop: "AK, banana" }).errors[0]).toMatch(/banana/);
    expect(toRiverSpot({ ...preset("river-lead"), sizes: "900" }).errors[0]).toMatch(/bet sizes/);
    expect(toRiverSpot({ ...preset("river-lead"), ip: "JJ:0, 8d8d" }).errors.length).toBeGreaterThan(0);
  });
});

describe("textbook toy game: nuts or air against a bluff-catcher", () => {
  // Bet b into pot 1: bluffs are b / (1 + 2b) of the betting range, the caller defends 1 / (1 + b).
  for (const [sizes, bluffShare, defend] of [["50", 1 / 4, 2 / 3], ["100", 1 / 3, 1 / 2], ["200", 2 / 5, 1 / 3]] as const) {
    it(`matches the closed-form answer for a ${sizes}% pot bet`, () => {
      const { solution: s } = solve({ ...preset("polar-vs-bluffcatcher"), stack: 100, sizes });
      expect(s.nashDistance).toBeLessThan(0.001);

      const oop = nodeAt(s);
      expect(oop.frequency[0]).toBeGreaterThan(0.98); // top pair never leads into a range that only calls with better

      const bettor = nodeAt(s, 0);
      expect(classFrequency(s, bettor, "77", 1)).toBeGreaterThan(0.99);
      const bet = bettor.bets[1]!;
      expect(bet.value).toBeCloseTo(3, 1);
      expect(bet.bluff / (bet.value + bet.bluff)).toBeCloseTo(bluffShare, 1);

      const caller = nodeAt(s, 0, 1);
      expect(caller.defence!.mdf).toBeCloseTo(defend, 6);
      expect(caller.defence!.frequency).toBeCloseTo(defend, 1);

      // The bluff-catcher is indifferent, so it earns what it would by always folding to a bet:
      // the pot whenever the bettor checks back air.
      const bluffs = (3 * bluffShare) / (1 - bluffShare);
      expect(s.ev[0]).toBeCloseTo((10 * (4 - bluffs)) / 7, 1);
    });
  }
  it("makes the bluff-catcher's call and fold worth the same", () => {
    const { solution: s } = solve(preset("polar-vs-bluffcatcher"));
    const caller = nodeAt(s, 0, 1);
    for (let i = 0; i < s.combos[0].length; i++) expect(caller.actionEv[1][i] - caller.actionEv[0][i]).toBeCloseTo(0, 0);
  });
});

describe("equilibrium properties on a real spot", () => {
  const { solver, solution: s } = solve(preset("river-lead"), 0.002);

  it("converges and splits exactly the pot between the players", () => {
    expect(s.nashDistance).toBeLessThan(0.002);
    expect(s.ev[0] + s.ev[1]).toBeCloseTo(s.spot.pot, 6);
  });
  it("gets closer to equilibrium with more iterations", () => {
    const spot = toRiverSpot(preset("river-lead")).spot!;
    const early = solveRiver(spot, { maxIterations: 20, step: 20 }).solution.nashDistance;
    const late = solveRiver(spot, { maxIterations: 400, step: 400, target: 0 }).solution.nashDistance;
    expect(late).toBeLessThan(early);
  });
  it("gives the same answer every time", () => {
    const again = solve(preset("river-lead"), 0.002).solution;
    expect(again.iterations).toBe(s.iterations);
    expect(Array.from(again.reports[0]!.strategy)).toEqual(Array.from(s.reports[0]!.strategy));
  });
  it("keeps every strategy a probability distribution", () => {
    for (const r of s.reports) {
      if (!r) continue;
      const actions = s.nodes[r.id].actions.length;
      for (let i = 0; i < r.strategy.length; i += actions) {
        let sum = 0;
        for (let a = 0; a < actions; a++) {
          expect(r.strategy[i + a]).toBeGreaterThanOrEqual(0);
          sum += r.strategy[i + a];
        }
        expect(sum).toBeCloseTo(1, 9);
      }
      expect(r.frequency.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 6);
    }
  });
  it("never folds the best possible hand to a bet", () => {
    const facing = nodeAt(s, 0, 2); // big blind checks, button bets big, big blind to act
    // A set of eights is the strongest hand in the big blind's range and loses only to bigger sets.
    const nuts = s.combos[facing.player].findIndex((c) => handClass(c.a, c.b) === "88");
    expect(nuts).toBeGreaterThanOrEqual(0);
    expect(facing.equity[nuts]).toBeGreaterThan(0.8);
    const actions = s.nodes[facing.id].actions.length;
    expect(facing.strategy[nuts * actions]).toBeLessThan(0.02);
  });
  it("never calls a bet with a hand that cannot beat any bluff", () => {
    // 6-high and 7-high busted draws lose to everything that bets.
    const facing = nodeAt(s, 2);
    const actions = s.nodes[facing.id].actions.length;
    s.combos[1].forEach((c, i) => {
      if (handClass(c.a, c.b) === "76s" && facing.equity[i] < 0.01) expect(facing.strategy[i * actions + 1]).toBeLessThan(0.02);
    });
  });
  it("gives stronger hands more EV than weaker ones", () => {
    // Blockers can shift EV slightly between two sets, so those are compared with a margin.
    const ev = (cls: string) => {
      const idx = s.combos[1].map((c, i) => (handClass(c.a, c.b) === cls ? i : -1)).filter((i) => i >= 0);
      return idx.reduce((sum, i) => sum + s.comboEv[1][i], 0) / idx.length;
    };
    expect(ev("JJ")).toBeGreaterThan(ev("33") - 0.2);
    expect(ev("33")).toBeGreaterThan(ev("AJo"));
    expect(ev("AJo")).toBeGreaterThan(ev("76s"));
  });

  describe("exploiting a leak", () => {
    const tolerance = s.nashDistance * s.spot.pot * 2 + 1e-6;
    for (const leak of Object.keys(LEAKS) as Leak[]) {
      for (const hero of [0, 1] as const) {
        it(`${LEAKS[leak].label.toLowerCase()}: seat ${hero} never does worse than equilibrium, and the best response does best`, () => {
          const x = solver.exploit(s, hero, leak);
          expect(x.evEquilibrium).toBeCloseTo(s.ev[hero], 9);
          expect(x.evUnchanged).toBeGreaterThan(x.evEquilibrium - tolerance);
          expect(x.evExploit).toBeGreaterThan(x.evUnchanged - 1e-9);
        });
      }
    }
    it("folds more against an opponent who bluffs too little and calls more against one who bluffs too much", () => {
      const defend = (leak: Leak) => solver.exploit(s, 1, leak).reports[nodeAt(s, 2).id]!.defence!.frequency;
      const equilibrium = nodeAt(s, 2).defence!.frequency;
      expect(defend("underbluff")).toBeLessThan(equilibrium);
      expect(defend("overbluff")).toBeGreaterThan(equilibrium);
    });
    it("stops bluffing an opponent who calls too much", () => {
      const bluffs = (reports: (NodeReport | null)[]) => reports[0]!.bets.reduce((sum, b) => sum + (b?.bluff ?? 0), 0);
      expect(bluffs(solver.exploit(s, 0, "station").reports)).toBeLessThan(bluffs(s.reports) * 0.5 + 0.01);
    });
  });
});

describe("the toy game against a bettor who bluffs too little", () => {
  it("always folds the bluff-catcher and wins more than the equilibrium share", () => {
    const { solver, solution: s } = solve(preset("polar-vs-bluffcatcher"));
    const x = solver.exploit(s, 0, "underbluff");
    expect(x.reports[nodeAt(s, 0, 1).id]!.defence!.frequency).toBeLessThan(0.01);
    // The bettor now bluffs 0.4 * 1.5 of its 4 air combos, so it checks back 3.4 of 7 hands.
    expect(x.evExploit).toBeCloseTo((10 * 3.4) / 7, 1);
    expect(x.evUnchanged).toBeCloseTo(s.ev[0], 1);
  });
});
