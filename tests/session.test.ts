import { beforeAll, describe, expect, it } from "vitest";
import { HandParseError, parseHand } from "../src/lib/poker/parser";
import { SAMPLE_CASH_HANDS, SAMPLE_TOURNAMENT_HANDS, makeSampleSession, sampleSession } from "../src/lib/poker/sample-session";
import {
  LeakReport,
  SPOT_ORDER,
  analyzeSession,
  importSession,
  preflopFacts,
  sessionSteps,
  splitSession,
  spotOf,
  wilson,
} from "../src/lib/poker/session";
import { analyzeHand } from "../src/lib/poker/analyze";

/**
 * Six $1 players. Button on `button`; Hero is always seat 4.
 * Button 1: seat 1 BTN, 2 SB, 3 BB, 4 UTG (Hero), 5 HJ, 6 CO.
 * Button 2: Hero is BB. Button 3: Hero is SB and seat 6 is UTG.
 */
function hh(id: number, button: number, cards: string, body: string): string {
  const names = ["Ann", "Bo", "Cy", "Hero", "Dee", "Eve"];
  const sbSeat = (button % 6) + 1;
  const bbSeat = (sbSeat % 6) + 1;
  return `PokerStars Hand #9000${id}:  Hold'em No Limit ($0.50/$1.00 USD) - 2026/11/13 10:00:00 ET
Table 'Test' 6-max Seat #${button} is the button
${names.map((n, i) => `Seat ${i + 1}: ${n} ($100 in chips)`).join("\n")}
${names[sbSeat - 1]}: posts small blind $0.50
${names[bbSeat - 1]}: posts big blind $1
*** HOLE CARDS ***
Dealt to Hero [${cards}]
${body.trim()}
*** SUMMARY ***`;
}

// Hand 1: Hero opens UTG, everyone folds. VPIP, PFR, no 3-bet opportunity.
const OPEN = hh(1, 1, "Ah Kh", `
Hero: raises $1.50 to $2.50
Dee: folds
Eve: folds
Ann: folds
Bo: folds
Cy: folds
Uncalled bet ($1.50) returned to Hero
Hero collected $2.50 from pot`);

// Hand 2: Hero folds UTG. An opportunity for VPIP and PFR, taken for neither.
const FOLD_FIRST_IN = hh(2, 1, "7c 2d", `
Hero: folds
Dee: folds
Eve: folds
Ann: folds
Bo: folds
Cy collected $1 from pot`);

// Hand 3: a walk. Hero is the big blind and never acts, so it is no opportunity at all.
const WALK = hh(3, 2, "9s 4s", `
Dee: folds
Eve: folds
Ann: folds
Bo: folds
Cy: folds
Uncalled bet ($0.50) returned to Hero
Hero collected $1 from pot`);

// Hand 4: Hero limps UTG. VPIP without PFR; no raise before Hero, so no 3-bet opportunity.
const LIMP = hh(4, 1, "5h 5d", `
Hero: calls $1
Dee: folds
Eve: folds
Ann: folds
Bo: folds
Cy: checks
*** FLOP *** [Kc 9d 2s]
Cy: bets $2
Hero: folds
Uncalled bet ($2) returned to Cy
Cy collected $2.50 from pot`);

// Hand 5: Hero in the small blind 3-bets a UTG open. VPIP, PFR, 3-bet opportunity taken.
const THREE_BET = hh(5, 3, "Qs Qh", `
Eve: raises $1.50 to $2.50
Ann: folds
Bo: folds
Cy: folds
Hero: raises $7.50 to $10
Dee: folds
Eve: folds
Uncalled bet ($7.50) returned to Hero
Hero collected $6 from pot`);

// Hand 6: Hero flats the open from the small blind. VPIP, no PFR, 3-bet opportunity declined.
const FLAT = hh(6, 3, "Jc Td", `
Eve: raises $1.50 to $2.50
Ann: folds
Bo: folds
Cy: folds
Hero: calls $2
Dee: folds
*** FLOP *** [As 8h 3c]
Hero: checks
Eve: bets $3
Hero: folds
Uncalled bet ($3) returned to Eve
Eve collected $6 from pot`);

// Hand 7: Hero folds to the open. 3-bet opportunity declined, no VPIP.
const FOLD_TO_OPEN = hh(7, 3, "8d 3c", `
Eve: raises $1.50 to $2.50
Ann: folds
Bo: folds
Cy: folds
Hero: folds
Dee: folds
Uncalled bet ($1.50) returned to Eve
Eve collected $3 from pot`);

// Hand 8: Hero opens and folds to a 3-bet. VPIP and PFR, but Hero faced two raises, never one: no 3-bet opportunity.
const OPEN_FOLD_TO_3BET = hh(8, 1, "Ad 9c", `
Hero: raises $1.50 to $2.50
Dee: raises $5.50 to $8
Eve: folds
Ann: folds
Bo: folds
Cy: folds
Hero: folds
Uncalled bet ($5.50) returned to Dee
Dee collected $6.50 from pot`);

// Hand 9: Hero checks the big blind behind a limp. An opportunity, but checking is not voluntary.
const BB_CHECK = hh(9, 2, "Th 6c", `
Dee: calls $1
Eve: folds
Ann: folds
Bo: folds
Cy: folds
Hero: checks
*** FLOP *** [Kd 7s 2h]
Hero: checks
Dee: bets $1.50
Hero: folds
Uncalled bet ($1.50) returned to Dee
Dee collected $2.50 from pot`);

const BUILT = [OPEN, FOLD_FIRST_IN, WALK, LIMP, THREE_BET, FLAT, FOLD_TO_OPEN, OPEN_FOLD_TO_3BET, BB_CHECK];
const BUILT_FILE = BUILT.join("\n\n\n");

const BROKEN = `PokerStars Hand #90099:  Hold'em No Limit ($0.50/$1.00 USD) - 2026/11/13 10:00:00 ET
Table 'Test' 6-max Seat #1 is the button
Seat 1: Ann ($100 in chips)
Seat 4: Hero ($100 in chips)
Ann: posts small blind $0.50
Hero: posts big blind $1
*** HOLE CARDS ***
Ann: folds`;

describe("splitting a session file", () => {
  it("splits on hand headers whatever the spacing and line endings", () => {
    const messy = "﻿" + [OPEN, FOLD_FIRST_IN, WALK].join("\r\n\r\n\r\n\r\n").replace(/\n/g, "\r\n") + "\n\n";
    const blocks = splitSession(messy);
    expect(blocks).toHaveLength(3);
    expect(blocks.map((b) => b.match(/Hand #(\d+)/)![1])).toEqual(["90001", "90002", "90003"]);
    expect(blocks.every((b) => !b.includes("\r") && !b.startsWith("﻿"))).toBe(true);
  });

  it("splits hands with no blank line between them", () => {
    expect(splitSession(OPEN + "\n" + FOLD_FIRST_IN)).toHaveLength(2);
  });

  it("keeps text before the first header as its own block so it can be reported", () => {
    const r = importSession("exported from my tracker\n\n" + OPEN);
    expect(r.blocks).toBe(2);
    expect(r.hands).toHaveLength(1);
    expect(r.failed).toEqual([expect.objectContaining({ position: 1, handId: null })]);
  });

  it("returns nothing for an empty file", () => {
    expect(importSession("  \n\n ").blocks).toBe(0);
  });
});

describe("importing with bad hands", () => {
  it("reports a malformed hand with its reason and imports the rest", () => {
    const file = [OPEN, BROKEN, THREE_BET, FLAT].join("\n\n");
    const { report } = analyzeSession(file);
    expect(report.blocks).toBe(4);
    expect(report.imported).toBe(3);
    expect(report.analysed).toBe(3);
    expect(report.failed).toHaveLength(1);
    expect(report.failed[0]).toMatchObject({ position: 2, handId: "90099" });
    expect(report.failed[0].reason).toMatch(/Dealt to/);
  });

  it("skips a duplicated hand instead of counting it twice", () => {
    const r = importSession([OPEN, FLAT, OPEN].join("\n\n"));
    expect(r.hands).toHaveLength(2);
    expect(r.failed[0].position).toBe(3);
    expect(r.failed[0].reason).toMatch(/Duplicate/);
  });

  it("accepts a walk for session stats, which single-hand review rejects", () => {
    expect(() => parseHand(WALK)).toThrow(HandParseError);
    const r = importSession(WALK);
    expect(r.hands).toHaveLength(1);
    expect(r.failed).toHaveLength(0);
  });
});

describe("VPIP, PFR and 3-bet on a hand-built set", () => {
  const facts = (text: string) => preflopFacts(parseHand(text, { allowNoDecision: true }));

  it("reads each hand as constructed", () => {
    expect(facts(OPEN)).toEqual({ hadDecision: true, vpip: true, pfr: true, threeBetOpportunity: false, threeBet: false });
    expect(facts(FOLD_FIRST_IN)).toEqual({ hadDecision: true, vpip: false, pfr: false, threeBetOpportunity: false, threeBet: false });
    expect(facts(WALK)).toEqual({ hadDecision: false, vpip: false, pfr: false, threeBetOpportunity: false, threeBet: false });
    expect(facts(LIMP)).toEqual({ hadDecision: true, vpip: true, pfr: false, threeBetOpportunity: false, threeBet: false });
    expect(facts(THREE_BET)).toEqual({ hadDecision: true, vpip: true, pfr: true, threeBetOpportunity: true, threeBet: true });
    expect(facts(FLAT)).toEqual({ hadDecision: true, vpip: true, pfr: false, threeBetOpportunity: true, threeBet: false });
    expect(facts(FOLD_TO_OPEN)).toEqual({ hadDecision: true, vpip: false, pfr: false, threeBetOpportunity: true, threeBet: false });
    expect(facts(OPEN_FOLD_TO_3BET)).toEqual({ hadDecision: true, vpip: true, pfr: true, threeBetOpportunity: false, threeBet: false });
    expect(facts(BB_CHECK)).toEqual({ hadDecision: true, vpip: false, pfr: false, threeBetOpportunity: false, threeBet: false });
  });

  it("aggregates over opportunities, leaving the walk out", () => {
    const { report } = analyzeSession(BUILT_FILE);
    expect(report.imported).toBe(9);
    expect(report.noDecision).toBe(1);
    expect(report.analysed).toBe(8);
    expect(report.stats.vpip).toMatchObject({ count: 5, opportunities: 8, value: 5 / 8 });
    expect(report.stats.pfr).toMatchObject({ count: 3, opportunities: 8, value: 3 / 8 });
    expect(report.stats.threeBet).toMatchObject({ count: 1, opportunities: 3, value: 1 / 3 });
    expect(report.stats.threeBet.unreliable).toBe(true);
    expect(report.smallSample).toBe(true);
  });

  it("gives no rate rather than zero when there was no opportunity", () => {
    const { report } = analyzeSession([OPEN, LIMP].join("\n\n"));
    expect(report.stats.threeBet).toMatchObject({ count: 0, opportunities: 0, value: null, interval: null });
  });

  it("PFR never exceeds VPIP", () => {
    const { report } = analyzeSession(BUILT_FILE);
    expect(report.stats.pfr.count).toBeLessThanOrEqual(report.stats.vpip.count);
  });
});

describe("spot types", () => {
  const spots = (text: string) => {
    const hand = parseHand(text);
    return analyzeHand(hand, { iterations: 200 }).decisions.map((d) => spotOf(hand, d));
  };

  it("classifies decisions by the raises before them and the street", () => {
    expect(spots(OPEN)).toEqual(["pf_unopened"]);
    expect(spots(THREE_BET)).toEqual(["pf_vs_open"]);
    expect(spots(OPEN_FOLD_TO_3BET)).toEqual(["pf_unopened", "pf_vs_3bet"]);
    expect(spots(LIMP)).toEqual(["pf_unopened", "post_facing_bet"]);
    expect(spots(FLAT)).toEqual(["pf_vs_open", "post_first", "post_facing_bet"]);
  });
});

describe("Wilson interval", () => {
  it("matches the textbook values", () => {
    const [lo, hi] = wilson(5, 10)!;
    expect(lo).toBeCloseTo(0.2366, 3);
    expect(hi).toBeCloseTo(0.7634, 3);
    expect(wilson(0, 10)![0]).toBe(0);
    expect(wilson(0, 0)).toBeNull();
  });
  it("narrows as the sample grows", () => {
    const width = (n: number) => {
      const [lo, hi] = wilson(Math.round(n / 4), n)!;
      return hi - lo;
    };
    expect(width(400)).toBeLessThan(width(100));
    expect(width(100)).toBeLessThan(width(25));
  });
});

describe("the sample session", () => {
  let text: string;
  let report: LeakReport;
  beforeAll(() => {
    text = sampleSession();
    report = analyzeSession(text).report;
  }, 60_000);

  it("is generated deterministically", () => {
    expect(makeSampleSession()).toBe(text);
    expect(makeSampleSession(1)).not.toBe(text);
  });

  it("parses every hand except the one broken on purpose", () => {
    expect(report.blocks).toBe(SAMPLE_CASH_HANDS + SAMPLE_TOURNAMENT_HANDS + 1);
    expect(report.failed).toHaveLength(1);
    expect(report.failed[0].handId).toBe("261109999999");
    expect(report.cash).toBeGreaterThan(0);
    expect(report.tournament).toBeGreaterThan(0);
    expect(report.smallSample).toBe(false);
  });

  it("splits EV lost by spot type so the spots sum to the total", () => {
    const bySpot = report.spots.reduce((t, s) => t + s.evLossBb, 0);
    expect(bySpot).toBeCloseTo(report.evLossBb, 9);
    expect(report.spots.map((s) => s.spot)).toEqual(SPOT_ORDER);
    expect(report.spots.reduce((t, s) => t + s.decisions, 0)).toBe(report.decisions);
    for (const s of report.spots) expect(Object.values(s.counts).reduce((a, b) => a + b, 0)).toBe(s.decisions);
    expect(Object.values(report.counts).reduce((a, b) => a + b, 0)).toBe(report.decisions);
  });

  it("finds the leaks built into the simulated hero", () => {
    // Hero calls river bets with busted hands: the river is where most measurable EV goes.
    const river = report.spots.find((s) => s.spot === "river_facing_bet")!;
    expect(river.evLossBb).toBeGreaterThan(0);
    expect(report.biggest[0].spot).toBe("river_facing_bet");
    // Hero calls opens too wide, which the charts flag without an EV figure.
    expect(report.spots.find((s) => s.spot === "pf_vs_open")!.unmeasured).toBeGreaterThan(0);
    // The short-stack shoving range is too tight.
    expect(report.spots.find((s) => s.spot === "pf_pushfold")!.evLossBb).toBeGreaterThan(0);
  });

  it("ranks the biggest mistakes by EV lost, each linked to a real hand", () => {
    const losses = report.biggest.map((m) => m.evLossBb);
    expect([...losses].sort((a, b) => b - a)).toEqual(losses);
    expect(report.biggest.length).toBeGreaterThan(0);
    expect(report.biggest.length).toBeLessThanOrEqual(10);
    const imported = importSession(text);
    for (const m of report.biggest) {
      const h = imported.hands.find((x) => x.position === m.position)!;
      expect(h.hand.id).toBe(m.handId);
    }
  });
});

describe("determinism", () => {
  it("gives the same report for the same file, whether run at once or step by step", () => {
    const slice = splitSession(sampleSession()).slice(0, 80).join("\n\n");
    const a = analyzeSession(slice).report;
    const b = analyzeSession(slice).report;
    expect(b).toEqual(a);
    const steps = sessionSteps(slice);
    let step = steps.next();
    while (!step.done) step = steps.next();
    expect(step.value.report).toEqual(a);
    for (const m of a.biggest) expect(step.value.texts[m.position]).toMatch(new RegExp(`Hand #${m.handId}`));
  });

  it("analyses each hand the same whatever hands surround it", () => {
    const decisions = (file: string) => analyzeSession(file).results.find((r) => r.handId === "90006")!.analysis!.decisions;
    expect(decisions(BUILT_FILE)).toEqual(decisions(FLAT));
  });
});
