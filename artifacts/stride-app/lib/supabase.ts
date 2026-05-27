import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Gracefully degrade when env vars are not configured.
// All channel / realtime code must check for null before using.
let _supabase: SupabaseClient | null = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch {
    _supabase = null;
  }
}

export const supabase = _supabase;
