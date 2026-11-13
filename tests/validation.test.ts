import { describe, expect, it } from "vitest";
import { analyzeHand, Decision } from "../src/lib/poker/analyze";
import { HandParseError, assignPositions, parseHand } from "../src/lib/poker/parser";
import { SAMPLES } from "../src/lib/poker/samples";

/**
 * Validation scenarios: hands where the right answer is not in dispute.
 * If a change to ranges or thresholds flips one of these, the output has become
 * strategically inconsistent and the change needs a second look.
 */
const run = (id: string, opts = {}) => analyzeHand(parseHand(SAMPLES.find((s) => s.id === id)!.text), opts);
const at = (ds: Decision[], street: string, type: string) => ds.find((d) => d.street === street && d.action.type === type)!;

describe("parser", () => {
  it("reads seats, positions, cards and actions", () => {
    const h = parseHand(SAMPLES[0].text);
    expect(h.players).toHaveLength(6);
    expect(h.bb).toBe(1);
    expect(h.sb).toBe(0.5);
    expect(h.players.find((p) => p.isHero)!.position).toBe("BTN");
    expect(h.players.find((p) => p.name === "TiltedTom")!.position).toBe("BB");
    expect(h.players.find((p) => p.name === "riverrat_88")!.position).toBe("UTG");
    expect(h.board).toHaveLength(5);
    expect(h.returned[0].amount).toBe(16);
  });
  it("reads tournament hands with antes", () => {
    const h = parseHand(SAMPLES.find((s) => s.id === "mtt-short-stack")!.text);
    expect(h.isTournament).toBe(true);
    expect(h.bb).toBe(800);
    expect(h.actions.filter((a) => a.post === "ante")).toHaveLength(6);
  });
  it("names positions for every table size", () => {
    expect(assignPositions([1, 2], 1)).toEqual({ 1: "BTN/SB", 2: "BB" });
    expect(Object.values(assignPositions([1, 2, 3, 4, 5, 6], 4))).toEqual(["UTG", "HJ", "CO", "BTN", "SB", "BB"]);
    expect(Object.values(assignPositions([1, 2, 3, 4, 5, 6, 7, 8, 9], 9))).toContain("UTG+1");
  });
  it("explains what is wrong with bad input", () => {
    expect(() => parseHand("hello")).toThrow(HandParseError);
    expect(() => parseHand(SAMPLES[0].text.replace("Hold'em No Limit", "Omaha Pot Limit"))).toThrow(/Hold'em/);
  });
});

describe("pot accounting", () => {
  it("tracks the pot, price and net result", () => {
    const a = run("river-lead");
    const river = at(a.decisions, "river", "fold");
    expect(river.pot).toBeCloseTo(38.5);
    expect(river.toCall).toBe(16);
    expect(river.potOdds).toBeCloseTo(16 / 54.5);
    expect(a.summary.netBb).toBeCloseTo(-11);
    expect(run("kjo-3bet-pot").summary.netBb).toBeCloseTo(-100);
    expect(run("mtt-short-stack").summary.netBb).toBeCloseTo((19600 - 9400) / 800);
  });
  it("computes SPR on the flop", () => {
    const flop = at(run("kjo-3bet-pot").decisions, "flop", "check");
    expect(flop.spr).toBeCloseTo(92 / 17.5);
  });
});

describe("validation scenarios", () => {
  it("flags calling a 3-bet with a dominated offsuit hand", () => {
    const d = run("kjo-3bet-pot").decisions[1];
    expect(d.verdict).toBe("mistake");
    expect(d.chart!.recommended).toBe("fold");
  });
  it("flags a one-pair call against a river shove in a 3-bet pot and quantifies it", () => {
    const d = at(run("kjo-3bet-pot").decisions, "river", "call");
    expect(d.verdict).toBe("mistake");
    expect(d.exact).toBe(true);
    expect(d.evLossBb!).toBeGreaterThan(10);
  });
  it("says a turn flush draw without the price needs implied odds", () => {
    const d = at(run("flush-draw-price").decisions, "turn", "call");
    expect(d.equity!).toBeLessThan(d.potOdds!);
    expect(d.equity!).toBeGreaterThan(0.15);
    expect(d.verdict).toBe("inaccuracy");
    expect(d.evLossBb).toBeUndefined();
  });
  it("approves folding a busted draw", () => {
    expect(at(run("flush-draw-price").decisions, "river", "fold").verdict).toBe("good");
  });
  it("flags checking back a set on the river", () => {
    const d = at(run("missed-value").decisions, "river", "check");
    expect(d.verdict).toBe("inaccuracy");
    expect(d.equity!).toBeGreaterThan(0.95);
  });
  it("treats JJ against a tight 4-bet shove as a losing call", () => {
    const d = run("jj-vs-jam").decisions[1];
    expect(d.exact).toBe(true);
    expect(d.equity!).toBeGreaterThan(0.37);
    expect(d.equity!).toBeLessThan(0.43);
    expect(d.verdict).toBe("mistake");
  });
  it("never flags a standard open or a value bet with a strong hand", () => {
    for (const s of SAMPLES) {
      for (const d of run(s.id).decisions) {
        if ((d.action.type === "bet" || d.action.type === "raise") && (d.equity ?? 0) > 0.8) expect(d.verdict).toBe("good");
      }
    }
  });
});

describe("consistency properties", () => {
  it("gives identical output on repeated runs", () => {
    expect(JSON.stringify(run("river-lead").decisions)).toBe(JSON.stringify(run("river-lead").decisions));
  });
  it("gives a bluff-catcher more equity against opponents who bluff more", () => {
    const e = (profile: string) => at(run("river-lead", { profile }).decisions, "river", "fold").equity!;
    expect(e("passive")).toBeLessThan(e("standard"));
    expect(e("standard")).toBeLessThan(e("aggressive"));
  });
  it("gives more equity against a wider shoving range", () => {
    const tight = run("mtt-short-stack").decisions[1];
    const wide = run("mtt-short-stack", { rangeOverrides: { short_shover: "22+, A2s+, K9s+, QTs+, JTs, A7o+, KTo+, QJo" } }).decisions[1];
    expect(wide.equity!).toBeGreaterThan(tight.equity! + 0.05);
    expect(wide.verdict).toBe("good");
    expect(wide.villains[0].custom).toBe(true);
  });
  it("keeps every equity inside 0..1 and every price consistent", () => {
    for (const s of SAMPLES) {
      for (const d of run(s.id).decisions) {
        if (d.equity !== undefined) {
          expect(d.equity).toBeGreaterThanOrEqual(0);
          expect(d.equity).toBeLessThanOrEqual(1);
        }
        if (d.potOdds !== undefined) expect(d.potOdds).toBeCloseTo(d.toCall / (d.pot + d.toCall));
        if (d.evCall !== undefined) expect(d.evCall > 0).toBe(d.equity! > d.potOdds!);
      }
    }
  });
});
