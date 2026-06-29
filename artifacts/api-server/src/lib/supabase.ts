import { createClient } from "@supabase/supabase-js";

const url = process.env["SUPABASE_URL"];
// Single source of truth for the Supabase key: the SUPABASE_SERVICE_ROLE_KEY
// managed secret. The legacy SUPABASE_KEY was committed in plaintext in .replit
// and has been removed entirely — no fallback. This is a trusted server backend,
// so the service_role key is the intended client credential; all tenant
// isolation is enforced at the API layer (org-scoped queries).
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

if (!url) throw new Error("SUPABASE_URL is required");
if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

export const supabase = createClient(url, serviceKey);

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
