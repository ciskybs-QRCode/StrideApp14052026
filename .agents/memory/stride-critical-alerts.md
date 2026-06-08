---
name: Stride Critical Alert Infrastructure
description: EmergencyPushService architecture, social buffer suppression, 60s ACK watchdog, Twilio fallback, iOS Critical Alert permissions.
---

## What was built

**Backend (api-server):**
- `lib/EmergencyPushService.ts` — core service
  - DB: `device_push_tokens` + `emergency_push_log` tables (auto-migrated at boot)
  - `sendEmergencyPush()` — Expo Push API with `sound.critical=true` (iOS), `channelId:"emergency"` (Android)
  - Social buffer check for `DEPENDANT_MISSING` — queries `admin_settings.social_buffer_minutes`
  - Records push to DB with `ack_deadline = NOW() + 60s`
  - Logs `EMERGENCY_PUSH` to SecurityObserver
  - Immediate Twilio fallback if all tokens fail
  - `startAckWatchdog()` — checks every 30s for unacknowledged pushes past deadline → Twilio
  - Twilio fallback: looks up `organization_members` with role admin/super_admin → SMS + Voice call
- `routes/notifications.ts` — 4 routes: register-token, emergency, acknowledge/:id, push-log
- Boot sequence in `index.ts`: `ensureMigration().then(() => startAckWatchdog())`
- `SecurityObserver`: added `EMERGENCY_PUSH` and `SOCIAL_ARRIVAL_WARNING` types

**Frontend (stride-app):**
- `lib/EmergencyService.ts` — `registerDevicePushToken()` (note: NOT `registerPushToken` — Babel collision), `requestNotificationPermissions()`, `getPermissionStatus()`, `configureNotificationHandler()`, `scheduleLocalEmergencyAlert()`, `acknowledgeEmergencyPush()`
- `context/EmergencyNotificationContext.tsx` — mounts inside `AuthProvider`; requests permissions on login; shows "Urgent: Security Settings" modal if iOS Critical Alerts not granted; registers device token; listens for incoming pushes and ACKs them
- `app.json` — `supportsTablet: true`, iOS entitlement `com.apple.developer.usernotifications.critical-alerts: true`, `UIBackgroundModes: ["remote-notification"]`, Android permissions (VIBRATE, RECEIVE_BOOT_COMPLETED, USE_FULL_SCREEN_INTENT), `expo-notifications` plugin with `sounds: ["./assets/sounds/emergency_siren.wav"]`
- `app/_layout.tsx` — `EmergencyNotificationProvider` wraps all children inside `AuthProvider`

## Key decisions

**Why `registerDevicePushToken` not `registerPushToken`:**
Babel/Metro registers the original import name in scope even when aliased (`import { registerPushToken as X }`). A local function with the same name throws "Duplicate declaration". Always use a different local name.

**Why `as unknown as { granted? ... }` casts on permissions:**
`expo-notifications@56` returns `NotificationPermissionsStatus extends PermissionResponse` but the `PermissionResponse` shape from this expo version doesn't expose `granted`/`status`/`canAskAgain` in TypeScript. Runtime behavior is correct; cast is needed for compilation.

**Why `NotificationBehavior` needs `shouldShowBanner + shouldShowList`:**
expo-notifications v0.29+ deprecated `shouldShowAlert` in favour of `shouldShowBanner` and `shouldShowList`. Both must be present for the handler to type-check.

**Social buffer suppression flow:**
`DEPENDANT_MISSING` + `classStartTime` + `scanTime within [startTime - buffer, startTime)` → logs `SOCIAL_ARRIVAL_WARNING` to SecurityObserver, inserts suppressed push log, returns `{ suppressed: true }`. No push, no Twilio.

**60s ACK watchdog:**
Server-side `setInterval(30s)`. Finds `emergency_push_log WHERE status='pending_ack' AND ack_deadline < NOW() AND twilio_fallback_triggered=FALSE`. For each: marks `twilio_fallback_triggered=TRUE`, sends Twilio SMS + Voice to all org admin phones.

**Twilio credentials:**
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` — not yet set (user prompted). Service gracefully skips Twilio when vars are absent (logs warn only).

**iOS Critical Alerts:**
Requires Apple Developer entitlement (production builds only). In Expo Go, `allowsCriticalAlerts` will be `false`; the permission prompt fires but iOS won't honour it without the special entitlement. Entitlement is declared in `app.json ios.entitlements`.
