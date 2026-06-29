---
name: Stride org public profile + global font
description: Backend persistence of school social/hours + operator early-absences, and the global Montserrat font interceptor decision.
---

# Org public profile (point 2 of the persistence audit)

School-info social links + opening hours and operator early clock-out absences were AsyncStorage-only (device-local, lost on reinstall, not cross-device). Moved to backend:

- pg table `org_public_profile` (in `api-server/src/lib/pg.ts` ensureTables) — org-scoped social/hours blob. Lives in pg pool, NOT Supabase (same reason as all other Stride pg tables: ensureTables targets Replit PostgreSQL, Supabase PostgREST schema cache hides new columns).
- Routes in `org.ts`: `GET /org/public-profile`, `PUT /org/public-profile` (admin-gated, COALESCE upsert so partial updates don't null other fields). `org.ts` imports `pool` directly.
- Operator absences in `absences.ts`: `POST /absences/operator/clock-out-early`, `GET /absences/operator/mine`. Table `operator_absences`; dates stored as DATE, read back via `to_char(absence_date,'YYYY-MM-DD')`.
- `api.ts` methods: getOrgPublicProfile, updateOrgPublicProfile, recordEarlyClockOut, getMyOperatorAbsences.
- Readers wired: school-information.tsx (read+save social+hours), parent home.tsx (read social), operator dashboard.tsx (write on early clock-out), operator invoicing.tsx (read absences).

**Multi-tenant gotcha:** every operator-scoped read MUST also filter `org_id`, not just `operator_id`. `GET /absences/operator/mine` originally filtered operator_id+status only — a tenant-isolation gap caught in code review. Pattern: `WHERE operator_id = $1 AND org_id = $2`, param `(user as { orgId?: number }).orgId ?? null`.

# Global Montserrat font (point 4)

`lib/global-font.ts` exports `applyGlobalFont()` (called once in `app/_layout.tsx`) which monkeypatches `Text.render`/`TextInput.render` to map `fontWeight` → the correct loaded Montserrat variant. It LEAVES explicit `fontFamily` overrides untouched, so icon fonts (Ionicons/Feather, which set their own fontFamily) are unaffected.

**Why this approach:** RN has no first-class "default font family" API; the render-interceptor is the standard workaround.
**Caveat (flagged in review):** patching internal `.render` is unsupported API and may break on a future RN/Expo upgrade. If fonts suddenly render wrong after an Expo bump, suspect this file first.

# "Coming Soon" stubs (point 5)

Audit rule: no user-facing "Coming Soon" for paying customers. The remaining offender was `app/(admin)/beacons.tsx` BLE toggle (subtitle + enable alert said "Coming soon"). Fixed by making it a real enable/disable toggle (BLE backend already exists per stride-ble-proximity). When auditing for stubs, grep is case-sensitive-trap: "Coming soon" vs "Coming Soon" — search case-insensitively.
