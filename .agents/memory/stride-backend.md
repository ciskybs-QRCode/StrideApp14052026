---
name: Stride app backend
description: API server + Supabase connection details and working state
---

## Real API is fully live

- API server runs at `/api` via the shared Replit proxy (`localhost:80/api`)
- `SUPABASE_KEY` env var IS set (starts with `eyJhbGciOi`) — the `supabase.ts` in api-server reads this, NOT `SUPABASE_SERVICE_ROLE_KEY`
- All 3 test users authenticate with real JWTs from `/api/auth/login`:
  - `genitore@test.com / stride123` → id:99, role:parent
  - `operatore@test.com / stride123` → id:100, role:operator
  - `admin@test.com / stride123` → id:101, role:admin

## EXPO_PUBLIC_DOMAIN

Already set in `artifacts/stride-app/package.json` dev script:
```
EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN
```
The Expo app's `lib/api.ts` uses this to build `https://${domain}/api`. No `.env` file needed.

## Demo mode fallback

`isDemoSession()` returns true only if stored token starts with `demo-token-`. With real API working, real JWTs are issued → demo mode is NOT active for the 3 test users.

**Why:** The fallback only triggers on "Failed to fetch" (server unreachable), so the real Supabase data is used whenever the API server is up.

## Super-admin features added (June 2026)

- `platform_org_discounts` table created in direct PG (pool), keyed by `org_id` (INTEGER PK).
- `GET /super-admin/associations` now LEFT JOINs pool discount table and merges `discount_rate` + `discount_duration_end` into each org row.
- New routes: `POST /super-admin/set-suspension` (orgId, suspended bool) and `POST /super-admin/set-trial-end` (orgId, trialEndsAt) — compatibility aliases for the mobile client, using same `sa` Supabase client as existing suspend/trial routes.
- New route: `PATCH /super-admin/associations/:id/discount` (discount_rate 0–100, duration_months 1–120) — upserts into `platform_org_discounts` and emits a `discount_applied` platform event.
- `AssociationRecord` type in `lib/api.ts` now has `discount_rate?: number | null` and `discount_duration_end?: string | null`.
- `applyDiscount(orgId, discountRate, durationMonths)` added to `lib/api.ts`.
- Supabase UPDATE on non-existent row via `sa` (service role) returns "Invalid API key" — all update routes mitigate this by SELECTing first and returning 404 before attempting UPDATE.

## Two separate databases — critical distinction

The API server connects to TWO different databases:
- **Supabase** (`lib/supabase.ts` via `SUPABASE_URL` + `SUPABASE_KEY`): cloud Postgres accessed via PostgREST REST API. Tables: `users`, `children`, `organizations`, `members`, `reimbursements`, `private_bookings`, `scheduled_courses`, `enrollments`, `operator_clock_records`, `operator_availability`, etc. Table names in Supabase may differ (e.g. `meeting_bookings` not `bookings`).
- **Direct PG** (`lib/pg.ts` via `DATABASE_URL`): Replit's built-in Postgres. Tables: `bookings`, `invoices`, `operators`, `operator_absences`, `member_medical_certs`, `operator_profiles`, `operator_discipline_rates`, `disciplines`, etc. Accessed via `pool.query<T>(sql, params)`.

**Why this matters:** Never use `supabase.from("bookings")` or `supabase.from("invoices")` — those tables only exist in the direct PG. Use `pool.query()` for them. The `executeSql` tool in code_execution queries the direct PG, not Supabase.

**How to apply:** Any new query for `bookings`, `invoices`, `operators`, `member_medical_certs`, `operator_absences` must use `pool.query`. Use `supabase.from()` only for tables confirmed to exist there (users, children, organizations, reimbursements, private_bookings, scheduled_courses, enrollments, etc.).
