---
name: Stride Cascade Substitute Batch 4
description: Decisions and constraints from the Operator Absence → Substitute Cascade implementation (Batch 4).
---

## Hard cutoff — RosterOptimizer
`OptimizerParams.minCompositeScore?: number` — pass `0.30` from `triggerCascade()`. Candidates below this score are excluded entirely (not just ranked low).

**Why:** Consultant spec: unqualified candidates must not appear in the cascade list at all.

## Contact status model — cascade_contacts
- Rank 1: `status='pending'`, `contacted_at=NOW()` on insert.
- Rank 2+: `status='waiting'`, `contacted_at=NULL` on insert.
- `contacted_at` column is nullable (migration: `ALTER COLUMN contacted_at DROP NOT NULL`).

**Why:** Only one candidate is actively contacted at a time; the rest queue silently.

## Scheduler — checkCascadeTimeouts() (reminder-scheduler.ts)
- Runs every 60s (wired into `startReminderScheduler()`).
- Part A: finds pending contacts with `contacted_at + 5 min <= NOW()` → marks `expired` → promotes next `waiting` → sends push/in_app per channel setting.
- Part B: finds cascades `status='pending'` older than 15 min → marks `needs_admin_decision` + admin push+in_app.

## Double-notification guard
Part B query adds `AND NOT EXISTS (SELECT 1 FROM cascade_contacts cc WHERE cc.cascade_id=rc.id AND cc.status='pending' AND cc.contacted_at + INTERVAL '5 minutes' > NOW())`.

**Why:** Without this, a cascade just promoted by Part A (newly active candidate) would also be escalated by Part B in the same scheduler tick.

## No-candidates path
If `ranked.length === 0` after minCompositeScore filter → update cascade `status='no_qualified_substitute'` → call `RescueCascadeService.notifyAdminsNoSubstitute()` immediately → return cascadeId (no contacts inserted).

## Admin notifications — 3 distinct texts
- `no_qualified_candidates`: "No qualified substitute was found for X."
- `all_candidates_expired`: "All available substitutes declined or timed out for X."
- `timeout_15min`: "No substitute accepted for X within 15 minutes."

All admin notifications send both push (`EmergencyPushService.sendCascadePush`) and in-app (`private_notifications`).

## Candidate notifications — channel control
`admin_settings.cascade_notify_channel TEXT NOT NULL DEFAULT 'both'` (pool, via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
- `'push'`: only `EmergencyPushService.sendCascadePush`.
- `'in_app'`: only `supabase.from("private_notifications").insert` with `recipient_id=parseInt(operatorUserId,10)`.
- `'both'`: both.

UI: 3-chip selector in `smart-roster.tsx` (Cascade Orchestrator card, below the auto-trigger badge).
API: loaded from GET /admin-settings, saved via PUT /admin-settings.

## New push method — EmergencyPushService.sendCascadePush
Non-critical, single-user, no suppression, no Twilio fallback. channelId `cascade_substitute`. Fire-and-forget (`.catch(() => {})`).

## Preset template — substitute_confirmed
Added to `DEFAULT_TEMPLATES` in `preset-messages.ts`. Variables: `{operator_name}`, `{course_name}`, `{class_date}`, `{association_name}`. Channels: inapp+push+email all true.

## SubstitutionContext.tsx
**NOT deleted** — pending explicit confirmation from Francesco.
