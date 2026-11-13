import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Null when Supabase is not configured; the app then runs without accounts or tracking. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

export interface SavedHand {
  id: string;
  title: string;
  hand_text: string;
  hero_class: string;
  hero_position: string;
  net_bb: number;
  ev_loss_bb: number;
  mistakes: number;
  inaccuracies: number;
  flags: { street: string; title: string; verdict: string; evLossBb?: number }[];
  profile: "passive" | "standard" | "aggressive";
  range_overrides: Record<string, string>;
  created_at: string;
}
