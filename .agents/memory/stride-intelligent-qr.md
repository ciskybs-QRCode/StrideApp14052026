---
name: Stride Intelligent QR Guardian
description: Time-window validation, single-use tokens, and Exception Protocol override for Guardian Circle QR scans.
---

## New DB columns on authorized_pickups (added via ALTER TABLE IF NOT EXISTS)
- `is_single_use BOOLEAN DEFAULT FALSE` — token invalidated after first successful scan
- `used_at TIMESTAMPTZ` — null = not yet consumed
- `pickup_days TEXT[]` — e.g. ["MON","WED","FRI"], null = any day
- `pickup_window_start TIME` — e.g. "15:00", null = any time
- `pickup_window_end TIME` — e.g. "16:30", null = any time
- `window_tolerance_minutes INTEGER DEFAULT 30`

## API routes
- `POST /guardian-circle` — now accepts all new fields above
- `POST /guardian-circle/:id/scan` — Intelligent QR validation; returns `{verdict, reason?, guardian}`
  - Checks: is_active → expires_at → single-use consumed → time window (day + time ± tolerance)
  - On verdict=ok: marks used_at if single_use; logs GUARDIAN_SCANNED
- `POST /guardian-circle/:id/override` — Exception Protocol confirmation; logs OVERRIDE_SCANNED

## Security Timeline events
`GUARDIAN_SCANNED` and `OVERRIDE_SCANNED` added to SecurityEventType union.

## Override flow in operator dashboard
- QR format: `STRIDE:GUARDIAN:<guardianId>:<childId>:<name>:<relationship>`
- On scan: calls `api.scanGuardianQR(guardianId, {child_id})`
- verdict=ok → `showGuardianResult(...)` → normal Verify & Sign flow
- verdict=override_required → sets `overrideData` state → amber Exception Protocol panel
- Panel shows: reason, guardian/child info, warning text, Deny / Override&Proceed buttons
- Override&Proceed: calls `api.confirmGuardianOverride(...)` → logs OVERRIDE_SCANNED → opens signature pad
- Graceful degradation: if API call throws, falls back to authorized=true (system availability)

## Parent UI (guardian-circle.tsx)
- Add Guardian form: Single-Use Toggle, Time Window Toggle, Day chips, start/end time, tolerance input
- GuardianCard shows: Single Use badge (purple=active, grey=used), Window badge (blue, shows times+days)
- isUsed guard: hides Deactivate button for consumed single-use tokens

## Key design rule
`PUT /guardian-circle/:id/scan` MUST be before `PATCH /guardian-circle/:id/deactivate` in route order (no conflict since methods differ, but keep scan before deactivate for readability).
Route ordering is safe: POST /guardian-circle (no param) → GET /child/:childId → GET /check → POST /:id/scan → POST /:id/override → PATCH /:id/deactivate.
