---
name: Stride round-trip test fixes
description: Server bugs found and fixed during full round-trip persistence test; patterns worth remembering.
---

## Key fixes applied

**operator_profiles FK constraints**
- `profile_type` has CHECK constraint: only `'paid'` | `'volunteer'` allowed (not `'operator'`).
- Bank-details upsert INSERT must include `profile_type = 'paid'`.

**super_admin JWT orgId**
- auth.ts was forcing `orgId = 0` for super_admin role — this broke all org-scoped routes (FK violations, "no org context").
- Fix: always use `user.organization_id ?? 1` regardless of role.
- Test user admin@test.com: set `role='super_admin'`, `roles=["parent","operator","admin","super_admin"]`, `organization_id=1`.

**requireOwnerOrSuperAdmin checks JWT `user.role` only**
- The middleware does `user.role === "super_admin"` — it does NOT check the `roles[]` array.
- To pass SA routes in tests, the primary `role` field must be `super_admin`.

**Express route ordering: named routes shadow :param routes**
- `/employment/:profileId` matched `/employment/my-contract` and returned 400 (isNaN("my-contract")).
- Fix: added `if (req.params["profileId"] === "my-contract") { next("route"); return; }` at top of `:profileId` handler.
- General pattern: whenever a named sub-route exists under a `:param` parent, add a next("route") guard for that name.

**Supabase schema cache: operator_availability FK**
- Table created via psql → PostgREST PGRST200 "could not find relationship" on JOIN queries.
- Fix: rewrote GET /availability to use pool.query() with explicit LEFT JOINs instead of Supabase relational syntax.
- operator_availability needs `status TEXT NOT NULL DEFAULT 'pending'` column (added via ALTER TABLE).

**hardcoded role checks bypass requireRole**
- `/legal/audit-log` had `if (user.role !== "admin") return 403` — super_admin was denied.
- Fix: `if (user.role !== "admin" && user.role !== "super_admin")`.
- Always check: does a route have a hardcoded `user.role === "admin"` that bypasses the middleware?

**Missing import = silent 500**
- Switching availability.ts GET from supabase to pool.query() without adding `import { pool }` → ReferenceError at runtime, 500 with no helpful message.

**Supabase table creation**
- New tables created via psql: `direct_message_threads`, `private_notifications`, `operator_availability`.
- Always add `status TEXT NOT NULL DEFAULT 'pending'` or similar NOT NULL columns at creation time — ALTER TABLE later triggers schema cache refresh delays.

**Test infrastructure**
- round_trip_test.py needs per-request timeout ≤ 3s to complete in reasonable time.
- All 30 sections share state (TOKEN, disc_id, existing_op_id) — cannot exec sub-sections in isolation.
- Correct invites paths: `/invites/generate-code`, `/invites/codes`, `/invites/my-orgs`.
- Super-admin paths: `/super-admin/associations`, `/super-admin/metrics`, `/super-admin/metrics-plan`.
