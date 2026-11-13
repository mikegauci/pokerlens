import "server-only";
import { createClient } from "@supabase/supabase-js";
import { toReport } from "./errors";
import { RELEASE } from "./release";

/**
 * Records a server error in `app_errors` with the secret key (clients may only insert client errors).
 * Logs to the console as well, so the error is in the Vercel function logs even without Supabase.
 * Never throws.
 */
export async function reportServerError(error: unknown, ctx: { kind: string; path?: string | null }): Promise<void> {
  try {
    const report = toReport(error, { source: "server", kind: ctx.kind, path: ctx.path, release: RELEASE });
    console.error(`[app_error] ${report.kind} ${report.path ?? ""} ${report.fingerprint}: ${report.message}`);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) return;
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    await db.from("app_errors").insert({ ...report, session_id: null });
  } catch {
    // Monitoring must never turn one error into two.
  }
}
