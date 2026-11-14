import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SAMPLES } from "../src/lib/poker/samples";
import { TOUR_STEPS, stepFromSearch, stepHref } from "../src/lib/tour";

const root = new URL("../", import.meta.url).pathname;
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
const source = files(join(root, "src")).map((f) => readFileSync(f, "utf8")).join("\n");

/** Top-level pages, from `src/app/<page>/page.tsx` and the home page. */
const pages = ["/", ...readdirSync(join(root, "src/app")).filter((d) => {
  try {
    return statSync(join(root, "src/app", d, "page.tsx")).isFile();
  } catch {
    return false;
  }
}).map((d) => `/${d}`)];

/** Pages that are not features to show: */
const NOT_IN_TOUR: string[] = [];

describe("guided tour", () => {
  it("has unique steps, each with a title and one or two sentences of what", () => {
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(TOUR_STEPS.length);
    for (const s of TOUR_STEPS) {
      expect(s.title.length).toBeGreaterThan(0);
      for (const text of [s.what]) {
        const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/).length;
        expect(sentences, `${s.id}: ${text}`).toBeGreaterThanOrEqual(1);
        expect(sentences, `${s.id}: ${text}`).toBeLessThanOrEqual(2);
      }
    }
  });
  it("only visits pages that exist", () => {
    for (const s of TOUR_STEPS) {
      const sample = s.path.match(/^\/samples\/(.+)$/);
      if (sample) expect(SAMPLES.some((x) => x.id === sample[1]), s.path).toBe(true);
      else expect(pages, s.path).toContain(s.path);
    }
  });
  it("highlights an element that is marked in the source", () => {
    for (const s of TOUR_STEPS) expect(source.includes(`data-tour="${s.target}"`) || source.includes(`"${s.target}" : undefined`), s.target).toBe(true);
  });
  it("covers every page in the app, so a new feature needs a step", () => {
    const visited = new Set(TOUR_STEPS.map((s) => s.path));
    for (const p of pages.filter((p) => !NOT_IN_TOUR.includes(p))) expect(visited.has(p), p).toBe(true);
  });
  it("covers the features the roadmap names", () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    for (const id of ["decision", "coach", "trainer", "solver", "pushfold", "session", "production"]) expect(ids).toContain(id);
    expect(TOUR_STEPS.find((s) => s.id === "production")!.what).toMatch(/\/metrics/);
  });
  it("keeps the step only in the URL, and ignores anything that is not a step", () => {
    expect(stepFromSearch("?tour=1")).toBe(0);
    expect(stepFromSearch(`?tour=${TOUR_STEPS.length}`)).toBe(TOUR_STEPS.length - 1);
    for (const bad of ["", "?tour=0", `?tour=${TOUR_STEPS.length + 1}`, "?tour=2.5", "?tour=abc", "?tour=-1"]) expect(stepFromSearch(bad)).toBeNull();
    TOUR_STEPS.forEach((s, i) => expect(stepFromSearch(new URL(stepHref(i), "https://x").search)).toBe(i));
    expect(source).not.toMatch(/localStorage[^\n]*tour|sessionStorage[^\n]*tour/i);
  });
});
