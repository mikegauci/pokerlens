import { supabase } from "./supabase";

let sessionId: string | null = null;
function session(): string {
  if (sessionId) return sessionId;
  try {
    sessionId = sessionStorage.getItem("hl_session");
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem("hl_session", sessionId);
    }
  } catch {
    sessionId = crypto.randomUUID();
  }
  return sessionId;
}

export type EventName = "hand_analyzed" | "parse_error" | "decision_viewed" | "profile_changed" | "range_edited" | "coach_requested" | "hand_saved" | "saved_hand_opened" | "signed_in" | "trainer_answered" | "solver_run" | "solver_leak" | "pushfold_viewed" | "session_imported" | "session_analyzed" | "session_hand_opened";

/**
 * Records a product usage event. Never throws and never blocks the UI.
 * No hand text or personal data goes in `props`, only counts and labels.
 */
export function track(name: EventName, props: Record<string, string | number | boolean | null> = {}): void {
  if (!supabase || typeof window === "undefined") return;
  void supabase
    .from("events")
    .insert({ name, props, session_id: session() })
    .then(
      () => undefined,
      () => undefined,
    );
}
