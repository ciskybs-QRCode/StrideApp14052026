---
name: Stride Video Progress Diary
description: Flagship Fase 1 feature — staff record short progress videos of a member, parents watch a chronological per-child diary.
---

# Video Progress Diary

Staff (admin/operator) record short clips of a member; the parent watches a chronological per-child diary.

- Backend: `progress_videos` pg table (pg pool, ensureTables) + `routes/progress-videos.ts` mounted in routes/index.ts. POST /upload (multer 100MB, video mime only → stride-attachments bucket under progress-videos/org-X/), POST / (staff-only insert + notify + push), GET /?memberId= (parent gated to own children via member.user_id; staff org-scoped), DELETE /:id (staff org-scoped).
- Mobile: shared `components/ProgressDiary.tsx` (props memberId/memberName/canRecord) used by `(parent)/progress-diary.tsx` (view-only) and `(operator)/progress-diary.tsx` (canRecord). Entry buttons in parent children.tsx card and operator student-detail.tsx. Both screens registered as `href:null` Tabs.Screen.
- expo-av Video v16: `import { ResizeMode, Video } from "expo-av"`. expo-image-picker v17: `mediaTypes: ["videos"]`, `videoMaxDuration: 60`.

**Key constraint — private_notifications insert column:** use `recipient_id` (NOT `user_id`). The read path `GET /private-notifications` filters `.eq("recipient_id", user.id)`, so any insert using `user_id` creates rows the recipient never sees. `read: false` column DOES exist and works (attendance.ts confirms). `type` has no restrictive CHECK — arbitrary values like "progress_video" are fine. Read state is merged from pg `notification_read_receipts`, not the supabase `read` column.
**Why:** several legacy routes (messages.ts, documents.ts, operator-certs.ts) insert with `user_id`/`org_id` and are silently invisible to the bell. Always mirror the attendance.ts pattern: `{ organization_id, recipient_id, type, title, body, read }` and log `notifError` via req.log instead of swallowing it.
