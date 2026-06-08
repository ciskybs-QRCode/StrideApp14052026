---
name: Stride Zero-Trust Security Refactor
description: All changes made during the comprehensive zero-trust security hardening across 5 modules
---

## Summary of all changes

### Module 1 — Security Lockdown (API org-scoping)

**attendance.ts**
- `GET /students` → adds `.eq("organization_id", user.orgId)` to children query
- `GET /attendance` → resolves org-scoped child IDs first, then `.in("child_id", childIds)` on records
- `PATCH /attendance/:id` → field whitelist (`status`, `signed_out_at`, `signed_out_by`, `notes`) + org ownership check via `children!inner` join
- `PATCH /students/:id/stars` → org scope on both fetch and update

**children.ts**
- `PATCH /members/:id` → upgraded from `requireAuth` → `requireRole("admin","operator")` + org ownership check + field whitelist
- `DELETE /members/:id` → upgraded from `requireAuth` → `requireRole("admin")` + org ownership check

**access-check.ts**
- `GET /access-check/:childId` → `.eq("organization_id", orgId)` on child fetch (already had orgId from user)
- `PATCH /access-check/:childId/payment` → `.eq("organization_id", patchUser.orgId)` on update

**blacklist.ts**
- `DELETE /blacklist/:id` → `WHERE id=$1 AND organization_id=$2`; returns 403 if rowCount=0

**org.ts**
- `GET /terminology` → was public (no auth, hardcoded org id=1); now `requireAuth` + `user.orgId`

**admin-kiosk.ts**
- `GET /kiosk-pin` → added `requireRole("admin","operator","kiosk")` — parents excluded

### Module 2 — Auth & Session Hardening

**auth.ts** (full rewrite)
- JWT TTL: 7d (was 30d)
- `requireAuth` is now **async** — safe in Express 5
- Live blocked-user check via Supabase `users.blocked` column
- 30-second in-memory cache (`blockedCache` Map) to avoid DB hit on every request
- All `console.log` → `logger.debug/warn`

**AuthContext.tsx**
- New `fullLogout()` method: scans ALL `AsyncStorage` keys for `stride_*` prefix and removes them all dynamically — future-proofs against new stride_* keys
- Exposed in `AuthContextType` interface and Provider value

### Module 3 — DB Integrity

**lib/db/src/schema/bookings.ts**
- Added `unique("bookings_availability_unique").on(t.availabilityId)` to table constraints
- Prevents double-booking the same availability slot

**lib/db/src/schema/disciplines.ts**
- Added `unique("disciplines_org_name_unique").on(t.organizationId, t.name)` to table constraints
- Prevents duplicate discipline names per org

### Module 4 — Robustness

**artifacts/api-server/src/lib/parseId.ts** (new file)
- `parseId(value, label?)` — safe integer parse; throws `{statusCode: 400}` error if NaN, non-finite, or ≤0
- Should replace raw `parseInt()` at all user-input call sites

**super-admin.ts:52**
- `console.log(...)` → `req.log.info(...)` 

### Module 5 — AI Cost Control

**rate-limit.ts**
- New `aiLimiter` export: 10 calls/minute per user, keyed `ai:${user.id}`

**documents.ts**
- `POST /documents/analyze-medical-certificate` → added `requireRole("admin","operator")` + `aiLimiter`

**admin-copilot.ts**
- `POST /admin/copilot-query` → added `aiLimiter` (already had requireRole("admin"))

## Key patterns

- The Supabase `!inner` join in `attendance.ts` returns `child` as array|object union from TS perspective; always cast via `Array.isArray()` + `as unknown as T` for the object branch.
- `children.ts` requires `requireRole` import separately from `requireAuth` (was missing).
- DB push without `--force` is a safe preview-only run.
