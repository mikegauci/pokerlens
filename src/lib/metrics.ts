import { EVENT_NAMES, type EventName } from "./event-names";

/**
 * Usage-funnel aggregation for the metrics page. Pure: no React, no network, no clock.
 * The caller passes the rows and the window; the same input always gives the same output.
 */

/** One row of the `events` table, reduced to the columns the funnel needs. Props are never read. */
export interface EventRow {
  id: number;
  name: string;
  session_id: string;
  created_at: string;
}

/** The funnel, in order. Each step must happen after the previous one in the same session. */
export const FUNNEL_STEPS = [
  { name: "hand_analyzed", label: "Hand analysed" },
  { name: "range_edited", label: "Range edited" },
  { name: "coach_requested", label: "Coach requested" },
  { name: "hand_saved", label: "Hand saved" },
] as const satisfies readonly { name: EventName; label: string }[];

export const WINDOWS = [
  { id: "24h", label: "Last 24 hours", hours: 24 },
  { id: "7d", label: "Last 7 days", hours: 24 * 7 },
  { id: "30d", label: "Last 30 days", hours: 24 * 30 },
  { id: "90d", label: "Last 90 days", hours: 24 * 90 },
] as const;

export type WindowId = (typeof WINDOWS)[number]["id"];
export const DEFAULT_WINDOW: WindowId = "7d";

/** Reads a `?window=` value; anything unknown falls back to the default. */
export function parseWindow(value: string | string[] | undefined): WindowId {
  const v = Array.isArray(value) ? value[0] : value;
  return WINDOWS.some((w) => w.id === v) ? (v as WindowId) : DEFAULT_WINDOW;
}

/** Start of the window as an ISO timestamp, for the database filter. */
export function windowStart(id: WindowId, now: Date): string {
  const hours = WINDOWS.find((w) => w.id === id)!.hours;
  return new Date(now.getTime() - hours * 3_600_000).toISOString();
}

export interface FunnelStep {
  name: EventName;
  label: string;
  /** Sessions that reached this step after every earlier step, in order. */
  sessions: number;
  /** Sessions with at least one event of this name, in any order. Shows how many skipped ahead. */
  sessionsAnyOrder: number;
  /** `sessions` of this step over `sessions` of the step before; null for the first step or a zero base. */
  fromPrevious: number | null;
  /** `sessions` of this step over `sessions` of the first step; null when nobody analysed a hand. */
  fromFirst: number | null;
}

export interface EventCount {
  name: string;
  events: number;
  sessions: number;
}

export interface MetricsSummary {
  from: string;
  to: string;
  totalEvents: number;
  totalSessions: number;
  funnel: FunnelStep[];
  /** One row per name in `EVENT_NAMES`, in that order, including zeros. */
  counts: EventCount[];
  /** Names found in the table that the app no longer sends (for example retired events), sorted. */
  unknown: EventCount[];
}

const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);

/** Events in time order; `id` breaks ties so equal timestamps still sort the same way every time. */
function chronological(rows: readonly EventRow[]): EventRow[] {
  return [...rows].sort((a, b) => {
    const t = Date.parse(a.created_at) - Date.parse(b.created_at);
    return t !== 0 ? t : a.id - b.id;
  });
}

/**
 * Builds the funnel and the per-name counts for the events between `from` (inclusive) and `to` (exclusive).
 * Rows outside the window are ignored, so the caller may over-fetch safely.
 *
 * Funnel rule: a session reaches step k when it has a step-k event that comes after the event that
 * reached step k-1 (time order, then id). A session that skips a step stops there, even if it later
 * fires the steps after it; `sessionsAnyOrder` still counts it, so the gap is visible.
 */
export function summarize(rows: readonly EventRow[], from: string, to: string): MetricsSummary {
  const start = Date.parse(from);
  const end = Date.parse(to);
  const inWindow = chronological(rows).filter((r) => {
    const t = Date.parse(r.created_at);
    return t >= start && t < end;
  });

  const bySession = new Map<string, EventRow[]>();
  const perName = new Map<string, { events: number; sessions: Set<string> }>();
  for (const r of inWindow) {
    const list = bySession.get(r.session_id);
    if (list) list.push(r);
    else bySession.set(r.session_id, [r]);
    const c = perName.get(r.name) ?? { events: 0, sessions: new Set<string>() };
    c.events += 1;
    c.sessions.add(r.session_id);
    perName.set(r.name, c);
  }

  const reached = FUNNEL_STEPS.map(() => 0);
  for (const events of bySession.values()) {
    let step = 0;
    for (const e of events) {
      if (step < FUNNEL_STEPS.length && e.name === FUNNEL_STEPS[step].name) {
        reached[step] += 1;
        step += 1;
      }
    }
  }

  const funnel: FunnelStep[] = FUNNEL_STEPS.map((s, i) => ({
    name: s.name,
    label: s.label,
    sessions: reached[i],
    sessionsAnyOrder: perName.get(s.name)?.sessions.size ?? 0,
    fromPrevious: i === 0 ? null : ratio(reached[i], reached[i - 1]),
    fromFirst: i === 0 ? null : ratio(reached[i], reached[0]),
  }));

  const toCount = (name: string): EventCount => {
    const c = perName.get(name);
    return { name, events: c?.events ?? 0, sessions: c?.sessions.size ?? 0 };
  };
  const known = new Set<string>(EVENT_NAMES);
  const unknown = [...perName.keys()].filter((n) => !known.has(n)).sort().map(toCount);

  return {
    from: new Date(start).toISOString(),
    to: new Date(end).toISOString(),
    totalEvents: inWindow.length,
    totalSessions: bySession.size,
    funnel,
    counts: EVENT_NAMES.map(toCount),
    unknown,
  };
}

/** "42%" style label for a conversion rate; an em dash when there is no base to divide by. */
export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 1000) / 10}%`;
}
