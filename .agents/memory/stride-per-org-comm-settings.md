---
name: Stride Per-Org Communication Settings
description: Architecture for per-org Resend/Twilio credentials — each association manages its own email/SMS provider.
---

## Rule
Every organisation stores its own Resend (email) and Twilio (SMS) credentials in the `org_communication_settings` pool table. Never assume global env vars are the only source.

## Architecture
- **DB table**: `org_communication_settings` in pg pool (NOT Supabase) — resend_api_key, resend_from_email, twilio_account_sid, twilio_auth_token, twilio_from_number, UNIQUE(organization_id).
- **Routes**: GET/PUT `/org/communication-settings`, POST `/org/communication-settings/test-email`, POST `/org/communication-settings/test-sms` — in `routes/communication-settings.ts`.
- **EmergencyPushService**: `_getOrgTwilioCreds(orgId)` and `_getOrgResendCreds(orgId)` — DB-first, env var fallback; called by `_sendTwilioFallback` and `_sendEmailFallback`.
- **Pioneer wizard**: step 4 (of 6) — Communications Setup. Admin can leave app to sign up for Resend/Twilio then return. Skippable.
- **Admin settings**: `settings/communication-settings.tsx` — post-setup management screen with step-by-step guides and test buttons.
- **api object**: `api.getCommSettings()`, `api.saveCommSettings()`, `api.testEmail()`, `api.testSms()` added to the `api` object in `lib/api.ts` (inside the object literal, not as standalone exports).

## Why
Multi-tenant SaaS: Stride can't own all email/SMS traffic for every association. Each org independently owns their provider accounts and credentials.

## How to apply
When any service sends email or SMS, ALWAYS use `_getOrgResendCreds(orgId)` / `_getOrgTwilioCreds(orgId)` — never `process.env["RESEND_API_KEY"]` directly.
`req.user` has no `phone` field — query phone from `pool.query("SELECT phone FROM users WHERE id = $1")`.
