---
name: Stride video privacy gate
description: Rules that restrict the progress-video / filming feature, and where they are enforced.
---

# Progress-video privacy restrictions

Two hard rules govern recording a progress video of a member:

1. **Media consent required.** Filming is permitted only when the member's
   `media_consent` is `full` or `internal`. `none` (or missing) → recording blocked,
   camera must not even open.
2. **Private 1-on-1 lesson only.** A progress video may be recorded only inside a
   private 1-on-1 lesson linking the acting operator to that member — i.e. a
   `private_lesson_bookings` row with `operator_user_id` = acting user, `child_id` =
   member id, and status in (`booked`,`confirmed`,`completed`).

**Why:** privacy/liability — the owner is strict about not filming members who have not
consented, and video must be tied to a real 1-on-1 lesson context, not casual filming.

**How to apply:**
- Authoritative enforcement is **server-side** in `POST /progress-videos`
  (artifacts/api-server/src/routes/progress-videos.ts): it reads `members.media_consent`
  and checks for an eligible booking; returns 403 `MEDIA_CONSENT_REQUIRED` or
  `PRIVATE_LESSON_REQUIRED`. Client gating alone is bypassable (nav params), so never
  rely on the UI for this.
- `media_consent` lives on the **members** table (not children); the diary `member_id`
  maps to `members.id`.
- Client mirror: operator `progress-diary.tsx` computes `canRecord` and passes
  `recordBlockedReason` + `mediaConsent` to `ProgressDiary`, which hard-returns in
  `handlePick` when consent is none. Parent diary stays view-only (`canRecord={false}`).
