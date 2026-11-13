import type { EventName } from "./event-names";
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

export type { EventName };

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
