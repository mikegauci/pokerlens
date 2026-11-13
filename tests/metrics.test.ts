import { describe, expect, it } from "vitest";
import { EVENT_NAMES } from "../src/lib/event-names";
import { DEFAULT_WINDOW, EventRow, FUNNEL_STEPS, formatRate, parseWindow, summarize, windowStart } from "../src/lib/metrics";
import { isAuthorized } from "../src/lib/metrics-auth";

const FROM = "2026-11-01T00:00:00.000Z";
const TO = "2026-11-08T00:00:00.000Z";

let nextId = 1;
/** Builds a row `minutes` after the window opens. */
function ev(session: string, name: string, minutes: number, id = nextId++): EventRow {
  return { id, name, session_id: session, created_at: new Date(Date.parse(FROM) + minutes * 60_000).toISOString() };
}

const sessions = (rows: EventRow[]) => summarize(rows, FROM, TO).funnel.map((s) => s.sessions);

describe("usage funnel", () => {
  it("counts a session once per step, not once per event", () => {
    const rows = [ev("a", "hand_analyzed", 1), ev("a", "hand_analyzed", 2), ev("a", "hand_analyzed", 3)];
    const s = summarize(rows, FROM, TO);
    expect(s.funnel[0].sessions).toBe(1);
    expect(s.counts.find((c) => c.name === "hand_analyzed")).toEqual({ name: "hand_analyzed", events: 3, sessions: 1 });
  });

  it("walks a full session through every step with 100% conversion", () => {
    const rows = [ev("a", "hand_analyzed", 1), ev("a", "range_edited", 2), ev("a", "coach_requested", 3), ev("a", "hand_saved", 4)];
    const s = summarize(rows, FROM, TO);
    expect(s.funnel.map((f) => f.sessions)).toEqual([1, 1, 1, 1]);
    expect(s.funnel.map((f) => f.fromPrevious)).toEqual([null, 1, 1, 1]);
    expect(s.funnel.map((f) => f.fromFirst)).toEqual([null, 1, 1, 1]);
  });

  it("requires steps in order: a step before the previous one does not count", () => {
    // Coach and range edit came before any analysed hand, so only the first step is reached.
    const rows = [ev("a", "coach_requested", 1), ev("a", "range_edited", 2), ev("a", "hand_analyzed", 3)];
    expect(sessions(rows)).toEqual([1, 0, 0, 0]);
  });

  it("orders by time, not by the order rows arrive in", () => {
    const rows = [ev("a", "range_edited", 5), ev("a", "hand_analyzed", 1)];
    expect(sessions(rows)).toEqual([1, 1, 0, 0]);
  });

  it("breaks timestamp ties by id", () => {
    const rows = [ev("a", "range_edited", 1, 20), ev("a", "hand_analyzed", 1, 10)];
    expect(sessions(rows)).toEqual([1, 1, 0, 0]);
    const reversed = [ev("b", "range_edited", 1, 10), ev("b", "hand_analyzed", 1, 20)];
    expect(sessions(reversed)).toEqual([1, 0, 0, 0]);
  });

  it("stops a session that skips a step, but still shows it in the any-order count", () => {
    // Analysed, then asked the coach without editing a range, then saved.
    const rows = [ev("a", "hand_analyzed", 1), ev("a", "coach_requested", 2), ev("a", "hand_saved", 3)];
    const s = summarize(rows, FROM, TO);
    expect(s.funnel.map((f) => f.sessions)).toEqual([1, 0, 0, 0]);
    expect(s.funnel.map((f) => f.sessionsAnyOrder)).toEqual([1, 0, 1, 1]);
  });

  it("keeps sessions apart", () => {
    const rows = [
      ev("a", "hand_analyzed", 1),
      ev("b", "range_edited", 2), // b never analysed, so it is not in the funnel
      ev("c", "hand_analyzed", 3),
      ev("c", "range_edited", 4),
    ];
    const s = summarize(rows, FROM, TO);
    expect(s.funnel.map((f) => f.sessions)).toEqual([2, 1, 0, 0]);
    expect(s.funnel[1].fromPrevious).toBe(0.5);
    expect(s.funnel[2].fromPrevious).toBe(0);
    expect(s.funnel[3].fromPrevious).toBeNull();
    expect(s.totalSessions).toBe(3);
  });

  it("never lets a later step exceed an earlier one", () => {
    const names = FUNNEL_STEPS.map((f) => f.name);
    const rows: EventRow[] = [];
    // A fixed pseudo-random mix of steps across 40 sessions.
    let seed = 7;
    for (let i = 0; i < 400; i++) {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      rows.push(ev(`s${seed % 40}`, names[(seed >> 8) % names.length], i));
    }
    const f = summarize(rows, FROM, TO).funnel;
    for (let i = 1; i < f.length; i++) {
      expect(f[i].sessions).toBeLessThanOrEqual(f[i - 1].sessions);
      expect(f[i].sessions).toBeLessThanOrEqual(f[i].sessionsAnyOrder);
    }
  });

  it("returns zeros, null rates and every event name for an empty window", () => {
    const s = summarize([], FROM, TO);
    expect(s.totalEvents).toBe(0);
    expect(s.totalSessions).toBe(0);
    expect(s.funnel.map((f) => f.sessions)).toEqual([0, 0, 0, 0]);
    expect(s.funnel.every((f) => f.fromPrevious === null && f.fromFirst === null)).toBe(true);
    expect(s.counts.map((c) => c.name)).toEqual([...EVENT_NAMES]);
    expect(s.counts.every((c) => c.events === 0 && c.sessions === 0)).toBe(true);
    expect(s.unknown).toEqual([]);
  });

  it("ignores rows outside the window, with the start inclusive and the end exclusive", () => {
    const rows = [
      { id: 1, name: "hand_analyzed", session_id: "early", created_at: "2026-10-31T23:59:59.999Z" },
      { id: 2, name: "hand_analyzed", session_id: "start", created_at: FROM },
      { id: 3, name: "hand_analyzed", session_id: "end", created_at: TO },
    ];
    const s = summarize(rows, FROM, TO);
    expect(s.totalEvents).toBe(1);
    expect(s.funnel[0].sessions).toBe(1);
  });

  it("lists every known event name, including the newer ones, and reports retired names separately", () => {
    const rows = [ev("a", "trainer_answered", 1), ev("a", "solver_run", 2), ev("b", "pushfold_viewed", 3), ev("b", "session_imported", 4), ev("b", "old_event", 5)];
    const s = summarize(rows, FROM, TO);
    const count = (n: string) => s.counts.find((c) => c.name === n)?.events;
    for (const n of ["trainer_answered", "solver_run", "pushfold_viewed", "session_imported", "session_analyzed", "session_hand_opened"]) {
      expect(s.counts.some((c) => c.name === n)).toBe(true);
    }
    expect(count("trainer_answered")).toBe(1);
    expect(count("session_analyzed")).toBe(0);
    expect(s.unknown).toEqual([{ name: "old_event", events: 1, sessions: 1 }]);
  });

  it("gives the same output for the same rows in any input order", () => {
    const rows = [ev("a", "hand_analyzed", 1), ev("b", "hand_analyzed", 2), ev("a", "range_edited", 3), ev("b", "coach_requested", 4), ev("z", "zz", 5), ev("y", "yy", 6)];
    const a = summarize(rows, FROM, TO);
    const b = summarize([...rows].reverse(), FROM, TO);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(a.unknown.map((u) => u.name)).toEqual(["yy", "zz"]);
  });
});

describe("window and formatting", () => {
  it("parses known windows and falls back on anything else", () => {
    expect(parseWindow("30d")).toBe("30d");
    expect(parseWindow(["24h", "7d"])).toBe("24h");
    expect(parseWindow("1y")).toBe(DEFAULT_WINDOW);
    expect(parseWindow(undefined)).toBe(DEFAULT_WINDOW);
  });

  it("computes the window start from the given clock", () => {
    expect(windowStart("24h", new Date("2026-11-13T12:00:00.000Z"))).toBe("2026-11-12T12:00:00.000Z");
    expect(windowStart("7d", new Date("2026-11-13T12:00:00.000Z"))).toBe("2026-11-06T12:00:00.000Z");
  });

  it("formats rates to one decimal and shows a dash with no base", () => {
    expect(formatRate(null)).toBe("—");
    expect(formatRate(1 / 3)).toBe("33.3%");
    expect(formatRate(0)).toBe("0%");
  });
});

describe("metrics auth", () => {
  const basic = (user: string, pass: string) => `Basic ${btoa(`${user}:${pass}`)}`;

  it("accepts the right password with any user name", () => {
    expect(isAuthorized(basic("anyone", "s3cret"), "s3cret")).toBe(true);
    expect(isAuthorized(basic("", "pa:ss"), "pa:ss")).toBe(true);
  });

  it("rejects wrong, missing or malformed credentials", () => {
    expect(isAuthorized(basic("u", "wrong"), "s3cret")).toBe(false);
    expect(isAuthorized(basic("u", "s3cre"), "s3cret")).toBe(false);
    expect(isAuthorized(null, "s3cret")).toBe(false);
    expect(isAuthorized("Bearer abc", "s3cret")).toBe(false);
    expect(isAuthorized("Basic !!!not-base64", "s3cret")).toBe(false);
    expect(isAuthorized(`Basic ${btoa("nocolon")}`, "s3cret")).toBe(false);
  });

  it("never authorizes when no password is configured", () => {
    expect(isAuthorized(basic("u", ""), undefined)).toBe(false);
    expect(isAuthorized(basic("u", ""), "")).toBe(false);
  });
});
