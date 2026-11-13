import { Card } from "./cards";
import { evaluate } from "./evaluator";
import { Combo } from "./ranges";

/**
 * A solver for heads-up river spots.
 *
 * The model: two players with known ranges, one pot, one effective stack, and a fixed menu of
 * bet sizes. Seat 0 is out of position and acts first. With no cards to come, every line ends in
 * a fold or a showdown, so the game is small enough to solve in the browser.
 *
 * The method is CFR+ (counterfactual regret minimisation with regrets floored at zero and
 * linearly weighted averaging). The average strategy converges to a Nash equilibrium of this
 * model. `nashDistance` reports how far the current answer still is: the most either player
 * could gain by switching to a best response, as a fraction of the pot.
 *
 * The answer is exact for the ranges and sizes given, and only for those. It says nothing about
 * spots with different ranges, other bet sizes, rake, or more than two players.
 *
 * Payoffs are chips won relative to the start of the river: winning a showdown is worth the pot
 * plus the opponent's river bets, losing costs your own river bets, and the two players' EVs
 * always add up to the pot.
 */

export type Seat = 0 | 1;
export type ActionKind = "fold" | "check" | "call" | "bet" | "raise";

export interface RiverSpot {
  board: Card[];
  /** Pot at the start of the river. */
  pot: number;
  /** Effective stack behind at the start of the river. */
  stack: number;
  /** Bet sizes offered to both players, as fractions of the pot. */
  betSizes: number[];
  /** Whether a bet can be raised once, by the size of the pot (or all-in if that is less). */
  allowRaise: boolean;
  /** Weighted combos for the out-of-position and in-position player. */
  ranges: [Combo[], Combo[]];
}

export interface TreeAction {
  kind: ActionKind;
  /** Chips this action adds to the pot. */
  added: number;
  /** Size as a fraction of the pot before the action, for bets and raises. */
  sizeFrac?: number;
  allIn: boolean;
  child: number;
}

export interface TreeNode {
  id: number;
  parent: number;
  /** Who acts here, or null when the hand is over. */
  player: Seat | null;
  terminal: "showdown" | "fold" | null;
  folder: Seat | null;
  /** Chips each seat has put in on the river so far. */
  committed: [number, number];
  /** Pot including all river bets so far. */
  pot: number;
  toCall: number;
  /** The bet or raise this node responds to. */
  facing: { added: number; potBefore: number } | null;
  actions: TreeAction[];
  /** Indices of the actions taken from the root to reach this node. */
  path: number[];
}

/** What one player does at one decision point, and why. */
export interface NodeReport {
  id: number;
  player: Seat;
  /** Probability of each action for each combo: `strategy[combo * actions + action]`. */
  strategy: Float64Array;
  /** How much of each combo reaches this node (range weight times the player's own earlier choices). */
  reach: Float64Array;
  /** Share of the range that takes each action. */
  frequency: number[];
  /** EV in chips of each action for each combo: `actionEv[action][combo]`. NaN when the opponent cannot be here. */
  actionEv: Float64Array[];
  /** Showdown equity of each combo against the opponent's range at this node. */
  equity: Float64Array;
  /**
   * For each bet or raise: how many combos make it with at least 50% equity against the hands
   * that continue (value) and how many with less (bluffs). Null for other actions.
   */
  bets: ({ value: number; bluff: number } | null)[];
  /** Per bet or raise: each combo's equity against the hands that continue. */
  equityWhenCalled: (Float64Array | null)[];
  /** When facing a bet: how often the range continues, and the minimum defence frequency for that bet. */
  defence: { frequency: number; mdf: number; potOdds: number } | null;
}

export interface RiverSolution {
  spot: RiverSpot;
  nodes: TreeNode[];
  combos: [Combo[], Combo[]];
  iterations: number;
  /** EV for each seat in chips. They add up to the pot. */
  ev: [number, number];
  /** EV of each combo at the start of the river. */
  comboEv: [Float64Array, Float64Array];
  /** Most either player could gain by deviating, as a fraction of the pot. Zero is an exact equilibrium. */
  nashDistance: number;
  /** One report per tree node; null for terminal nodes. */
  reports: (NodeReport | null)[];
}

/** A way an opponent can depart from equilibrium. */
export type Leak = "underbluff" | "overbluff" | "station" | "overfold";

export const LEAKS: Record<Leak, { label: string; detail: string }> = {
  underbluff: { label: "Bluffs too little", detail: "Bets and raises with only 40% of the bluffs the equilibrium uses." },
  overbluff: { label: "Bluffs too much", detail: "Turns half of the weak hands it should check into bets." },
  station: { label: "Calls too much", detail: "Calls with half of the hands it should fold." },
  overfold: { label: "Folds too much", detail: "Folds half of the losing hands it should call with." },
};

export interface ExploitReport {
  hero: Seat;
  leak: Leak;
  /** Hero's EV when both players play the equilibrium. */
  evEquilibrium: number;
  /** Hero's EV when hero keeps playing the equilibrium and the opponent has the leak. */
  evUnchanged: number;
  /** Hero's EV with the best possible response to the leak. */
  evExploit: number;
  /** Reports for hero's best response and the opponent's leaking strategy. */
  reports: (NodeReport | null)[];
}

const round2 = (x: number) => Math.round(x * 100) / 100;

export function buildTree(spot: RiverSpot): TreeNode[] {
  const nodes: TreeNode[] = [];
  const sizes = [...new Set(spot.betSizes.filter((s) => s > 0))].sort((a, b) => a - b);

  const push = (parent: number, path: number[], committed: [number, number], extra: Partial<TreeNode>): TreeNode => {
    const node: TreeNode = {
      id: nodes.length,
      parent,
      player: null,
      terminal: null,
      folder: null,
      committed,
      pot: round2(spot.pot + committed[0] + committed[1]),
      toCall: 0,
      facing: null,
      actions: [],
      path,
      ...extra,
    };
    nodes.push(node);
    return node;
  };

  const decide = (parent: number, path: number[], player: Seat, committed: [number, number], raises: number, facing: TreeNode["facing"]): number => {
    const opp = (1 - player) as Seat;
    const toCall = round2(committed[opp] - committed[player]);
    const node = push(parent, path, committed, { player, toCall, facing });
    const behind = round2(spot.stack - committed[player]);
    const next = (i: number) => [...path, i];
    const withBet = (amount: number): [number, number] => {
      const c: [number, number] = [committed[0], committed[1]];
      c[player] = round2(c[player] + amount);
      return c;
    };

    if (toCall > 0) {
      node.actions.push({ kind: "fold", added: 0, allIn: false, child: push(node.id, next(0), committed, { terminal: "fold", folder: player }).id });
      node.actions.push({ kind: "call", added: toCall, allIn: toCall >= behind, child: push(node.id, next(1), withBet(toCall), { terminal: "showdown" }).id });
      if (spot.allowRaise && raises < 1 && behind > toCall) {
        const potAfterCall = node.pot + toCall;
        const raiseBy = round2(Math.min(potAfterCall, behind - toCall));
        const added = round2(toCall + raiseBy);
        const action: TreeAction = { kind: "raise", added, sizeFrac: raiseBy / potAfterCall, allIn: added >= behind, child: -1 };
        node.actions.push(action);
        action.child = decide(node.id, next(2), opp, withBet(added), raises + 1, { added, potBefore: node.pot });
      }
      return node.id;
    }

    const check: TreeAction = { kind: "check", added: 0, allIn: false, child: -1 };
    node.actions.push(check);
    check.child = player === 0 ? decide(node.id, next(0), 1, committed, raises, null) : push(node.id, next(0), committed, { terminal: "showdown" }).id;
    const seen = new Set<number>();
    for (const size of sizes) {
      const amount = round2(Math.min(size * node.pot, behind));
      if (amount <= 0 || seen.has(amount)) continue;
      seen.add(amount);
      const action: TreeAction = { kind: "bet", added: amount, sizeFrac: amount / node.pot, allIn: amount >= behind, child: -1 };
      const index = node.actions.push(action) - 1;
      action.child = decide(node.id, next(index), opp, withBet(amount), raises, { added: amount, potBefore: node.pot });
    }
    return node.id;
  };

  decide(-1, [], 0, [0, 0], 0, null);
  return nodes;
}

export function createRiverSolver(spot: RiverSpot) {
  if (spot.board.length !== 5) throw new Error("A river spot needs exactly five board cards.");
  if (new Set(spot.board).size !== 5) throw new Error("The board repeats a card.");
  if (!(spot.pot > 0)) throw new Error("The pot must be greater than zero.");
  if (!(spot.stack > 0)) throw new Error("The stack must be greater than zero.");

  const onBoard = new Set(spot.board);
  const combos = spot.ranges.map((range) => range.filter((c) => c.w > 0 && !onBoard.has(c.a) && !onBoard.has(c.b))) as [Combo[], Combo[]];
  if (!combos[0].length || !combos[1].length) throw new Error("Each player needs at least one hand that does not use a board card.");

  const nodes = buildTree(spot);
  const size = [combos[0].length, combos[1].length];
  const weights = combos.map((cs) => Float64Array.from(cs, (c) => c.w));
  const strength = combos.map((cs) => Int32Array.from(cs, (c) => evaluate([c.a, c.b, ...spot.board])));
  const order = strength.map((s) => Int32Array.from(s.keys()).sort((x, y) => s[x] - s[y]));
  /** For each combo, the index of the identical combo in the opponent's range, or -1. */
  const twin = ([0, 1] as const).map((p) => {
    const index = new Map(combos[1 - p].map((c, i) => [Math.min(c.a, c.b) * 52 + Math.max(c.a, c.b), i]));
    return Int32Array.from(combos[p], (c) => index.get(Math.min(c.a, c.b) * 52 + Math.max(c.a, c.b)) ?? -1);
  });

  const regret: Float64Array[] = [];
  const strategySum: Float64Array[] = [];
  for (const node of nodes) {
    const cells = node.player === null ? 0 : size[node.player] * node.actions.length;
    regret.push(new Float64Array(cells));
    strategySum.push(new Float64Array(cells));
  }
  let iterations = 0;

  /**
   * For every combo of player `p`: the opponent weight it beats, loses to, and can face at all.
   * A combo cannot face an opponent holding that shares a card with it, so those are removed.
   * Sorting by strength makes this linear in the two range sizes instead of quadratic.
   */
  const sweep = (p: number, reachO: Float64Array) => {
    const o = 1 - p;
    const mine = combos[p];
    const theirs = combos[o];
    const n = size[p];
    const m = size[o];
    const win = new Float64Array(n);
    const lose = new Float64Array(n);
    const valid = new Float64Array(n);
    const perCard = new Float64Array(52);
    let total = 0;
    for (let j = 0; j < m; j++) {
      total += reachO[j];
      perCard[theirs[j].a] += reachO[j];
      perCard[theirs[j].b] += reachO[j];
    }
    for (let i = 0; i < n; i++) {
      const t = twin[p][i];
      valid[i] = total - perCard[mine[i].a] - perCard[mine[i].b] + (t >= 0 ? reachO[t] : 0);
    }
    const running = new Float64Array(52);
    let sum = 0;
    let j = 0;
    for (let k = 0; k < n; k++) {
      const i = order[p][k];
      while (j < m && strength[o][order[o][j]] < strength[p][i]) {
        const c = order[o][j++];
        sum += reachO[c];
        running[theirs[c].a] += reachO[c];
        running[theirs[c].b] += reachO[c];
      }
      win[i] = sum - running[mine[i].a] - running[mine[i].b];
    }
    running.fill(0);
    sum = 0;
    j = m - 1;
    for (let k = n - 1; k >= 0; k--) {
      const i = order[p][k];
      while (j >= 0 && strength[o][order[o][j]] > strength[p][i]) {
        const c = order[o][j--];
        sum += reachO[c];
        running[theirs[c].a] += reachO[c];
        running[theirs[c].b] += reachO[c];
      }
      lose[i] = sum - running[mine[i].a] - running[mine[i].b];
    }
    return { win, lose, valid };
  };

  /** Value of a finished hand for each of `p`'s combos, summed over the opponent's reach. */
  const terminalValue = (node: TreeNode, p: number, reachO: Float64Array): Float64Array => {
    const { win, lose, valid } = sweep(p, reachO);
    const out = new Float64Array(size[p]);
    if (node.terminal === "fold") {
      const folder = node.folder!;
      const payoff = folder === p ? -node.committed[p] : spot.pot + node.committed[folder];
      for (let i = 0; i < out.length; i++) out[i] = payoff * valid[i];
      return out;
    }
    const c = node.committed[p];
    for (let i = 0; i < out.length; i++) {
      out[i] = (spot.pot + c) * win[i] + (spot.pot / 2) * (valid[i] - win[i] - lose[i]) - c * lose[i];
    }
    return out;
  };

  const scaled = (reach: Float64Array, strategy: Float64Array, actions: number, a: number) => {
    const out = new Float64Array(reach.length);
    let any = false;
    for (let i = 0; i < out.length; i++) {
      out[i] = reach[i] * strategy[i * actions + a];
      if (out[i] > 0) any = true;
    }
    return any ? out : null;
  };

  /** Regret matching: play each action in proportion to its positive regret. */
  const currentStrategy = (id: number): Float64Array => {
    const actions = nodes[id].actions.length;
    const r = regret[id];
    const out = new Float64Array(r.length);
    for (let i = 0; i < r.length; i += actions) {
      let sum = 0;
      for (let a = 0; a < actions; a++) sum += r[i + a];
      for (let a = 0; a < actions; a++) out[i + a] = sum > 0 ? r[i + a] / sum : 1 / actions;
    }
    return out;
  };

  const cfr = (id: number, p: number, reachP: Float64Array, reachO: Float64Array, weight: number): Float64Array => {
    const node = nodes[id];
    if (node.player === null) return terminalValue(node, p, reachO);
    const actions = node.actions.length;
    const strategy = currentStrategy(id);
    const n = size[p];
    const value = new Float64Array(n);
    if (node.player !== p) {
      for (let a = 0; a < actions; a++) {
        const next = scaled(reachO, strategy, actions, a);
        if (!next) continue;
        const v = cfr(node.actions[a].child, p, reachP, next, weight);
        for (let i = 0; i < n; i++) value[i] += v[i];
      }
      return value;
    }
    const actionValues: Float64Array[] = [];
    for (let a = 0; a < actions; a++) {
      const next = scaled(reachP, strategy, actions, a) ?? new Float64Array(n);
      const v = cfr(node.actions[a].child, p, next, reachO, weight);
      actionValues.push(v);
      for (let i = 0; i < n; i++) value[i] += strategy[i * actions + a] * v[i];
    }
    const r = regret[id];
    const s = strategySum[id];
    for (let i = 0; i < n; i++) {
      for (let a = 0; a < actions; a++) {
        const k = i * actions + a;
        r[k] = Math.max(0, r[k] + actionValues[a][i] - value[i]);
        s[k] += weight * reachP[i] * strategy[k];
      }
    }
    return value;
  };

  const iterate = (count: number) => {
    for (let t = 0; t < count; t++) {
      iterations++;
      for (const p of [0, 1]) cfr(0, p, weights[p], weights[1 - p], iterations);
    }
  };

  const averageStrategy = (): Float64Array[] =>
    nodes.map((node, id) => {
      const actions = node.actions.length;
      const s = strategySum[id];
      const out = new Float64Array(s.length);
      for (let i = 0; i < s.length; i += actions) {
        let sum = 0;
        for (let a = 0; a < actions; a++) sum += s[i + a];
        for (let a = 0; a < actions; a++) out[i + a] = sum > 0 ? s[i + a] / sum : 1 / actions;
      }
      return out;
    });

  /**
   * Values for `p` when everyone follows `profile`. With `best` set, `p` instead takes the highest-EV
   * action with every combo, and that choice is written into `best`. With `record` set, the value of
   * each action at `p`'s nodes is kept.
   */
  const walk = (id: number, p: number, reachO: Float64Array, profile: Float64Array[], best: Float64Array[] | null, record: Float64Array[][] | null): Float64Array => {
    const node = nodes[id];
    if (node.player === null) return terminalValue(node, p, reachO);
    const actions = node.actions.length;
    const n = size[p];
    const value = new Float64Array(n);
    if (node.player !== p) {
      for (let a = 0; a < actions; a++) {
        const next = scaled(reachO, profile[id], actions, a);
        if (!next) continue;
        const v = walk(node.actions[a].child, p, next, profile, best, record);
        for (let i = 0; i < n; i++) value[i] += v[i];
      }
      return value;
    }
    const actionValues = node.actions.map((action) => walk(action.child, p, reachO, profile, best, record));
    if (record) record[id] = actionValues;
    if (best) {
      const choice = new Float64Array(n * actions);
      for (let i = 0; i < n; i++) {
        let top = 0;
        for (let a = 1; a < actions; a++) if (actionValues[a][i] > actionValues[top][i] + 1e-12) top = a;
        choice[i * actions + top] = 1;
        value[i] = actionValues[top][i];
      }
      best[id] = choice;
      return value;
    }
    for (let i = 0; i < n; i++) for (let a = 0; a < actions; a++) value[i] += profile[id][i * actions + a] * actionValues[a][i];
    return value;
  };

  /** Total weight of hand pairs that can be dealt together. */
  const pairs = (() => {
    const { valid } = sweep(0, weights[1]);
    let z = 0;
    for (let i = 0; i < size[0]; i++) z += weights[0][i] * valid[i];
    return z;
  })();
  if (!(pairs > 0)) throw new Error("These two ranges cannot be dealt together on this board.");

  const average = (p: number, values: Float64Array) => {
    let sum = 0;
    for (let i = 0; i < values.length; i++) sum += weights[p][i] * values[i];
    return sum / pairs;
  };

  const evOf = (p: number, profile: Float64Array[]) => average(p, walk(0, p, weights[1 - p], profile, null, null));

  const bestResponse = (p: number, profile: Float64Array[]) => {
    const response = [...profile];
    const ev = average(p, walk(0, p, weights[1 - p], profile, response, null));
    return { ev, profile: response };
  };

  const describe = (profile: Float64Array[]): (NodeReport | null)[] => {
    const reach: [Float64Array, Float64Array][] = [];
    const visit = (id: number, r0: Float64Array, r1: Float64Array) => {
      reach[id] = [r0, r1];
      const node = nodes[id];
      if (node.player === null) return;
      const actions = node.actions.length;
      node.actions.forEach((action, a) => {
        const mine = scaled(node.player === 0 ? r0 : r1, profile[id], actions, a) ?? new Float64Array(size[node.player!]);
        if (node.player === 0) visit(action.child, mine, r1);
        else visit(action.child, r0, mine);
      });
    };
    visit(0, weights[0], weights[1]);

    const recorded: Float64Array[][] = [];
    for (const p of [0, 1]) walk(0, p, weights[1 - p], profile, null, recorded);

    return nodes.map((node, id) => {
      if (node.player === null) return null;
      const p = node.player;
      const actions = node.actions.length;
      const n = size[p];
      const mine = reach[id][p];
      const theirs = reach[id][1 - p];
      const strategy = profile[id];
      const { win, lose, valid } = sweep(p, theirs);
      const equity = Float64Array.from(valid, (v, i) => (v > 0 ? (win[i] + (v - win[i] - lose[i]) / 2) / v : NaN));
      const actionEv = node.actions.map((_, a) => Float64Array.from(valid, (v, i) => (v > 0 ? recorded[id][a][i] / v : NaN)));

      let total = 0;
      const frequency = node.actions.map(() => 0);
      for (let i = 0; i < n; i++) {
        total += mine[i];
        for (let a = 0; a < actions; a++) frequency[a] += mine[i] * strategy[i * actions + a];
      }
      for (let a = 0; a < actions; a++) frequency[a] = total > 0 ? frequency[a] / total : 0;

      const equityWhenCalled: (Float64Array | null)[] = [];
      const bets = node.actions.map((action, a) => {
        if (action.kind !== "bet" && action.kind !== "raise") {
          equityWhenCalled.push(null);
          return null;
        }
        const child = nodes[action.child];
        const childActions = child.actions.length;
        // The first action at a node that faces a bet is always fold.
        const continuing = Float64Array.from(theirs, (r, j) => r * (1 - profile[child.id][j * childActions]));
        const called = sweep(p, continuing);
        const eq = Float64Array.from(called.valid, (v, i) => (v > 0 ? (called.win[i] + (v - called.win[i] - called.lose[i]) / 2) / v : NaN));
        equityWhenCalled.push(eq);
        let value = 0;
        let bluff = 0;
        for (let i = 0; i < n; i++) {
          const mass = mine[i] * strategy[i * actions + a];
          if (eq[i] >= 0.5) value += mass;
          else bluff += mass;
        }
        return { value, bluff };
      });

      const defence = node.facing
        ? {
            frequency: 1 - frequency[0],
            mdf: 1 - node.facing.added / (node.facing.potBefore + node.facing.added),
            potOdds: node.toCall / (node.pot + node.toCall),
          }
        : null;

      return { id, player: p, strategy, reach: mine, frequency, actionEv, equity, bets, equityWhenCalled, defence };
    });
  };

  const solution = (): RiverSolution => {
    const profile = averageStrategy();
    const ev: [number, number] = [evOf(0, profile), evOf(1, profile)];
    const gain = bestResponse(0, profile).ev - ev[0] + bestResponse(1, profile).ev - ev[1];
    const comboEv = ([0, 1] as const).map((p) => {
      const values = walk(0, p, weights[1 - p], profile, null, null);
      const { valid } = sweep(p, weights[1 - p]);
      return Float64Array.from(values, (v, i) => (valid[i] > 0 ? v / valid[i] : NaN));
    }) as [Float64Array, Float64Array];
    return { spot, nodes, combos, iterations, ev, comboEv, nashDistance: Math.max(0, gain) / 2 / spot.pot, reports: describe(profile) };
  };

  /** The equilibrium with one player's strategy bent by a leak. */
  const leakProfile = (base: RiverSolution, player: Seat, leak: Leak): Float64Array[] =>
    nodes.map((node, id) => {
      const report = base.reports[id];
      if (!report || node.player !== player) return report ? report.strategy : new Float64Array(0);
      const actions = node.actions.length;
      const s = Float64Array.from(report.strategy);
      const facing = node.toCall > 0;
      const move = (i: number, from: number, to: number, share: number) => {
        const moved = s[i * actions + from] * share;
        s[i * actions + from] -= moved;
        s[i * actions + to] += moved;
      };
      for (let i = 0; i < size[player]; i++) {
        if (leak === "underbluff") {
          node.actions.forEach((_, a) => {
            const eq = report.equityWhenCalled[a];
            if (eq && eq[i] < 0.5) move(i, a, 0, 0.6);
          });
        } else if (leak === "overbluff" && !facing && actions > 1 && report.equity[i] < 0.35) {
          const betting = report.frequency.slice(1).reduce((x, y) => x + y, 0);
          const moved = s[i * actions] * 0.5;
          s[i * actions] -= moved;
          for (let a = 1; a < actions; a++) {
            s[i * actions + a] += moved * (betting > 0 ? report.frequency[a] / betting : a === actions - 1 ? 1 : 0);
          }
        } else if (leak === "station" && facing) {
          move(i, 0, 1, 0.5);
        } else if (leak === "overfold" && facing && report.equity[i] < 0.5) {
          move(i, 1, 0, 0.5);
        }
      }
      return s;
    });

  const exploit = (base: RiverSolution, hero: Seat, leak: Leak): ExploitReport => {
    const leaking = leakProfile(base, (1 - hero) as Seat, leak);
    const response = bestResponse(hero, leaking);
    return {
      hero,
      leak,
      evEquilibrium: base.ev[hero],
      evUnchanged: evOf(hero, leaking),
      evExploit: response.ev,
      reports: describe(response.profile),
    };
  };

  return {
    nodes,
    combos,
    iterate,
    solution,
    exploit,
    get iterations() {
      return iterations;
    },
  };
}

export type RiverSolver = ReturnType<typeof createRiverSolver>;

/** Solves a spot until it is within `target` of equilibrium (as a fraction of the pot) or `maxIterations` is reached. */
export function solveRiver(spot: RiverSpot, { target = 0.002, maxIterations = 2000, step = 50 } = {}): { solver: RiverSolver; solution: RiverSolution } {
  const solver = createRiverSolver(spot);
  let solution: RiverSolution;
  do {
    solver.iterate(step);
    solution = solver.solution();
  } while (solution.nashDistance > target && solver.iterations < maxIterations);
  return { solver, solution };
}
