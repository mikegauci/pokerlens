import { describe, expect, it } from "vitest";
import { analyzeHand } from "../src/lib/poker/analyze";
import { handClass } from "../src/lib/poker/cards";
import { BB_DEFEND_TEXT, CALL_OPEN_TEXT, CALL_THREE_BET_TEXT, FOUR_BET_TEXT, RFI_TEXT, THREE_BET_TEXT, chart } from "../src/lib/poker/charts";
import { parseHand } from "../src/lib/poker/parser";
import { ALL_CLASSES } from "../src/lib/poker/ranges";
import { SAMPLES } from "../src/lib/poker/samples";
import {
  ALL_SPOTS,
  Deal,
  POSITIONS,
  RETIRED_BOX,
  Spot,
  TRAINER_ACTIONS,
  TrainerProgress,
  answerSpot,
  correctAction,
  dealSpot,
  dealableHands,
  describeSpot,
  dueItems,
  edgeWeight,
  explain,
  newProgress,
  parseProgress,
  spotCharts,
  spotId,
  spotRange,
} from "../src/lib/poker/trainer";

const has = (text: string, hand: string) => (chart(text).get(hand) ?? 0) > 0;
const firstIn = (hero: Spot["hero"]): Spot => ({ kind: "first-in", hero });

/** Plays `n` turns, answering with `pick`, and returns every deal with the final progress. */
function play(seed: number, n: number, pick: (d: Deal) => "raise" | "call" | "fold") {
  let progress = newProgress(seed);
  const deals: Deal[] = [];
  for (let i = 0; i < n; i++) {
    const deal = dealSpot(progress);
    deals.push(deal);
    progress = answerSpot(progress, deal, pick(deal)).progress;
  }
  return { deals, progress };
}
const right = (d: Deal) => correctAction(d.spot, d.hand);
const wrong = (d: Deal) => TRAINER_ACTIONS.find((a) => a !== right(d))!;

describe("trainer answers", () => {
  it("covers every seat first in, every open and every 3-bet pairing", () => {
    expect(ALL_SPOTS).toHaveLength(5 + 15 + 15);
    expect(new Set(ALL_SPOTS.map(spotId)).size).toBe(ALL_SPOTS.length);
    for (const s of ALL_SPOTS) if (s.villain) expect(s.villain).not.toBe(s.hero);
  });

  it("reads the right chart for each situation", () => {
    for (const s of ALL_SPOTS) {
      const { raiseText, callText } = spotCharts(s);
      if (s.kind === "first-in") {
        expect(raiseText).toBe(RFI_TEXT[s.hero as keyof typeof RFI_TEXT]);
        expect(callText).toBe("");
      } else if (s.kind === "vs-open") {
        const g = ["UTG", "HJ"].includes(s.villain!) ? "early" : "late";
        expect(raiseText).toBe(THREE_BET_TEXT[g]);
        expect(callText).toBe(s.hero === "BB" ? BB_DEFEND_TEXT[g] : CALL_OPEN_TEXT[g]);
        // The opener acts before hero.
        expect(POSITIONS.indexOf(s.villain!)).toBeLessThan(POSITIONS.indexOf(s.hero));
      } else {
        expect(raiseText).toBe(FOUR_BET_TEXT);
        expect(callText).toBe(CALL_THREE_BET_TEXT);
        // The 3-bettor acts after hero's open.
        expect(POSITIONS.indexOf(s.villain!)).toBeGreaterThan(POSITIONS.indexOf(s.hero));
      }
    }
  });

  it("gives every hand in every spot the action its charts give", () => {
    for (const s of ALL_SPOTS) {
      const { raiseText, callText } = spotCharts(s);
      const range = spotRange(s);
      for (const hand of ALL_CLASSES) {
        const expected = has(raiseText, hand) ? "raise" : callText && has(callText, hand) ? "call" : "fold";
        expect(correctAction(s, hand)).toBe(expected);
        expect(range.actions[hand]).toBe(expected);
        expect(range.raise[hand]).toBe(expected === "raise" ? 1 : 0);
        expect(range.call[hand]).toBe(expected === "call" ? 1 : 0);
      }
    }
  });

  it("agrees with the hand review on the same spot", () => {
    let compared = 0;
    for (const sample of SAMPLES) {
      const hand = parseHand(sample.text);
      const first = analyzeHand(hand, { iterations: 50 }).decisions[0];
      const hero = hand.players.find((p) => p.isHero)!.position as Spot["hero"];
      const advice = first.chart!;
      const cls = handClass(hand.heroCards[0], hand.heroCards[1]);
      const spot = ALL_SPOTS.find((s) => s.hero === hero && (advice.situation === `${hero} first in (open-raise or fold)` ? s.kind === "first-in" : s.kind === "vs-open" && advice.situation === `${hero} facing a ${s.villain} open`));
      if (!spot) continue;
      compared++;
      expect(correctAction(spot, cls)).toBe(advice.recommended);
    }
    expect(compared).toBeGreaterThan(2);
  });

  it("never calls first in: the chart raises or folds", () => {
    for (const hero of POSITIONS.slice(0, 5)) for (const hand of ALL_CLASSES) expect(correctAction(firstIn(hero), hand)).not.toBe("call");
  });
});

describe("trainer validation scenarios", () => {
  it("raises AA first in from every position", () => {
    for (const hero of POSITIONS.slice(0, 5)) expect(correctAction(firstIn(hero), "AA")).toBe("raise");
  });
  it("folds 72o under the gun", () => {
    expect(correctAction(firstIn("UTG"), "72o")).toBe("fold");
  });
  it("folds KJo to a 3-bet whoever made it", () => {
    for (const s of ALL_SPOTS.filter((x) => x.kind === "vs-3bet")) expect(correctAction(s, "KJo")).toBe("fold");
  });
  it("never folds AA or KK", () => {
    for (const s of ALL_SPOTS) for (const hand of ["AA", "KK"]) expect(correctAction(s, hand)).toBe("raise");
  });
  it("folds 72o everywhere", () => {
    for (const s of ALL_SPOTS) expect(correctAction(s, "72o")).toBe("fold");
  });
  it("opens wider from later positions, up to the button", () => {
    const seats = ["UTG", "HJ", "CO", "BTN"] as const;
    for (let i = 1; i < seats.length; i++) {
      const tight = spotRange(firstIn(seats[i - 1]));
      const loose = spotRange(firstIn(seats[i]));
      expect(loose.raisePct).toBeGreaterThan(tight.raisePct);
      for (const hand of ALL_CLASSES) if (tight.actions[hand] === "raise") expect(loose.actions[hand]).toBe("raise");
    }
  });
  it("continues with more hands in the big blind than in the cutoff against the same open", () => {
    const pct = (hero: Spot["hero"]) => {
      const r = spotRange({ kind: "vs-open", hero, villain: "UTG" });
      return r.raisePct + r.callPct;
    };
    expect(pct("BB")).toBeGreaterThan(pct("CO"));
  });
  it("continues with fewer hands against an early open than a late one", () => {
    const pct = (villain: Spot["villain"]) => {
      const r = spotRange({ kind: "vs-open", hero: "BB", villain });
      return r.raisePct + r.callPct;
    };
    expect(pct("UTG")).toBeLessThan(pct("BTN"));
  });
});

describe("trainer deal", () => {
  it("is deterministic for a seed", () => {
    const a = play(7, 200, right);
    const b = play(7, 200, right);
    expect(a.deals).toEqual(b.deals);
    expect(a.progress).toEqual(b.progress);
    expect(dealSpot(newProgress(7))).toEqual(dealSpot(newProgress(7)));
  });

  it("changes with the seed", () => {
    const key = (d: Deal) => `${spotId(d.spot)}|${d.hand}`;
    expect(play(1, 30, right).deals.map(key)).not.toEqual(play(2, 30, right).deals.map(key));
  });

  it("deals only real spots, with cards that match the hand and an answer from the charts", () => {
    for (const seed of [1, 2, 3]) {
      for (const d of play(seed, 400, seed === 2 ? wrong : right).deals) {
        expect(ALL_SPOTS.map(spotId)).toContain(spotId(d.spot));
        expect(handClass(d.cards[0], d.cards[1])).toBe(d.hand);
        expect(dealableHands(d.spot)).toContain(d.hand);
        const { raiseText, callText } = spotCharts(d.spot);
        const expected = has(raiseText, d.hand) ? "raise" : callText && has(callText, d.hand) ? "call" : "fold";
        expect(correctAction(d.spot, d.hand)).toBe(expected);
        expect(describeSpot(d.spot).length).toBeGreaterThan(10);
        expect(explain(d.spot, d.hand)).toContain(d.hand);
      }
    }
  });

  it("only deals a 3-bet spot with a hand hero would have opened", () => {
    const deals = play(11, 600, right).deals.filter((d) => d.spot.kind === "vs-3bet");
    expect(deals.length).toBeGreaterThan(50);
    for (const d of deals) expect(correctAction(firstIn(d.spot.hero), d.hand)).toBe("raise");
  });

  it("deals hands near the edge of the range more often than an even deal would", () => {
    expect(edgeWeight(1)).toBeGreaterThan(edgeWeight(2));
    expect(edgeWeight(2)).toBeGreaterThan(edgeWeight(4));
    const fresh = play(5, 1500, right).deals.filter((d) => !d.review && d.spot.kind === "first-in");
    const dealtNear = fresh.filter((d) => spotRange(d.spot).edge[d.hand] <= 2).length / fresh.length;
    const spots = ALL_SPOTS.filter((s) => s.kind === "first-in");
    const evenNear = spots.reduce((sum, s) => sum + ALL_CLASSES.filter((h) => spotRange(s).edge[h] <= 2).length / ALL_CLASSES.length, 0) / spots.length;
    expect(dealtNear).toBeGreaterThan(evenNear + 0.2);
  });

  it("reaches every position", () => {
    const { progress } = play(3, 600, right);
    for (const p of POSITIONS) expect(progress.positions[p].seen).toBeGreaterThan(0);
  });
});

describe("trainer spaced repetition", () => {
  const start = newProgress(42);
  const deal = dealSpot(start);
  const key = `${spotId(deal.spot)}|${deal.hand}`;

  it("schedules a missed spot sooner than one answered correctly", () => {
    const missed = answerSpot(start, deal, wrong(deal));
    const known = answerSpot(start, deal, right(deal));
    expect(missed.correct).toBe(false);
    expect(known.correct).toBe(true);
    expect(missed.progress.items[key].due).toBeLessThan(known.progress.items[key].due);
  });

  it("brings a missed spot back within a few answers, before one that was answered correctly", () => {
    const turnsUntilBack = (first: "raise" | "call" | "fold") => {
      let progress = answerSpot(start, deal, first).progress;
      for (let i = 1; i <= 200; i++) {
        const next = dealSpot(progress);
        if (spotId(next.spot) === spotId(deal.spot) && next.hand === deal.hand) {
          expect(next.review).toBe(true);
          return i;
        }
        progress = answerSpot(progress, next, right(next)).progress;
      }
      return Infinity;
    };
    const missed = turnsUntilBack(wrong(deal));
    expect(missed).toBeLessThanOrEqual(5);
    expect(missed).toBeLessThan(turnsUntilBack(right(deal)));
  });

  it("does not repeat a spot on the very next deal", () => {
    const { deals } = play(9, 300, wrong);
    for (let i = 1; i < deals.length; i++) expect(`${spotId(deals[i].spot)}|${deals[i].hand}`).not.toBe(`${spotId(deals[i - 1].spot)}|${deals[i - 1].hand}`);
  });

  it("spaces a spot further apart each time it is answered correctly, then retires it", () => {
    let progress: TrainerProgress = answerSpot(start, deal, wrong(deal)).progress;
    let lastGap = 0;
    for (let i = 0; i < RETIRED_BOX; i++) {
      expect(progress.items[key].box).toBe(i);
      const gap = progress.items[key].due - progress.turn;
      expect(gap).toBeGreaterThan(lastGap);
      lastGap = gap;
      progress = answerSpot({ ...progress, turn: progress.items[key].due }, deal, right(deal)).progress;
    }
    expect(progress.items[key].box).toBe(RETIRED_BOX);
    expect(dueItems({ ...progress, turn: progress.turn + 10_000 })).not.toContain(key);
  });

  it("sends a learned spot back to the start when it is missed", () => {
    const known = answerSpot(start, deal, right(deal)).progress;
    expect(answerSpot(known, deal, wrong(deal)).progress.items[key].box).toBe(0);
  });

  it("keeps an accuracy record per position without mutating its input", () => {
    const before = JSON.stringify(start);
    const missed = answerSpot(start, deal, wrong(deal)).progress;
    const known = answerSpot(start, deal, right(deal)).progress;
    expect(JSON.stringify(start)).toBe(before);
    expect(missed.positions[deal.spot.hero]).toEqual({ seen: 1, correct: 0 });
    expect(known.positions[deal.spot.hero]).toEqual({ seen: 1, correct: 1 });
    const { progress } = play(4, 250, (d) => (d.hand < "K" ? right(d) : wrong(d)));
    const seen = POSITIONS.reduce((n, p) => n + progress.positions[p].seen, 0);
    expect(seen).toBe(250);
    expect(progress.turn).toBe(250);
    for (const p of POSITIONS) expect(progress.positions[p].correct).toBeLessThanOrEqual(progress.positions[p].seen);
  });

  it("flags hands on the edge of the chart as borderline", () => {
    const utg = firstIn("UTG");
    const hand = (h: string): Deal => ({ spot: utg, hand: h, cards: [0, 1], review: false });
    expect(answerSpot(start, hand("44"), "raise").borderline).toBe(true);
    expect(answerSpot(start, hand("33"), "fold").borderline).toBe(true);
    expect(answerSpot(start, hand("AA"), "raise").borderline).toBe(false);
    expect(answerSpot(start, hand("72o"), "fold").borderline).toBe(false);
  });
});

describe("trainer stored progress", () => {
  it("round-trips through JSON", () => {
    const { progress } = play(8, 120, (d) => (d.hand.endsWith("s") ? wrong(d) : right(d)));
    expect(parseProgress(JSON.stringify(progress))).toEqual(progress);
  });
  it("rejects missing or malformed storage", () => {
    for (const bad of [null, undefined, "", "not json", "null", "[]", "{}", '{"version":2,"seed":1,"turn":0}', '{"version":1,"seed":-1,"turn":0}', '{"version":1,"seed":1,"turn":"x"}']) {
      expect(parseProgress(bad)).toBeNull();
    }
  });
  it("drops entries it does not recognise and keeps the rest", () => {
    const stored = { version: 1, seed: 5, turn: 9, items: { "first-in:UTG|44": { box: 1, due: 12 }, "first-in:BB|44": { box: 1, due: 12 }, "first-in:UTG|ZZ": { box: 1, due: 3 }, "first-in:UTG|55": { box: "x" } }, positions: { UTG: { seen: 4, correct: 3 }, HJ: { seen: 1, correct: 2 }, XX: { seen: 1, correct: 1 } } };
    const p = parseProgress(JSON.stringify(stored))!;
    expect(Object.keys(p.items)).toEqual(["first-in:UTG|44"]);
    expect(p.positions.UTG).toEqual({ seen: 4, correct: 3 });
    expect(p.positions.HJ).toEqual({ seen: 0, correct: 0 });
    expect(Object.keys(p.positions)).toEqual([...POSITIONS]);
    expect(() => dealSpot(p)).not.toThrow();
  });
});
