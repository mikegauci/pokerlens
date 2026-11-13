import { describe, expect, it } from "vitest";
import { mulberry32, parseCards } from "../src/lib/poker/cards";
import { CATEGORY, categoryOf, describeHand, evaluate } from "../src/lib/poker/evaluator";
import { equityVsRanges } from "../src/lib/poker/equity";
import { expandRange, mustParse, parseRange, rangePercent } from "../src/lib/poker/ranges";
import { RFI_TEXT, chart } from "../src/lib/poker/charts";

const ev = (s: string) => evaluate(parseCards(s));
const eq = (hero: string, range: string, board = "", n = 40000) =>
  equityVsRanges(parseCards(hero), parseCards(board), [expandRange(mustParse(range), parseCards(hero + board))], n, mulberry32(7)).equity;

describe("hand evaluator", () => {
  it("ranks every category in order", () => {
    const hands = [
      "Ah Kd 9c 7s 4h 3d 2c", // high card
      "Ah Ad 9c 7s 4h 3d 2c", // pair
      "Ah Ad 9c 9s 4h 3d 2c", // two pair
      "Ah Ad Ac 7s 4h 3d 2c", // trips
      "5h 4d 3c 2s Ah Kd Qc", // wheel
      "Ah Jh 9h 7h 4h 3d 2c", // flush
      "Ah Ad Ac 7s 7h 3d 2c", // full house
      "Ah Ad Ac As 7h 3d 2c", // quads
      "9h 8h 7h 6h 5h Ad Ac", // straight flush
    ];
    const scores = hands.map(ev);
    scores.forEach((s, i) => expect(categoryOf(s)).toBe(i));
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThan(scores[i - 1]);
  });
  it("uses kickers and picks the best five", () => {
    expect(ev("Ah Kd Kc 7s 4h 3d 2c")).toBeGreaterThan(ev("Qh Kd Kc 7s 4h 3d 2c"));
    expect(ev("Ah Kd 7c 7s 4h 4d 2c")).toBe(ev("Ac Kh 7d 7h 4s 4c 3c"));
    expect(ev("6h 5d 4c 3s 2h Ad Kc")).toBeGreaterThan(ev("5h 4d 3c 2s Ah Kd Qc"));
    expect(categoryOf(ev("Ah Ad Ac Kh Kd Ks 2c"))).toBe(CATEGORY.FULL_HOUSE);
    // Three pair plays the top two with the best kicker.
    expect(ev("Ah Ad Kc Ks Qh Qd 2c")).toBe(ev("Ac As Kh Kd Qc 7d 2c"));
  });
  it("describes holdings in plain English", () => {
    expect(describeHand(parseCards("Ah Jh"), parseCards("Js 8d 3c"))).toContain("top pair");
    expect(describeHand(parseCards("7h 6h"), parseCards("Kh 9h 2c"))).toContain("flush draw");
    expect(describeHand(parseCards("9c 9d"), parseCards("9h 6s 2d"))).toContain("set of Nines");
    expect(describeHand(parseCards("Qc Qd"), parseCards("9h 6s 2d"))).toContain("overpair");
    expect(describeHand(parseCards("Jc Td"), parseCards("9h 8s 2d"))).toContain("open-ended");
  });
});

describe("range notation", () => {
  it("expands plus, dash and weighted tokens", () => {
    expect([...mustParse("QQ+").keys()].sort()).toEqual(["AA", "KK", "QQ"]);
    expect([...mustParse("ATs+").keys()].sort()).toEqual(["AJs", "AKs", "AQs", "ATs"]);
    expect([...mustParse("A5s-A2s").keys()].sort()).toEqual(["A2s", "A3s", "A4s", "A5s"]);
    expect([...mustParse("JJ-99").keys()].sort()).toEqual(["99", "JJ", "TT"]);
    expect(mustParse("AK").size).toBe(2);
    expect(mustParse("AA:0.3").get("AA")).toBe(0.3);
    expect(parseRange("AKz, 72o").errors).toHaveLength(1);
  });
  it("counts combos with card removal", () => {
    expect(expandRange(mustParse("AA"))).toHaveLength(6);
    expect(expandRange(mustParse("AKs"))).toHaveLength(4);
    expect(expandRange(mustParse("AKo"))).toHaveLength(12);
    expect(expandRange(mustParse("AA"), parseCards("Ah"))).toHaveLength(3);
    expect(expandRange(mustParse("random"))).toHaveLength(1326);
  });
  it("keeps opening ranges wider in later position", () => {
    const p = (pos: keyof typeof RFI_TEXT) => rangePercent(chart(RFI_TEXT[pos]));
    expect(p("UTG")).toBeLessThan(p("HJ"));
    expect(p("HJ")).toBeLessThan(p("CO"));
    expect(p("CO")).toBeLessThan(p("BTN"));
    expect(p("UTG")).toBeGreaterThan(0.12);
    expect(p("BTN")).toBeLessThan(0.5);
    // Every hand opened from an earlier seat is also opened from a later one.
    const order = ["UTG", "HJ", "CO", "BTN"] as const;
    for (let i = 1; i < order.length; i++) {
      for (const cls of chart(RFI_TEXT[order[i - 1]]).keys()) expect(chart(RFI_TEXT[order[i]]).has(cls), `${cls} ${order[i]}`).toBe(true);
    }
  });
});

describe("equity against known benchmarks", () => {
  const close = (got: number, want: number, tol = 0.012) => expect(Math.abs(got - want)).toBeLessThan(tol);
  it("AA vs KK is about 82%", () => close(eq("Ah Ad", "KK"), 0.82));
  it("AKs vs QQ is about 46%", () => close(eq("Ah Kh", "QQ"), 0.46));
  it("AKo vs a random hand is about 65%", () => close(eq("Ah Kd", "random"), 0.65));
  it("72o vs a random hand is about 35%", () => close(eq("7h 2d", "random"), 0.35));
  it("JJ vs QQ+, AK is about 36%", () => close(eq("Js Jc", "QQ+, AKs, AKo"), 0.363, 0.015));
  it("a flopped flush draw vs top pair is about 36%", () => close(eq("7h 6h", "AK", "Kh 9h 2c"), 0.36, 0.03));
  it("the nuts on the river has 100%", () => expect(eq("Ah Kh", "random", "Qh Jh Th 2c 3d", 2000)).toBe(1));
  it("is deterministic for a given seed", () => expect(eq("Ah Kd", "TT+, AQs+", "", 3000)).toBe(eq("Ah Kd", "TT+, AQs+", "", 3000)));
});
