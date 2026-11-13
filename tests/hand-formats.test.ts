import { describe, expect, it } from "vitest";
import { analyzeHand } from "../src/lib/poker/analyze";
import { detectFormat, parseHand, type ParsedHand } from "../src/lib/poker/parser";
import { importSession, splitSession } from "../src/lib/poker/session";
import { SAMPLES } from "../src/lib/poker/samples";
import { GG_HAND, GG_RUN_IT_TWICE, P888_HAND, P888_TOURNAMENT, STARS_HAND } from "./fixtures/hand-formats";

/** Everything except what names the site: the id, the site and the table. */
const content = (h: ParsedHand) => {
  const { id, site, table, ...rest } = h;
  void [id, site, table];
  return rest;
};

/** Chips put in minus chips returned, for every player. */
function netInvested(h: ParsedHand): number {
  const committed: Record<string, number> = {};
  let total = 0;
  let street = "";
  for (const a of h.actions) {
    if (a.street !== street) {
      street = a.street;
      for (const k of Object.keys(committed)) committed[k] = 0;
    }
    const before = committed[a.player] ?? 0;
    const add = a.type === "raise" ? (a.to ?? 0) - before : a.amount;
    if (a.post !== "ante") committed[a.player] = before + add;
    total += add;
  }
  return Math.round((total - h.returned.reduce((s, r) => s + r.amount, 0)) * 100) / 100;
}

describe("format detection", () => {
  it("names the site from the header", () => {
    expect(detectFormat(STARS_HAND)).toBe("pokerstars");
    expect(detectFormat(GG_HAND)).toBe("ggpoker");
    expect(detectFormat(P888_HAND)).toBe("888poker");
    expect(detectFormat(P888_HAND.split("\n").slice(1).join("\n"))).toBe("888poker");
    expect(detectFormat("﻿" + GG_HAND)).toBe("ggpoker");
    expect(detectFormat("just some text\nwith no header")).toBeNull();
  });
  it("labels each parsed hand with its site", () => {
    expect([STARS_HAND, GG_HAND, P888_HAND].map((t) => parseHand(t).site)).toEqual(["PokerStars", "GGPoker", "888poker"]);
    expect(parseHand(GG_HAND).id).toBe("RC2500000101");
    expect(parseHand(P888_HAND).id).toBe("2500000101");
  });
});

describe("the same hand from three sites", () => {
  const stars = parseHand(STARS_HAND);
  const gg = parseHand(GG_HAND);
  const p888 = parseHand(P888_HAND);

  it("parses to the same hand", () => {
    expect(content(gg)).toEqual(content(stars));
    expect(content(p888)).toEqual(content(stars));
  });

  it("derives 888's raise totals, all-in and uncalled bet from the stacks", () => {
    const raises = p888.actions.filter((a) => a.type === "raise").map((a) => [a.player, a.amount, a.to]);
    expect(raises).toEqual([["Hero", 1.5, 2.5], ["bb_guy", 6.5, 9], ["Hero", 17, 25]]);
    expect(p888.actions.at(-1)).toMatchObject({ player: "bb_guy", type: "call", amount: 30, allIn: true });
    expect(p888.returned).toEqual([{ player: "Hero", amount: 10, afterAction: p888.actions.length }]);
  });

  it("gives the same review once the hand id, which seeds the simulation, is the same", () => {
    const review = (h: ParsedHand) => analyzeHand({ ...h, id: "same" }, { iterations: 500 }).decisions.map((d) => [d.street, d.action.type, d.verdict, d.equity, d.evCall]);
    expect(review(gg)).toEqual(review(stars));
    expect(review(p888)).toEqual(review(stars));
  });

  it("puts in exactly what the winner collects plus the rake", () => {
    for (const h of [stars, gg, p888]) expect(netInvested(h)).toBe(128.5);
  });
});

describe("888poker details", () => {
  const t = parseHand(P888_TOURNAMENT);

  it("reads a tournament: chip amounts with thousands separators, antes, no currency", () => {
    expect(t).toMatchObject({ isTournament: true, currency: "", sb: 50, bb: 100, table: "293965397 3", hero: "Hero", game: "NLHE tournament" });
    expect(t.players.find((p) => p.isHero)).toMatchObject({ stack: 4200, position: "BB" });
    expect(t.actions.filter((a) => a.post === "ante" && a.amount === 12)).toHaveLength(5);
  });

  it("splits a dead blind into dead money and a live big blind", () => {
    const larry = t.actions.filter((a) => a.player === "late_larry" && a.type === "post").map((a) => [a.post, a.amount]);
    expect(larry).toEqual([["ante", 12], ["ante", 50], ["bb", 100]]);
  });

  it("returns the part of a raise nobody called", () => {
    expect(t.actions.find((a) => a.player === "Hero" && a.type === "raise")).toMatchObject({ to: 800, amount: 550 });
    expect(t.returned).toEqual([{ player: "Hero", amount: 550, afterAction: t.actions.length }]);
    expect(netInvested(t)).toBe(t.collected.Hero);
  });

  it("rejects games other than No-Limit Hold'em", () => {
    expect(() => parseHand(P888_HAND.replace("No Limit Holdem", "Pot Limit Omaha"))).toThrow(/Hold'em/);
    expect(() => parseHand(P888_HAND.replace("No Limit Holdem", "Fixed Limit Holdem"))).toThrow(/No-Limit/);
  });

  it("explains a hand where nobody was dealt visible cards", () => {
    expect(() => parseHand(P888_HAND.replace("Dealt to Hero [ Ah, Qh ]\n", ""))).toThrow(/Dealt to/);
  });
});

describe("GGPoker details", () => {
  it("uses the first board of a run-it-twice hand and adds both halves of the pot", () => {
    const h = parseHand(GG_RUN_IT_TWICE);
    expect(h.board).toHaveLength(5);
    expect(h.board).toEqual(parseHand(GG_RUN_IT_TWICE.replace(/\*\*\* SECOND .*\n/g, "")).board);
    expect(h.collected).toEqual({ Hero: 175.5, shove_sid: 175.5 });
    expect(h.shown.shove_sid).toHaveLength(2);
  });
  it("finds Hero among the Dealt to lines of every player", () => {
    expect(parseHand(GG_HAND.replace("Dealt to vill_a\n", "Dealt to vill_a \n")).hero).toBe("Hero");
  });
});

describe("session import across formats", () => {
  const p888NoGameNo = P888_HAND.split("\n").slice(1).join("\n").replace(/2500000101/g, "2500000199");
  const file = ["﻿" + STARS_HAND, GG_HAND, P888_HAND, P888_TOURNAMENT, p888NoGameNo, P888_HAND].join("\n\n\n");

  it("splits each hand on its own header, keeping 888's two header lines together", () => {
    const blocks = splitSession(file);
    expect(blocks).toHaveLength(6);
    expect(blocks[2].startsWith("#Game No : 2500000101\n***** 888poker")).toBe(true);
    expect(blocks[4].startsWith("***** 888poker Hand History for Game 2500000199")).toBe(true);
  });

  it("imports every format and skips a repeated 888 hand by its game number", () => {
    const r = importSession(file);
    expect(r.hands.map((h) => h.hand.site)).toEqual(["PokerStars", "GGPoker", "888poker", "888poker", "888poker"]);
    expect(r.failed).toEqual([expect.objectContaining({ position: 6, handId: "2500000101", reason: expect.stringMatching(/Duplicate/) })]);
  });
});

describe("PokerStars is unchanged", () => {
  it("still parses every sample hand as PokerStars", () => {
    for (const s of SAMPLES) expect(parseHand(s.text).site).toBe("PokerStars");
  });
});
