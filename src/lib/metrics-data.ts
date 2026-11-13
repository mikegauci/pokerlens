import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { ErrorRow } from "./errors";
import type { EventRow } from "./metrics";

/** Stop reading after this many rows so one page view cannot pull an unbounded table into memory. */
export const MAX_ROWS = 50_000;
const PAGE = 1000;

export type EventsResult =
  | { ok: true; rows: EventRow[]; truncated: boolean }
  | { ok: false; reason: "missing-config"; missing: string[] }
  | { ok: false; reason: "query-failed"; message: string };

/**
 * Reads events since `from` with the Supabase secret key, which bypasses row-level security.
 * Server only: the key has no NEXT_PUBLIC_ prefix, so it is never inlined into browser code,
 * and `server-only` fails the build if a client component imports this file.
 * Only the columns the funnel needs are selected; `props` and `user_id` are never read.
 */
export async function readEvents(from: string): Promise<EventsResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const missing = [!url && "NEXT_PUBLIC_SUPABASE_URL", !key && "SUPABASE_SECRET_KEY"].filter((m): m is string => Boolean(m));
  if (!url || !key) return { ok: false, reason: "missing-config", missing };

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const rows: EventRow[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const { data, error } = await db
      .from("events")
      .select("id, name, session_id, created_at")
      .gte("created_at", from)
      .order("id", { ascending: true })
      .range(offset, Math.min(offset + PAGE, MAX_ROWS) - 1);
    if (error) return { ok: false, reason: "query-failed", message: error.message };
    rows.push(...(data as EventRow[]));
    if (data.length < PAGE) return { ok: true, rows, truncated: false };
  }
  return { ok: true, rows, truncated: true };
}

/** Most errors one page view reads; the page says when the window held more. */
export const MAX_ERROR_ROWS = 5000;

export type ErrorsResult =
  | { ok: true; rows: ErrorRow[]; truncated: boolean }
  | { ok: false; reason: "missing-config" }
  | { ok: false; reason: "query-failed"; message: string };

/** Reads `app_errors` since `from`, newest first, with the same server-only secret key as the events. */
export async function readErrors(from: string): Promise<ErrorsResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return { ok: false, reason: "missing-config" };
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db
    .from("app_errors")
    .select("source, kind, message, path, fingerprint, release, session_id, created_at")
    .gte("created_at", from)
    .order("created_at", { ascending: false })
    .limit(MAX_ERROR_ROWS + 1);
  if (error) return { ok: false, reason: "query-failed", message: error.message };
  const rows = data as ErrorRow[];
  return { ok: true, rows: rows.slice(0, MAX_ERROR_ROWS), truncated: rows.length > MAX_ERROR_ROWS };
}
