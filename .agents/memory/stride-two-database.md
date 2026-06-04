---
name: Stride two-database architecture
description: The API server connects to two separate PostgreSQL backends — Supabase (via REST client) and a separate pool DB (via DATABASE_URL). Using the wrong client causes silent failures.
---

## The rule

Two separate databases are in play:

| Database | Access method | Tables |
|---|---|---|
| Supabase PostgreSQL | `supabase` client (anon key, `SUPABASE_KEY`) | `organizations`, `users`, `members` — created/managed by Supabase |
| Pool PostgreSQL | `pool` (direct pg, `DATABASE_URL`) | `disciplines`, `blacklist`, `super_admin_collaborators`, `platform_payment_gateways`, `platform_events` — created by our migrations |

**Why:** `DATABASE_URL` points to a different Postgres instance than Supabase's PostgREST API. Tables created via `pool.query` are invisible to the Supabase REST client (PGRST205), and Supabase-managed tables are invisible to `pool` ("relation does not exist").

**How to apply:**
- For `organizations`, `users`, `members` → always use `supabase` (imported from `lib/supabase.ts`)
- For `super_admin_collaborators`, `platform_payment_gateways`, `platform_events` → always use `pool`
- `SUPABASE_SERVICE_ROLE_KEY` exists but causes "Invalid API key" errors for insert/select on the `users` table — use the anon key client (`supabase`) instead
- The `sa = createClient(url, SERVICE_ROLE_KEY)` client in `super-admin.ts` is now only used for org-level PATCH/UPDATE operations (associations, extend-trial, suspend); all user and platform-table ops use `supabase` or `pool`
- `activation_status` column does NOT exist in Supabase's `users` table (it was only added to the pool DB via ALTER TABLE) — never include it in Supabase client inserts
- Collaborator elevation in `auth.ts` uses `pool.query` on `super_admin_collaborators` (not supabase client)
