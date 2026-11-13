import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import OpenAI from "openai";
import { analyzeHand } from "../src/lib/poker/analyze";
import { parseHand } from "../src/lib/poker/parser";
import { SAMPLES } from "../src/lib/poker/samples";
import { buildFacts, coachRequest, fallbackExplanation } from "../src/lib/coach";
import { checkReply, extractQuantities } from "../src/lib/coach-eval";
import { COACH_REPLIES } from "./fixtures/coach-replies";

const analysisOf = (id: string) => analyzeHand(parseHand(SAMPLES.find((s) => s.id === id)!.text), { profile: "standard" });
const factsOf = (id: string) => buildFacts(analysisOf(id), "standard");
const raws = (text: string) => extractQuantities(text).map((q) => q.raw);
const flagged = (reply: string, facts: string) => checkReply(reply, facts).unsupported.map((q) => q.raw);

describe("reading numbers out of coach text", () => {
  it("reads percentages, big blinds, combos and decision references with their units", () => {
    expect(extractQuantities("#4: 55% equity, 16bb into 38.5 bb, about 43 weighted combos, 12 percent, 3 big blinds")).toEqual([
      { raw: "#4", value: 4, decimals: 0, unit: "#" },
      { raw: "55%", value: 55, decimals: 0, unit: "%" },
      { raw: "16bb", value: 16, decimals: 0, unit: "bb" },
      { raw: "38.5bb", value: 38.5, decimals: 1, unit: "bb" },
      { raw: "43 combos", value: 43, decimals: 0, unit: "combos" },
      { raw: "12%", value: 12, decimals: 0, unit: "%" },
      { raw: "3bb", value: 3, decimals: 0, unit: "bb" },
    ]);
  });
  it("drops the sign, since the sheet and the prose word gains and losses differently", () => {
    expect(extractQuantities("EV -9.8bb, +14.2bb")).toMatchObject([{ value: 9.8 }, { value: 14.2 }]);
  });
  it("reads ratios and sizing multiples", () => {
    expect(raws("getting 2:1, a 3-to-1 dog, a 2.5x open")).toEqual(["2:1", "3-to-1", "2.5x"]);
  });
  it("ignores cards, hand classes and range notation", () => {
    expect(raws("Kh 7s 2d 9c with KJo or 76s against 99-22, A5s-A2s, K8o+, 22+, K2s:0.96")).toEqual([]);
  });
  it("ignores a bare pocket pair but reads the same digits as an amount", () => {
    expect(raws("calling with 99 is fine")).toEqual([]);
    expect(raws("a 33% bet, 22bb behind")).toEqual(["33%", "22bb"]);
    expect(raws("0.55 of the time")).toEqual(["0.55"]);
  });
  it("ignores poker words that contain digits", () => {
    expect(raws("a 3-bet pot, 4-bettor, 6-max, 9-handed, 3-way, 7-high, a set of 9s, Kx and 6x, 2nd pair, 4th street")).toEqual([]);
  });
  it("still reads a sizing written as a multiple", () => {
    expect(raws("a 3x open")).toEqual(["3x"]);
  });
  it("ignores Markdown list numbers and labels glued to letters", () => {
    expect(raws("1. Overall verdict\n2) Biggest leak\nSeat3 folds")).toEqual([]);
  });
  it("reads thousands separators", () => {
    expect(extractQuantities("blinds 1,000/2,000")).toMatchObject([{ value: 1000 }, { value: 2000 }]);
  });
});

describe("matching reply numbers to the fact sheet", () => {
  const facts = "pot 38.5bb; to call 16bb; equity 55%; equity needed 29%; EV +14.2bb; SPR 17.7; about 43.2 weighted combos left; #1 preflop; #4 river.";
  it("passes numbers stated on the sheet, including rounded amounts", () => {
    expect(checkReply("Calling 16bb into 38.5bb with 55% against 29% needed was worth about 14bb, at SPR 17.7, with about 43 combos left (#4).", facts).ok).toBe(true);
  });
  it("lets a bare number refer back to a stated amount", () => {
    expect(checkReply("You needed 29 and had 55.", facts).ok).toBe(true);
  });
  it("fails a rounding that changes the number", () => {
    expect(flagged("about 15bb", facts)).toEqual(["15bb"]);
  });
  it("fails added precision", () => {
    expect(flagged("55.4% equity", facts)).toEqual(["55.4%"]);
  });
  it("fails a bare number that only rounds to a stated one", () => {
    expect(flagged("17 outs", facts)).toEqual(["17"]);
  });
  it("fails a stated value with the wrong unit", () => {
    expect(flagged("16% of the pot", facts)).toEqual(["16%"]);
  });
  it("fails a derived number, such as the gap between equity and price", () => {
    expect(flagged("55% against 29% is a 26% edge", facts)).toEqual(["26%"]);
  });
  it("fails a ratio the sheet does not state", () => {
    expect(flagged("about 2.4:1 pot odds", facts)).toEqual(["2.4:1"]);
  });
  it("fails a reference to a decision that does not exist", () => {
    expect(flagged("#7 was the leak", facts)).toEqual(["#7"]);
  });
  it("passes a reply with no numbers at all", () => {
    expect(checkReply("Call: you beat enough bluffs.", facts)).toEqual({ ok: true, unsupported: [], checked: [] });
  });
});

describe("coach evaluations over the sample hands", () => {
  it("has a recorded reply for every sample hand", () => {
    expect(Object.keys(COACH_REPLIES).sort()).toEqual(SAMPLES.map((s) => s.id).sort());
  });

  for (const sample of SAMPLES) {
    const recorded = COACH_REPLIES[sample.id];
    describe(sample.id, () => {
      const facts = factsOf(sample.id);
      it("passes the grounded reply", () => {
        const result = checkReply(recorded.grounded, facts);
        expect(result.unsupported.map((q) => q.raw)).toEqual([]);
        expect(result.checked.length).toBeGreaterThan(5);
      });
      for (const bad of recorded.invented) {
        it(`fails ${bad.why}`, () => expect(flagged(bad.reply, facts)).toEqual(bad.flagged));
      }
      it("passes the built-in summary shown when there is no API key", () => {
        expect(flagged(fallbackExplanation(analysisOf(sample.id)), facts)).toEqual([]);
      });
    });
  }

  it("gives the same fact sheet every time, so the recorded replies stay valid", () => {
    for (const s of SAMPLES) expect(factsOf(s.id)).toBe(factsOf(s.id));
  });
});

// Optional: ask the real model. Off by default so `npm test` stays deterministic, offline and free.
// Run with: COACH_EVAL_LIVE=1 npx vitest run tests/coach-eval.test.ts (reads OPENAI_API_KEY from .env.local).
const live = Boolean(process.env.COACH_EVAL_LIVE);
if (live && !process.env.OPENAI_API_KEY && existsSync(".env.local")) process.loadEnvFile(".env.local");

describe.skipIf(!live)("live coach evaluation", () => {
  for (const sample of SAMPLES) {
    it(`${sample.id}: the model states only numbers from the fact sheet`, async () => {
      if (!process.env.OPENAI_API_KEY) throw new Error("COACH_EVAL_LIVE is set but OPENAI_API_KEY is missing.");
      const facts = factsOf(sample.id);
      const response = await new OpenAI().responses.create(coachRequest(facts));
      const result = checkReply(response.output_text, facts);
      if (!result.ok) console.log(`\n--- ${sample.id} reply ---\n${response.output_text}\n`);
      expect(result.unsupported.map((q) => q.raw)).toEqual([]);
    }, 120_000);
  }
});
