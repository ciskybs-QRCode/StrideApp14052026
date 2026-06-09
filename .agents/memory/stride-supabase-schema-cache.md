---
name: Stride Supabase PostgREST schema cache constraints
description: Which columns were added via ALTER TABLE and are invisible to PostgREST INSERT/UPSERT; workarounds for seeding data.
---

## The problem

PostgREST (and supabase-js, which calls it) validates INSERT/UPSERT column names against a schema cache built at PostgREST startup. Columns added later via raw `ALTER TABLE` are not in that cache and cause `PGRST204 "column not in schema cache"` for any INSERT/UPSERT that includes them, even via raw `fetch()`.

UPDATE/PATCH is more lenient — it generally works for those columns on existing rows.

**Why:** ensureTables() runs raw `ALTER TABLE … ADD COLUMN IF NOT EXISTS` on the shared Supabase instance. PostgREST's cache pre-dates those calls.

## organizations table (id 999 sandbox seeding)

Safe for INSERT (in original schema):
- `id`, `name`, `invite_code` (NOT NULL), `trial_ends_at` (NOT NULL), `plan`, `region`, `date_format`

NOT safe for INSERT (added via ALTER TABLE — use PATCH after insert):
- `subscription_status`, `system_configured`, `country`, `currency`, `stripe_*`, `birthday_message`, `member_label`, `trial_started_at`

**Seed approach:** Two-step — raw `fetch()` POST with schema-safe columns (must include `invite_code` + `trial_ends_at` to satisfy NOT NULL), then `fetch()` PATCH for the ALTER-TABLE columns.

## users table

Safe for INSERT:
- `organization_id`, `email`, `name`, `role`, `password_hash`, `phone`, `blocked`, `is_volunteer`

NOT safe for INSERT:
- `activation_status`, `onboarding_complete` (both added via ALTER TABLE)

## members table (children / dependents)

Original schema (only 8 columns): `id`, `organization_id` (NOT NULL), `user_id` (NOT NULL), `full_name` (NOT NULL), `date_of_birth`, `notes`, `created_at`, `updated_at`

NOT safe for INSERT (use `full_name`, NOT `name`):
- `first_name`, `last_name`, `parent_id`, `name`, `status`, `phone`, `emergency_contact`, `allergies`, `photo_uri`, `medical_notes`

**Seed approach:** raw `fetch()` POST with `{organization_id, user_id, full_name}`.

## notifications table — type CHECK constraint

Valid `type` values (hard constraint, not ALTER TABLE):
```
'booking_request' | 'booking_confirmed' | 'booking_cancelled' |
'availability_approved' | 'availability_rejected' |
'lesson_reminder' | 'payment_received'
```
Do NOT use: `lesson_cancelled`, `schedule_change`, `emergency_pulse` (these aren't in the constraint).

## child_transit_states (NOT child_proximity_states)

Real table name is `child_transit_states`. Schema: `id` (uuid), `child_id` (TEXT, UNIQUE), `status`, `transit_lock`, `transit_started_at`, `updated_at`. No `organization_id`, `wearable_uuid`, `last_seen_at`, or `zone_category` columns.

For sandbox BLE trigger, use `child_id = 'sandbox-ble-{memberId}'` so reset can `DELETE WHERE child_id LIKE 'sandbox-ble-%'`.
