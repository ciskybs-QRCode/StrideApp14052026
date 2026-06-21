---
name: Stride Membership Policy System
description: Mandatory membership, renewal types, expiry reminders, auto-suspend, member withdrawal, admin QR gate
---

## DB columns added to admin_settings (pg pool)
- `membership_mandatory` BOOLEAN DEFAULT FALSE
- `membership_renewal_type` TEXT DEFAULT 'monthly' — 'monthly'|'annual'|'days'|'fixed_date'
- `membership_renewal_days` INTEGER DEFAULT 365
- `membership_renewal_fixed_date` DATE
- `membership_reminder_days` TEXT DEFAULT '[30,15,7,3,1]' (JSON array)
- `membership_suspend_on_expiry` BOOLEAN DEFAULT FALSE

## DB columns added to member_subscriptions (pg pool)
- `expires_at` TIMESTAMPTZ
- `membership_status` TEXT DEFAULT 'active'

## New pg table: membership_reminder_log
- Dedup table for expiry reminder notifications (subscription_id + reminder_day UNIQUE)

## Scheduler: lib/membership-scheduler.ts
- Runs 30s after boot, then every hour
- Sends in-app notifications on configured reminder days before expiry
- Suspends memberships past expires_at when suspend_on_expiry = true
- Started in index.ts alongside other schedulers

## New routes: routes/enrollments.ts
- `POST /enrollments/withdraw` — member withdraws from course (best-effort Supabase update)
- `DELETE /memberships/leave-org` — leave org while keeping Stride account
- TokenPayload has id/email/role/orgId/globalUserId — NO supabaseId field

## Admin screens
- `app/(admin)/settings/membership-policy.tsx` — full policy config UI
- `app/(admin)/qr-gate.tsx` — QR scanner for check-ins + event tickets (reuses CameraView)
- Both wired into settings/index.tsx and operations-hub.tsx respectively

## Member withdrawal
- courses.tsx handleWithdraw now calls backend POST /enrollments/withdraw (best-effort, optimistic UI)
- api.ts: withdrawFromCourse(courseId, childId?), leaveOrg()

## Landing page
- Landing.tsx nav: "Sign In" button → /join?signin=1 (desktop + mobile menu)
- Join.tsx: useEffect detects ?signin=1 param → auto-switches to sign-in mode tab

**Why:** Multi-tenant accounts should survive org departure; withdrawal must persist to backend not just local state.
