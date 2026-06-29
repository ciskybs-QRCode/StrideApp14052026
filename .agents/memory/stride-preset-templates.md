---
name: Stride preset message templates
description: Where admin message templates live and why an empty preset_messages table is normal (avoids false "data deleted" alarms)
---

# Stride preset message templates

The 11 admin "message templates" (birthday, welcome, role change, onboarding,
waitlist joined/spot, new course, cert reminders member/operator, grace access,
payment overdue) are **hard-coded as `DEFAULT_TEMPLATES` in
`artifacts/api-server/src/routes/preset-messages.ts`**.

- `GET /preset-messages` ALWAYS returns all 11, merging any per-org overrides
  from the pg `preset_messages` table on top of the code defaults.
- The `preset_messages` table only stores **customizations**. An **empty table
  (0 rows) is completely normal** and does NOT mean templates were lost. They
  can never be "deleted" as data — they live in code.
- `super_admin` passes `requireRole("admin")` (auth.ts lets super_admin through
  any role gate), so role is not the cause if the Templates tab looks empty.

**Why:** A user once panicked that "all admin templates disappeared." They were
never lost — the cause was UI location, not data. Whenever templates "look gone",
check (a) the UI location, (b) a failing GET (table missing → 500 → empty tab),
NOT data loss.

**How to apply:** The admin UI for these now lives in the **Communications**
screen (`artifacts/stride-app/app/(admin)/messages.tsx`) under the **Templates**
section, reached via a HubCard ("Message Templates"). The old
`settings/preset-messages.tsx` is just a redirect to `/(admin)/messages`. If the
list looks empty, it's almost always stale client cache (logout + hard refresh)
or a backend error — never deleted defaults.
