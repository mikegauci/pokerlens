/**
 * Turns anything thrown into a small, privacy-safe error report, and groups reports for the metrics
 * page. Pure: no React, no network, no clock.
 */

export const LIMITS = { message: 500, stack: 2000, path: 200, stackFrames: 8 } as const;

export type ErrorSource = "client" | "server";

export interface ErrorReport {
  source: ErrorSource;
  /** Where it was caught: "window", "promise", "boundary", "global-boundary", "render", "route", "action", "proxy". */
  kind: string;
  message: string;
  stack: string | null;
  path: string | null;
  digest: string | null;
  fingerprint: string;
  release: string;
}

/**
 * Removes things a message or stack could carry that should not be stored: query strings, e-mail addresses, and long runs of digits (ids, tokens). Card strings are left alone.
 */
export function scrub(text: string): string {
  return text
    .replace(/\?[^\s)'"]*/g, "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\d{9,}/g, "[number]");
}

/** Path only, no query string or fragment, so a URL cannot leak what was typed into the page. */
export function cleanPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const p = path.split(/[?#]/)[0];
  return p.slice(0, LIMITS.path) || "/";
}

function fnv(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Same error, same fingerprint: the message with numbers removed (so "index 3" and "index 7" group),
 * plus the first stack frame without line and column numbers (which change with every build).
 */
export function fingerprint(message: string, stack: string | null): string {
  const firstFrame = (stack ?? "").split("\n").find((l) => /^\s*at\s|@/.test(l)) ?? "";
  const frame = firstFrame.replace(/:\d+(:\d+)?\)?\s*$/, "").replace(/\(?https?:\/\/[^/]+/, "").trim();
  return fnv(`${message.replace(/\d+/g, "#")}|${frame}`);
}

export function toReport(error: unknown, ctx: { source: ErrorSource; kind: string; path?: string | null; release: string; digest?: string | null }): ErrorReport {
  const e = error instanceof Error ? error : null;
  const raw = e ? `${e.name && e.name !== "Error" ? `${e.name}: ` : ""}${e.message}` : typeof error === "string" ? error : error == null ? "" : safeString(error);
  const message = scrub(raw || "Unknown error").slice(0, LIMITS.message);
  const stack = e?.stack
    ? scrub(e.stack.split("\n").slice(1, 1 + LIMITS.stackFrames).map((l) => l.trim()).join("\n")).slice(0, LIMITS.stack) || null
    : null;
  const digest = ctx.digest ?? (error && typeof error === "object" && "digest" in error ? String((error as { digest: unknown }).digest).slice(0, 64) : null);
  return { source: ctx.source, kind: ctx.kind.slice(0, 32), message, stack, path: cleanPath(ctx.path), digest, fingerprint: fingerprint(message, stack), release: ctx.release.slice(0, 40) };
}

function safeString(x: unknown): string {
  try {
    return JSON.stringify(x)?.slice(0, LIMITS.message) ?? String(x);
  } catch {
    return String(x);
  }
}

/** Reports one browser session may send. A render loop or a failing timer cannot flood the table. */
export const MAX_REPORTS_PER_SESSION = 10;

/** Decides whether a client report goes out: at most one per fingerprint and a few per session. */
export function createLimiter(max = MAX_REPORTS_PER_SESSION) {
  const seen = new Set<string>();
  return (fp: string): boolean => {
    if (seen.has(fp) || seen.size >= max) return false;
    seen.add(fp);
    return true;
  };
}

/** One row of `app_errors` as the metrics page reads it. */
export interface ErrorRow {
  source: ErrorSource;
  kind: string;
  message: string;
  path: string | null;
  fingerprint: string;
  release: string;
  session_id: string | null;
  created_at: string;
}

export interface ErrorGroup {
  fingerprint: string;
  source: ErrorSource;
  kind: string;
  message: string;
  count: number;
  /** Distinct browser sessions; server errors have none. */
  sessions: number;
  paths: string[];
  releases: string[];
  firstSeen: string;
  lastSeen: string;
}

/** Groups errors by fingerprint, most frequent first, then most recent. */
export function groupErrors(rows: ErrorRow[]): ErrorGroup[] {
  const groups = new Map<string, ErrorGroup & { sessionSet: Set<string>; pathSet: Set<string>; releaseSet: Set<string> }>();
  for (const r of rows) {
    let g = groups.get(r.fingerprint);
    if (!g) {
      g = { fingerprint: r.fingerprint, source: r.source, kind: r.kind, message: r.message, count: 0, sessions: 0, paths: [], releases: [], firstSeen: r.created_at, lastSeen: r.created_at, sessionSet: new Set(), pathSet: new Set(), releaseSet: new Set() };
      groups.set(r.fingerprint, g);
    }
    g.count++;
    if (r.session_id) g.sessionSet.add(r.session_id);
    if (r.path) g.pathSet.add(r.path);
    g.releaseSet.add(r.release);
    if (r.created_at < g.firstSeen) g.firstSeen = r.created_at;
    if (r.created_at > g.lastSeen) g.lastSeen = r.created_at;
  }
  return [...groups.values()]
    .map(({ sessionSet, pathSet, releaseSet, ...g }) => ({ ...g, sessions: sessionSet.size, paths: [...pathSet].sort(), releases: [...releaseSet].sort() }))
    .sort((a, b) => b.count - a.count || b.lastSeen.localeCompare(a.lastSeen));
}
