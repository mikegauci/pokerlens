import { createLimiter, toReport } from "./errors";
import { RELEASE } from "./release";
import { supabase } from "./supabase";
import { session } from "./track";

const allow = createLimiter();

/**
 * Sends a browser error to the `app_errors` table. Never throws and never blocks the UI. At most one
 * report per distinct error and ten per visit. Without Supabase it only logs to the console.
 */
export function reportClientError(error: unknown, kind: string, digest?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const report = toReport(error, { source: "client", kind, path: window.location.pathname, release: RELEASE, digest });
    if (!allow(report.fingerprint) || !supabase) return;
    void supabase
      .from("app_errors")
      .insert({ ...report, session_id: session() })
      .then(
        () => undefined,
        () => undefined,
      );
  } catch {
    // Reporting must never cause a second error.
  }
}
