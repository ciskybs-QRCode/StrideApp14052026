---
name: Stride Kiosk & Sessions
description: Dual-entity kiosk QR flow, operator clock-in/out, session roster roll call, no-show alert disarm.
---

## Rule
The kiosk (`app/(kiosk)/index.tsx`) dispatches on `payload.type`: `"child"` → existing access-check + attendance POST with `check_in_method:"qr"`; `"operator"` → call `/operator-clock/status` then `/operator-clock/in` or `/operator-clock/out`.

**Why:** Physical kiosk must serve both member check-in and teacher payroll timekeeping from a single scan point.

## Operator clock records
- Table: `operator_clock_records` (SERIAL PK, operator_id, session_id, clock_in TIMESTAMPTZ, clock_out TIMESTAMPTZ)
- Routes: `POST /operator-clock/in`, `POST /operator-clock/out`, `GET /operator-clock/status`, `GET /operator-clock`
- Clock-in is idempotent (returns `already_clocked_in: true` if open record exists today)

## Attendance method column
- `attendance_records.check_in_method` column added (ALTER TABLE IF EXISTS, values: `'qr'`, `'manual'`, `'signed_out'`)
- `api.addAttendance` type extended with `check_in_method` and `attended_at` extra fields

## Sessions roster (operator)
- Screen: `app/(operator)/sessions.tsx` — MUST be a flat file, NOT a `sessions/index.tsx` directory (Expo Router registers it as `sessions/index` if in a dir, which breaks tab routing)
- Tab registered as `name="sessions"` in `app/(operator)/_layout.tsx`
- Status badges: 🟢 QR Check-In, 🟣 Manual, 🔴 Absent, ⬜ Signed Out
- Manual override: tap absent row → confirm modal → `api.addAttendance` with `check_in_method:"manual"`
- Bulk sign-out: gold "Session Sign-Out (All Active)" button → `api.bulkSignOut(sessionId)` → updates all present records to `signed_out`
- Live poll every 15 s

## No-show alert disarm
- `checkNoShowAlerts()` in reminder-scheduler runs every 60 s via `checkReminders()`
- Window: courses that started 5–15 min ago (center = 10 min ago)
- If any attendance record exists for the child today → SKIP (disarm)
- Fires `private_notifications` with `type:"no_show_alert"` only if child is still absent
- Dedup key in body: `ref:{todayStr}|course:{courseId}`
