---
name: Stride mandatory legal signature gate persistence
description: How the parent "Documents Awaiting Signature" gate decides what to show, and the persistence/security rules it must follow.
---

The parent `(parent)/_layout.tsx` shows a blocking modal for any `legalAdminDocs` with `mandatorySignature && !signedAdminDocIds.includes(id)`. `signedAdminDocIds` lives in `AppDataContext`. Doc ids are local strings (e.g. `ld1`); backend `legal_signatures_audit_log` stores the same string in `document_id`, and `GET /legal/signed-ids` returns DISTINCT `document_id` per `user_id`.

**Rule:** signing must persist so the gate appears ONCE per user, never at every access.

**Why:** originally `signedAdminDocIds` started `[]` every launch and was only filled by an async backend call, so the gate flashed on every open; and if the audit write failed silently nothing persisted → re-prompt forever.

**How to apply (the working design):**
- Cache signed ids per-user in AsyncStorage `stride_signed_doc_ids_v1:${user.id}`; hydrate locally FIRST, then merge backend ids and persist the union. `signAdminDoc` also writes the new set to that cache.
- HARD RESET `signedAdminDocIds=[]` + `signedIdsLoaded=false` on every `user.id` change and logout, and REPLACE (never merge with previous in-memory state) — otherwise user B inherits user A's signatures in the same runtime (cross-user gate bypass, since ids like `ld1` are shared).
- `blocked` must require a `signedIdsLoaded` flag, and a fail-safe full-screen loader blocks content while `!signedIdsLoaded` (non-super-admin) so unsigned users can't slip past during load.
- Release the loader as soon as the LOCAL cache is trusted, and time-box the backend sync (Promise.race ~6s) — `lib/api.ts` request() uses raw fetch with NO timeout, so a hung request would otherwise lock the app forever.
- The cache is a positive list of SIGNED ids only, so a NEW mandatory doc is absent → still gated (fail-safe). super_admin is never gated.
