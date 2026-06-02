---
name: Stride multi-tenant architecture
description: Multi-tenant org extensions, super_admin role, trial engine, Stripe Connect — key decisions and gotchas
---

## Multi-tenant DB strategy
- The `organizations` table IS the tenant table — `organization_id` on every existing table already provides isolation. No new `associations` table is needed; we extend `organizations` with 8 new columns via safe `ADD COLUMN IF NOT EXISTS` migrations in `pg.ts`.
- New columns: `currency`, `country`, `legal_framework`, `tenant_type`, `stripe_connect_account_id`, `trial_started_at`, `trial_ends_at`, `is_trial_extended`.

**Why:** Creating a parallel `associations` table would require FK changes across 15+ tables, breaking all existing queries. Additive columns on the existing tenant table is safe, idempotent, and backwards compatible.

## super_admin role
- Role string: `"super_admin"` — added to `UserRole` union in `AuthContext.tsx` and `rolesForPrimary` returns `["super_admin"]`.
- `RoleSwitcher.tsx` uses `Record<UserRole, ...>` — must add every new role to the ROLE_META map or TypeScript errors.
- Super admin lands at `/(super_admin)/associations` (routes/app gated by `requireRole("super_admin")`).
- Create via `POST /api/super-admin/seed` (one-time, 409 if super_admin already exists).

## Trial Guard middleware
- Located at `src/middleware/trial-guard.ts`, mounted globally in `app.ts` (`app.use(trialGuard)`).
- 5-min in-memory cache per `orgId` (Map with cachedAt timestamp).
- Skips: no Bearer token (public routes), `role === "super_admin"`, `orgId` missing.
- Returns `402 trial_expired` when `NOW() > trial_ends_at`.
- `invalidateTrialCache(orgId)` exported — call it in extend-trial route after DB update.

## Stripe Connect
- Payment intent in `routes/checkout.ts` now fetches org's `stripe_connect_account_id`, `trial_ends_at`, `currency` before creating intent.
- If `stripe_connect_account_id` present: adds `transfer_data.destination` + `application_fee_amount` (0 during trial, 2% after).
- Currency driven by org's `currency` column (lowercase), not hard-coded EUR.

## Mobile routing
- `app/index.tsx` routing order: super_admin → associations; trial_expired (any non-super_admin + sysStatus.trialExpired) → /trial-expired; then normal role branches.
- `system-status` now returns `trialEndsAt` and `trialExpired` — checked on app boot.
- Login endpoint also gates on trial (returns 402) so the lock applies even if user has a cached session that expires.
