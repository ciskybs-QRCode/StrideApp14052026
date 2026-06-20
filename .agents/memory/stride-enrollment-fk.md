---
name: Stride enrollment FK fix
description: How to insert enrollments when child_id FK points to children table but members table is the source of truth.
---

## Rule
`enrollments.child_id` has a FK constraint → `children.id`. Members are stored in `members`, not `children`. Direct Supabase inserts into `enrollments` with a `members.id` fail with `enrollments_child_id_children_id_fk` constraint violation.

**Fix in POST /enrollments**: use `pool` (direct Supabase PostgreSQL) to first mirror the member row into `children`, then insert the enrollment:

```sql
INSERT INTO children (id) SELECT id FROM members WHERE id = $1 ON CONFLICT (id) DO NOTHING;
INSERT INTO enrollments (child_id, course_id, status) VALUES ($1, $2, 'active') ON CONFLICT DO NOTHING RETURNING *;
```

**Why:** Supabase PostgREST schema cache doesn't know about ALTER TABLE columns added post-creation (like `organization_id` on `children`). The FK migration via pool silently fails because of permission limits. The dual-insert pattern is the safest workaround.

## Supabase builder `.catch()` TypeScript error
`supabase.from(...).insert({...}).catch(() => {})` → TS2551 — Supabase builder doesn't expose `.catch()`.
Use `.then(undefined, () => {})` as a fire-and-forget pattern instead. Or `void supabase.from(...).update(...)` for best-effort updates you don't await.

## Events purchase endpoint
- Route: `POST /events/purchase`
- Body uses **snake_case**: `event_id`, `ticket_type_id`, `quantity`, `event_date_id?`, `attendee_name?`
- Free tickets inserted directly; paid tickets → Stripe Checkout session URL returned
- Rate limiter on `/auth/login` will block tests after many rapid calls; wait before retrying

## courses table schema
`POST /courses` requires `name` (string) and `discipline` (string — not `discipline_id`). The `courses` table stores discipline as a plain text column, not a FK.
