/**
 * Every usage event the app records. Kept apart from `track.ts` so server code and
 * tests can list the names without pulling in the browser Supabase client.
 */
export const EVENT_NAMES = [
  "hand_analyzed",
  "parse_error",
  "decision_viewed",
  "profile_changed",
  "range_edited",
  "coach_requested",
  "hand_saved",
  "saved_hand_opened",
  "signed_in",
  "trainer_answered",
  "solver_run",
  "solver_leak",
  "pushfold_viewed",
  "session_imported",
  "session_analyzed",
  "session_hand_opened",
  "integrity_player_viewed",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];
