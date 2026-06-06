import { createClient } from "@supabase/supabase-js";

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_KEY"];
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_KEY are required");
if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for the Global Identity Engine");

export const supabase = createClient(url, key);

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
