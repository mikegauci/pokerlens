import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Decision } from "../src/lib/poker/analyze";
import {
  BASELINE,
  LOSS_BUCKETS,
  MIN_BETS,
  MIN_MEASURED,
  PLAYERS,
  SIZE_BUCKETS,
  baselineOf,
  isMeasured,
  lossBb,
  playerProfile,
  round,
  signalsOf,
  type IntegrityProfile,
} from "../src/lib/poker/integrity";
import { LAB_DATA } from "../src/lib/poker/integrity-data";
import { makeSampleSession, makeStyledSession } from "../src/lib/poker/sample-session";

const decision = (street: Decision["street"], type: Decision["action"]["type"], toCall: number, evCall?: number) =>
  ({ street, toCall, evCall, action: { type } }) as unknown as Decision;

const profile = (over: Partial<IntegrityProfile>): IntegrityProfile => ({
  hands: 1000, losses: Array(50).fill(0), lossShares: [], agreement: 0.7, meanLossBb: 1, sizes: Array(50).fill(0.5), sizeShares: [], modalSizeShare: 0.3, ...over,
});

const stored = (id: string) => LAB_DATA.players.find((p) => p.id === id)!;

describe("EV lost per decision", () => {
  it("is zero when the player takes the better of call and fold, and the EV gap otherwise", () => {
    expect(lossBb(decision("river", "call", 16, 14), 1)).toBe(0);
    expect(lossBb(decision("river", "fold", 16, 14), 1)).toBe(14);
    expect(lossBb(decision("river", "call", 16, -5), 1)).toBe(5);
    expect(lossBb(decision("river", "fold", 16, -5), 1)).toBe(0);
    expect(lossBb(decision("turn", "fold", 200, 300), 100)).toBe(3);
  });
  it("measures only calls and folds facing a postflop bet", () => {
    expect(isMeasured(decision("river", "fold", 16, 14))).toBe(true);
    expect(isMeasured(decision("flop", "call", 2, -1))).toBe(true);
    expect(isMeasured(decision("preflop", "call", 2, 1))).toBe(false);
    expect(isMeasured(decision("river", "bet", 0))).toBe(false);
    expect(isMeasured(decision("turn", "check", 0))).toBe(false);
    expect(isMeasured(decision("turn", "raise", 4, 2))).toBe(false);
  });
});

describe("signals", () => {
  const baseline = baselineOf([profile({ agreement: 0.6, meanLossBb: 2, modalSizeShare: 0.25 }), profile({ agreement: 0.75, meanLossBb: 0.8, modalSizeShare: 0.35 })]);
  it("flag only a player outside the whole baseline range", () => {
    expect(signalsOf(profile({ agreement: 0.95, meanLossBb: 0.1, modalSizeShare: 0.9 }), baseline)).toEqual({ closeToEngine: "flag", uniformSizing: "flag" });
    expect(signalsOf(profile({ agreement: 0.75, meanLossBb: 0.8, modalSizeShare: 0.35 }), baseline)).toEqual({ closeToEngine: "normal", uniformSizing: "normal" });
  });
  it("need both high agreement and low loss to call play close to the engine", () => {
    expect(signalsOf(profile({ agreement: 0.95, meanLossBb: 1.5 }), baseline).closeToEngine).toBe("normal");
    expect(signalsOf(profile({ agreement: 0.7, meanLossBb: 0.1 }), baseline).closeToEngine).toBe("normal");
  });
  it("say there is too little data instead of flagging a small sample", () => {
    const small = profile({ losses: Array(MIN_MEASURED - 1).fill(0), agreement: 1, meanLossBb: 0, sizes: Array(MIN_BETS - 1).fill(0.5), modalSizeShare: 1 });
    expect(signalsOf(small, baseline)).toEqual({ closeToEngine: "too-few", uniformSizing: "too-few" });
  });
});

describe("the checked-in lab", () => {
  it("flags the assisted player as close to the engine", () => {
    expect(stored("assisted").signals.closeToEngine).toBe("flag");
  });
  it("flags the bot's sizing but not its decisions", () => {
    expect(stored("bot").signals).toEqual({ closeToEngine: "normal", uniformSizing: "flag" });
  });
  it("does not flag the regular, who is not part of the baseline", () => {
    expect(stored("human").signals).toEqual({ closeToEngine: "normal", uniformSizing: "normal" });
    expect(BASELINE.some((b) => b.seed === PLAYERS.find((p) => p.id === "human")!.seed)).toBe(false);
  });
  it("has enough decisions and bets for every player to be judged", () => {
    for (const p of [...LAB_DATA.players.map((x) => x.profile), ...LAB_DATA.baselineProfiles]) {
      expect(p.losses.length).toBeGreaterThanOrEqual(MIN_MEASURED);
      expect(p.sizes.length).toBeGreaterThanOrEqual(MIN_BETS);
    }
  });
  it("has shares that add up to one", () => {
    for (const p of [...LAB_DATA.players.map((x) => x.profile), LAB_DATA.baseline]) {
      expect(p.lossShares).toHaveLength(LOSS_BUCKETS.length);
      expect(p.sizeShares).toHaveLength(SIZE_BUCKETS.length);
      expect(p.lossShares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
      expect(p.sizeShares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
    }
  });
  it("is consistent: the baseline and signals follow from the stored profiles", () => {
    expect(round(baselineOf(LAB_DATA.baselineProfiles))).toEqual(LAB_DATA.baseline);
    for (const p of LAB_DATA.players) expect(signalsOf(p.profile, LAB_DATA.baseline)).toEqual(p.signals);
  });
  it("is up to date: recomputing a baseline human and the bot gives the stored profiles", () => {
    expect(round(playerProfile(BASELINE[0], LAB_DATA.hands))).toEqual(LAB_DATA.baselineProfiles[0]);
    expect(round(playerProfile(PLAYERS.find((p) => p.id === "bot")!, LAB_DATA.hands))).toEqual(stored("bot").profile);
  }, 60_000);
});

describe("the simulator", () => {
  it("gives the same hands for the same seed and style", () => {
    const style = PLAYERS[0].style;
    expect(makeStyledSession(style, 7, 20)).toBe(makeStyledSession(style, 7, 20));
  });
  it("still produces the same sample session after the hero was made configurable", () => {
    expect(createHash("sha256").update(makeSampleSession()).digest("hex")).toBe("a88338d53bf902402f65fc856efc4219c3e125a75a9de8529c225816ca4b561b");
  });
});
