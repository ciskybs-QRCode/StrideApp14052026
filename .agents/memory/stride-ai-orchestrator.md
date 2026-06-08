---
name: Stride AI Roster Orchestrator
description: Full autonomous rescue cascade pipeline — ReliabilityService, RosterOptimizer, RescueCascadeService, rescue routes, admin toggle, operator banner.
---

## Core formula
composite_score = (skill_match * 0.6) + (reliability_score * 0.4)

Skill Match levels:
- 1.00 → has discipline rate + completed sessions
- 0.70 → has rate only
- 0.50 → sessions only
- 0.30 → any adjacent discipline rate
- 0.10 → no qualification

Reliability Score = (attendance_rate * 0.6) + (cascade_acceptance_rate * 0.4)
- attendance_rate: based on operator_absences last 90 days vs 65 working days
- acceptance_rate: accepted/(accepted+declined) cascade_contacts last 90 days, default 0.75

## New DB tables (created via RescueCascadeService.ensureMigration() at boot)
- `rescue_cascades` — cascade header (org_id, absent_operator_id, discipline_id, status, auto_triggered, ...)
- `cascade_contacts` — per-operator contact row (cascade_id, operator_id, rank, skill_score, reliability_score, composite_score, status)
- Column added: `operator_profiles.reliability_score NUMERIC(4,3) DEFAULT 0.800`
- Column added: `admin_settings.cascade_auto_trigger BOOLEAN DEFAULT FALSE`

## Key files
- `lib/ReliabilityService.ts` — computes and updates reliability_score per operator
- `lib/RosterOptimizer.ts` — getRankedOperators() ranked by composite_score
- `lib/RescueCascadeService.ts` — triggerCascade(), acknowledge(), cancelCascade()
- `routes/rescue.ts` — 5 endpoints (trigger, cascades, cascade/:id, DELETE cascade/:id, pending, acknowledge)
- `routes/absences.ts` — auto-triggers cascade after operator absence if cascade_auto_trigger=true
- `routes/admin-settings.ts` — rewritten to use pool.query (bypasses PostgREST schema cache)

## Critical: admin_settings must use pool.query, not supabase client
The Supabase PostgREST client has a schema cache. Columns added via ALTER TABLE are invisible to it until cache reloads. All admin_settings reads/writes now use pool.query directly to avoid this.
**Why:** When we added cascade_auto_trigger via ALTER TABLE, the supabase JS client returned null for the new column — it had cached the old schema. Switching to pool.query resolved it.
**How to apply:** Any new column added to admin_settings (or other Supabase-cached tables) via migration must be read/written via pool.query if needed immediately after migration.

## API routes
- `POST /rescue/trigger` — admin: manually starts a cascade (discipline_id, absent_operator_id required)
- `GET /rescue/cascades` — admin: list all cascades with contact counts
- `GET /rescue/cascade/:id` — admin: detail + contacts array
- `DELETE /rescue/cascade/:id` — admin: cancel cascade
- `GET /rescue/pending` — operator: my pending contact requests (polls every 30s)
- `POST /rescue/acknowledge` — operator: {cascade_contact_id, accept: bool}

## Admin UI (app/(admin)/smart-roster.tsx)
- Cascade Orchestrator card at top: auto-trigger toggle + formula display
- Active Cascades card: live list, expand for stats (pending/accepted/declined), cancel button
- Manual "Launch Cascade" button next to "AI Analysis" in query form
- How Scores panel updated to reflect new 60/40 formula

## Operator UI (app/(operator)/dashboard.tsx)
- Purple "Rescue Requests" banner above Course Requests section
- Polls /rescue/pending every 30s
- Shows: course name, class datetime, AI match score, Accept/Decline buttons with haptic feedback
- On accept: cascade → resolved, reliability_score updated via ReliabilityService
