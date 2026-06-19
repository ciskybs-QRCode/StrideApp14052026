---
name: Stride Plan Tier & CRM System
description: Where plan_tier lives, how access grants work, trial-guard integration, and CRM screens
---

## Rule
Plan tier MUST be stored in pg `org_plan_settings` (local Replit PostgreSQL) — NOT in Supabase `organizations`.

**Why:** Supabase PostgREST schema cache makes ALTER TABLE additions invisible; ensureTables() targets Replit pg only. Attempts to use Supabase organizations.plan_tier will silently read null.

**How to apply:** Use `getOrgPlanTier(orgId)` / `setOrgPlanTier(orgId, tier)` exported from billing.ts. Both do pg upserts with ON CONFLICT.

## Tables (local pg)
- `org_plan_settings`: `(org_id PK, plan_tier, updated_at)` — current plan tier per org
- `org_access_grants`: `(id, org_id, granted_by, plan_tier, start_date, end_date, reason, is_active)` — super_admin free access windows
- `user_promo_assignments`: `(id, org_id, user_id, promo_code, discount_type, discount_value, message, valid_until, is_used)` — auto-push promos

## API Routes Added
- `GET /super-admin/metrics-plan` — plan breakdown: total/trialing/active/expired/granted + by_plan.{studio,company,academy}
- `GET /super-admin/associations-v2?tier=&search=` — Supabase name search + pg plan merge; returns effective_status ("granted" overrides trialing/active)
- `PATCH /super-admin/orgs/:id/plan-tier` — override plan tier for any org
- `GET/POST/PATCH /super-admin/orgs/:id/access-grants` — manage free access windows
- `POST /super-admin/orgs/:id/send-promo` — sends promo to all org users + in-app notif + push
- `GET /org/plan-features` — returns effective plan_tier + is_free_grant + feature flags Record<string,boolean>
- `GET /promo-codes/mine` — user's active unspent promos (from pg user_promo_assignments)
- `POST /promo-codes/mine/:id/mark-used` — consume a promo

## Trial Guard
Updated to call `checkActiveGrant(orgId)` via pg before returning 402. Super_admin always bypasses. Active Stripe subscriptions pass, then grants, then trial expiry check.

## Mobile Screens
- `sa-plan-orgs.tsx` — org browser with 6 tabs (All/Trial/Studio/Company/Academy/Expired), search bar, mini stats row; accepts `initialTab` param from navigation
- `sa-org-detail.tsx` — plan override (3 tier buttons), access grants list + modal (duration picker), send promo modal (type/value/days/message); modals are pageSheet
- `hooks/usePlanFeatures.ts` — 5-min in-memory cache; `can(feature)` helper; `invalidatePlanFeaturesCache()` after plan change

## Plan Features Map
studio: qr_checkin/attendance/documents/messaging/member_portal only
company: + smart_pickup/emergency_sos/payroll/courses/marketplace/events
academy: + ai_suite/ble_proximity/white_label/global_pricing/api_access

## Supabase .catch() Pattern
Supabase PostgrestFilterBuilder does NOT have a `.catch()` method in its TypeScript types. Use `try { await sa.from(...).insert({}) } catch { }` instead of `.catch(() => {})` — the latter causes TS2551 errors.
