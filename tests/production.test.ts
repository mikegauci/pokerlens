import { describe, expect, it } from "vitest";
import { cleanPath, createLimiter, fingerprint, groupErrors, scrub, toReport, type ErrorRow } from "../src/lib/errors";

describe("error reports", () => {
  it("never store a query string, an e-mail address or a long number", () => {
    expect(cleanPath("/samples/river-lead?hand=Seat%201%3A%20Bob#decision")).toBe("/samples/river-lead");
    expect(scrub("Failed to fetch /api/coach?text=Dealt%20to%20Hero")).toBe("Failed to fetch /api/coach");
    expect(scrub("No account for bob@example.com")).toBe("No account for [email]");
    expect(scrub("Hand 250000000101 failed")).toBe("Hand [number] failed");
    expect(scrub("Expected exactly two hole cards, got Ah Kd Qc")).toBe("Expected exactly two hole cards, got Ah Kd Qc");
  });
  it("trims long messages and stacks to the table's limits", () => {
    const e = new Error("x".repeat(2000));
    e.stack = `Error: x\n${Array.from({ length: 50 }, (_, i) => `    at fn${i} (/app/page.js:${i}:1)`).join("\n")}`;
    const r = toReport(e, { source: "client", kind: "window", path: "/", release: "abc1234" });
    expect(r.message.length).toBe(500);
    expect(r.stack!.split("\n")).toHaveLength(8);
  });
  it("reads the digest Next.js attaches to server errors", () => {
    const e = Object.assign(new Error("An error occurred in the Server Components render."), { digest: "1234567" });
    expect(toReport(e, { source: "client", kind: "boundary", release: "dev" }).digest).toBe("1234567");
  });
  it("handles values that are not errors", () => {
    expect(toReport("boom", { source: "client", kind: "promise", release: "dev" }).message).toBe("boom");
    expect(toReport({ code: 42 }, { source: "client", kind: "promise", release: "dev" }).message).toBe('{"code":42}');
    expect(toReport(undefined, { source: "client", kind: "promise", release: "dev" }).message).toBe("Unknown error");
  });
  it("give the same fingerprint to the same error across builds and different numbers", () => {
    const a = fingerprint("Cannot read index 3", "at render (https://a.vercel.app/_next/chunk.js:10:20)");
    const b = fingerprint("Cannot read index 7", "at render (https://b.vercel.app/_next/chunk.js:99:5)");
    const c = fingerprint("Cannot read index 3", "at other (https://a.vercel.app/_next/chunk.js:10:20)");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
  it("are limited to one per error and ten per visit", () => {
    const allow = createLimiter(10);
    expect(allow("a")).toBe(true);
    expect(allow("a")).toBe(false);
    for (let i = 0; i < 9; i++) expect(allow(`b${i}`)).toBe(true);
    expect(allow("c")).toBe(false);
  });
});

describe("error groups on the metrics page", () => {
  const row = (fingerprint: string, created_at: string, over: Partial<ErrorRow> = {}): ErrorRow => ({
    source: "client", kind: "window", message: "boom", path: "/", fingerprint, release: "abc1234", session_id: "s1", created_at, ...over,
  });
  it("count reports and distinct sessions, most frequent first", () => {
    const groups = groupErrors([
      row("f1", "2026-11-14T10:00:00Z"),
      row("f2", "2026-11-14T11:00:00Z", { session_id: "s1" }),
      row("f2", "2026-11-14T12:00:00Z", { session_id: "s2", path: "/session", release: "def5678" }),
      row("f2", "2026-11-14T09:00:00Z", { session_id: "s2" }),
    ]);
    expect(groups.map((g) => [g.fingerprint, g.count, g.sessions])).toEqual([["f2", 3, 2], ["f1", 1, 1]]);
    expect(groups[0]).toMatchObject({ firstSeen: "2026-11-14T09:00:00Z", lastSeen: "2026-11-14T12:00:00Z", paths: ["/", "/session"], releases: ["abc1234", "def5678"] });
  });
});
