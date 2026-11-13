import { describe, expect, it } from "vitest";
import { analyzeHand, type AnalysisOptions } from "../src/lib/poker/analyze";
import { parseHand } from "../src/lib/poker/parser";
import { SAMPLES } from "../src/lib/poker/samples";
import { buildFacts } from "../src/lib/coach";
import { checkReply } from "../src/lib/coach-eval";
import { DEMO_HANDS } from "../src/lib/demo-hands";

const analyse = (id: string, options: AnalysisOptions = {}) => analyzeHand(parseHand(SAMPLES.find((s) => s.id === id)!.text), options);
const facts = (id: string, options: AnalysisOptions = {}) => buildFacts(analyse(id, options), options.profile ?? "standard");
const unsupported = (text: string, sheet: string) => checkReply(text, sheet).unsupported.map((q) => q.raw);

describe("demo hand walkthroughs", () => {
  it("has three hands, each a different sample", () => {
    expect(DEMO_HANDS).toHaveLength(3);
    expect(new Set(DEMO_HANDS.map((d) => d.sampleId)).size).toBe(3);
    for (const d of DEMO_HANDS) expect(SAMPLES.some((s) => s.id === d.sampleId)).toBe(true);
  });

  for (const demo of DEMO_HANDS) {
    describe(demo.sampleId, () => {
      it("states only numbers the engine computed for the hand as loaded", () => {
        const sheet = facts(demo.sampleId);
        for (const text of [demo.setup, demo.why, ...demo.steps.filter((s) => !s.change).map((s) => s.text)]) {
          expect(unsupported(text, sheet), text).toEqual([]);
        }
      });
      it("states only numbers the engine computes after each change it asks for", () => {
        for (const step of demo.steps.filter((s) => s.change)) {
          expect(unsupported(step.text, facts(demo.sampleId, step.change!.options)), step.text).toEqual([]);
        }
      });
      it("links to its own hand", () => {
        expect(demo.links[0].href).toBe(`/samples/${demo.sampleId}`);
      });
    });
  }

  // The verdicts each script argues for, so a change to the engine that flips one fails here.
  it("river lead: the fold is a mistake under every opponent profile", () => {
    for (const profile of ["passive", "standard", "aggressive"] as const) {
      const river = analyse("river-lead", { profile }).decisions.find((d) => d.street === "river")!;
      expect(river.verdict).toBe("mistake");
      expect(river.exact).toBe(true);
    }
  });
  it("jacks: calling the jam is a mistake, and calling a slightly wider jam is right", () => {
    const call = (options: AnalysisOptions = {}) => analyse("jj-vs-jam", options).decisions.find((d) => d.action.type === "call")!;
    expect(call().verdict).toBe("mistake");
    expect(call().exact).toBe(true);
    const step = DEMO_HANDS.find((d) => d.sampleId === "jj-vs-jam")!.steps.find((s) => s.change)!;
    expect(call(step.change!.options).verdict).toBe("good");
  });
  it("short stack: the call is judged by the push/fold model, not a chart", () => {
    const call = analyse("mtt-short-stack").decisions.find((d) => d.action.type === "call")!;
    expect(call.verdict).toBe("good");
    expect(call.model?.exact).toBe(false);
  });
});
