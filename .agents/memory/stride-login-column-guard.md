---
name: Stride login column guard
description: Why login silently returns "Invalid credentials" after adding new Supabase columns, and what columns are safe to select.
---

# Rule
**Never add a column to the Supabase `users` SELECT in `auth.ts` login unless it already exists in Supabase.** A missing column causes error code 42703, which is silently caught and becomes "Invalid credentials" — blocking ALL users from logging in.

**Why:** The login handler does `if (error || !users?.length)` and returns 401 without logging the Supabase error. Any column that exists only in the pg pool (or was added to TypeScript types but never migrated to Supabase) breaks login silently on every deploy.

**How to apply:**
- Safe login SELECT columns (confirmed in Supabase): `id, name, email, password_hash, role, roles, organization_id, blocked, profile_photo_url`
- `preferred_name` → lives in pg `user_profiles` table (account.ts), NOT in Supabase `users`. Never add it to the login SELECT.
- When adding a new column to the login SELECT, first verify it exists in Supabase dashboard before deploying.
- To debug silently failing logins: temporarily add `if (error) req.log.error({ supabaseError: error }, "[login] error")` before the 401 return, reproduce the error, read logs, then remove the debug line.
