---
name: Stride BLE Proximity Check-in
description: Frictionless auto check-in via BLE wearable beacons — DB, API, admin screen
---

## Architecture

**Wearable-centric model:**
- Each child wears a BLE wristband/keychain with a unique UUID
- A school-side BLE scanner (Raspberry Pi, tablet, hub) detects the UUID when child enters
- Scanner calls `POST /proximity/detect` → backend resolves UUID → child → logs CHECK_IN

**DB tables (`pg.ts`):**
- `proximity_beacons` — school's fixed BLE scanners/zones (uuid, label, zone, org_id)
- `child_beacon_assignments` — maps each child to their wearable UUID (`UNIQUE wearable_uuid`)

**API routes (`proximity.ts`):**
- `POST /proximity/detect` — core auto check-in endpoint (any auth)
  - Accepts `wearable_uuid` or `beacon_uuid` (both field names accepted)
  - 30-min duplicate guard prevents double-logging
  - Logs to `child_activity_log` via `SecurityObserver.logActivity(childId, "CHECK_IN", { trigger: "proximity", notes: "Detected via Proximity" })`
  - Does NOT write to `attendance_records` (no session context available from beacon signal)
- `GET/POST /proximity/beacons` — manage school scanners (admin)
- `DELETE /proximity/beacons/:id` — deactivate scanner
- `GET/POST /proximity/assignments` — manage child-wearable mappings (admin)
- `DELETE /proximity/assignments/:id` — remove assignment
- `GET /proximity/recent` — last 100 proximity check-ins from activity log (WHERE metadata->>'trigger' = 'proximity')

**Mobile:**
- `app/(admin)/beacons.tsx` — new admin screen (hidden tab in _layout.tsx)
  - "How It Works" flow card explaining scanner → detect → log
  - School Scanners section (register with UUID + label + zone)
  - Child Wearables section (assign UUID to child with child picker)
  - "Simulate Signal" button per assignment (calls proximityDetect for testing)
  - Recent Auto Check-ins list with BLE AUTO badge
- `app/(admin)/stats.tsx` — "BLE Proximity Check-in" entry card (deep ocean `#0C4A6E` with cyan `#38BDF8` accents)

**Why:**
- attendance_records requires session_id; proximity signal has no session context → only log to child_activity_log
- 30-min dedup guard in DB query (not application state) so it's stateless/safe across server restarts
- Simulate button is the demo mechanism since there's no real BLE hardware in dev
- UUID field accepts both `wearable_uuid` and `beacon_uuid` for IoT device flexibility
