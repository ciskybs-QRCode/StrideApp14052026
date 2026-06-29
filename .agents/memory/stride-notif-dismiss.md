---
name: Stride notification dismiss/close model
description: How in-app notifications are closed/hidden and why dismiss/read/open/skip routes must check ownership
---

# Notification dismiss / close

- Closing a notification = soft-hide via the pg `notification_read_receipts` table, NOT a delete. `dismissed_at` column (added by ALTER in pg.ts ensureTables). The dismiss route upserts `read_at + dismissed_at`; GET /private-notifications filters out rows whose receipt has `dismissed_at`.
- Read state is keyed on `read_at` (`read: !!receipt?.read_at`), not mere receipt existence — `read_at` is NOT NULL DEFAULT NOW() so this does not regress.
- Frontend: api.dismissNotification → NotificationsContext.dismiss does optimistic remove + re-fetch on failure; X button lives in NotificationBell NotifRow.

**Rule:** every notification state-mutation route (`/read`, `/open`, `/dismiss`, `/skip`) MUST call `ownsNotification(notifId, recipientId)` (Supabase select on private_notifications id+recipient_id) and 404 if not owned.
**Why:** without it any authed user can POST arbitrary notification ids and forge receipt/dismiss rows under their own recipient_id, polluting admin read-receipt analytics (IDOR). Caught in code review.
**How to apply:** when adding any new per-notification action route, reuse `ownsNotification` before writing receipt/audit rows.

# Push policy

- Push notifications are EMERGENCY-ONLY. Feature notifications (e.g. progress-videos) insert an in-app private_notification only — never an Expo push. App-icon badge handled by setBadgeCountAsync(unreadCount) in NotificationsContext.
