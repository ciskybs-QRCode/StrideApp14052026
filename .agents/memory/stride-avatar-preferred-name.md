---
name: Stride avatar + preferred name persistence
description: Why profile photos vanished on web reload and how avatar picking + preferred_name must be wired across the app.
---

# Avatar photo persistence (web/PWA)

**Rule:** every profile-photo picker MUST go through `lib/avatar.ts` `pickAvatarDataUri()`, which launches expo-image-picker with `base64: true` and returns a `data:` URI.

**Why:** on web/PWA, `launchImageLibraryAsync` without `base64` returns an ephemeral `blob:` URI. It gets stored to AsyncStorage but is invalid after a page reload (object URL revoked) → "photo disappears on every reopen". `expo-file-system`'s `readAsStringAsync` cannot convert a `blob:` URI on web (AuthContext.updateUser only converts `file://`), so the blob persisted unchanged. A `data:` URI works identically on web + native and survives restarts.

**How to apply:** there are MULTIPLE avatar-edit entry points — parent/operator/admin home headers, `(operator)/settings.tsx`, `(parent)/documents.tsx`, and `onboarding.tsx`. If you add another, route it through `pickAvatarDataUri()` + `updateUser({ profilePhotoUri })`, never raw `result.assets[0].uri`. `profile_photo_url` is a Supabase `users` column that already round-trips on login.

# preferred_name round-trip

**Rule:** `preferred_name` lives ONLY in pg `user_profile_extra` (unique on `user_id`), never in Supabase `users`. Login must SELECT it from pg and return it as `preferredName`; `PATCH /user/me` upserts it into pg and must NOT 400 when only `preferred_name` is sent.

**Why:** a prior bug read `u.preferred_name` from the Supabase users row (column doesn't exist) so `preferredName` was always null after re-login. AuthContext.updateUser already maps `preferredName → preferred_name` in the PATCH payload and consumes returned `preferredName` on login (guards against `{`-prefixed JSON + empty).

**How to apply:** home greeting is `Hi {user.preferredName || firstName(name) || "there"}` in all 3 home headers. Cross-role persistence is automatic via the single shared AuthContext user object (switchActiveRole/switchOrgContext preserve fields). ProfileEditContent must call `updateUser({ preferredName })` (not just `saveProfileExtra`) so the live greeting refreshes.
