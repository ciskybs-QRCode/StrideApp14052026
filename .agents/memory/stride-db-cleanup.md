---
name: Stride DB cleanup / wipe approach
description: How to safely wipe Stride test data while keeping a login, and the real data topology (Supabase is the only live DB).
---

# Stride DB topology (verified)

- **Supabase (`SUPABASE_DB_URL`) is the single live database.** `artifacts/api-server/src/lib/pg.ts` `pool` connects to `SUPABASE_DB_URL` (line ~36), NOT Replit's `DATABASE_URL`. The Replit PG (`DATABASE_URL`) is EMPTY — it has no `organizations`/`users` and no app tables. Any memory note saying "pg pool = Replit PG / DATABASE_URL" or "tables live in pg not Supabase" is stale: everything (operator_profiles, system_config, private_lesson_*, etc.) is in Supabase.
- **Login authenticates only against the `users` table** (`auth.ts` ~line 54: `from("users").select(... password_hash ...)`, bcrypt compare). So to preserve a login you only need to keep that one `users` row. The parallel identity layer (`global_users`, `tenant_memberships`) is for multi-tenant/multi-assoc features, not for basic login/JWT.

# Safe full-wipe-but-keep-one-account recipe

**Why:** "clean account, keep my login, keep the org as an editable empty shell" — org name/branding/settings are editable later by admin/super_admin, so keeping the configured org is safe.

**How to apply:**
1. Connect via a temp `.mjs` placed INSIDE `artifacts/api-server/` (so `pg` resolves — node resolves modules from the FILE's dir, not cwd). `new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL, ssl:{rejectUnauthorized:false}, connectionTimeoutMillis: 8000+ })`. Shell has the env vars; the code_execution sandbox REDACTS secrets, so use bash+node.
2. Dynamically list base tables from `information_schema.tables`. Define KEEP_FULL = config tables to preserve (`organizations`, `admin_settings`, `system_config`, `org_communication_settings`) and PARTIAL = tables to filter (`users`, `global_users`, `tenant_memberships`, `user_profile_extra`). Skip migration/internal tables (`__*`, `*migration*`).
3. In ONE transaction: `SET session_replication_role = replica;` to disable FK triggers (the Supabase direct `postgres` user CAN do this) → `DELETE FROM` every non-keep table in any order (no FK ordering needed) → partial deletes (`DELETE FROM users WHERE id<>KEEP`, `global_users WHERE email IS DISTINCT FROM KEEP`, `tenant_memberships WHERE global_user_id IS DISTINCT FROM <keep gu id>`, `user_profile_extra WHERE user_id IS DISTINCT FROM KEEP`) → `SET session_replication_role = DEFAULT;` → COMMIT.
4. Always run a dryrun pass (counts only) first, then execute. `rm` the temp script after.

**Gotchas:** `members` has no `name` column; `global_users` has no `primary_role` column (cols: id, first_name, last_name, email, qr_code, timestamps). A user can have >1 `tenant_membership` to the same org — filtering by their `global_user_id` keeps all of them (expected). After wipe, restart api-server and curl `localhost:80/api/healthz` (expect 200).
