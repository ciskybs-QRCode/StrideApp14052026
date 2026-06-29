---
name: Stride security model & audit traps
description: Core security invariants for the Stride API and the recurring traps found in a deep security audit
---

# The single most important invariant

- The regular `supabase` client (`createClient(url, key)` in lib/supabase.ts) is constructed with a **service_role** key (env `SUPABASE_KEY` actually holds a service_role JWT). That means **RLS is fully bypassed** for almost all app data access. There is NO database-level safety net.
- **Consequence:** the API server's own auth + org-scoping checks are the ONLY thing protecting tenant data. Every route that reads/writes per-user / per-child / per-org data MUST verify ownership and filter by the caller's org. A missing org filter = a cross-tenant data leak, full stop.

# Recurring traps (verify these on every new route)

- **TokenPayload field is `orgId` (camelCase), never `org_id`.** Code that does `(user as { org_id?: number }).org_id ?? 1` silently reads `undefined` and **defaults to org 1**, leaking org 1's data to everyone and ignoring the real caller org. Always use `user.orgId`.
- **Never trust a client-supplied `org_id` in the request body.** Derive org from the token. Only `super_admin` may target another org explicitly.
- **Integer ids in params are guessable.** Any route taking `:id`/`:courseId`/`:memberId` must confirm the row belongs to the caller's org before read/write (e.g. `courseInOrg`, `ownsNotification`, member ownership selects). `ON CONFLICT (single_key)` upserts are especially dangerous — they can overwrite another org's row.
- **Sensitive-data endpoints need a role check, not just `requireAuth`.** Endpoints returning phone / medical / ambulance-consent / emergency-contact data (e.g. emergency members picker) must be gated to operator/admin, never any logged-in parent/member.

# Fixed in the deep audit

- **Plaintext key removed.** `SUPABASE_KEY` existed ONLY as a plaintext `.replit` `[userenv.shared]` env var (NOT a separate managed secret) — deleting that shared env var removed the key entirely. ALL runtime reads now use `SUPABASE_SERVICE_ROLE_KEY` (managed secret) with NO `SUPABASE_KEY` fallback — supabase.ts (both clients), trial-guard.ts, super-admin.ts, invites.ts. `SUPABASE_URL` stays in `.replit` (not sensitive).
- **Fail-closed JWT everywhere.** Both auth.ts AND trial-guard.ts now throw if `SESSION_SECRET` is missing — no `"stride-fallback-secret"` default anywhere.
- **DB TLS verification ON.** pg.ts now uses `ssl: { rejectUnauthorized: process.env.PGSSL_NO_VERIFY !== "1" }`. Verified empirically: Supabase's pooler cert validates against Node's default CA bundle, so verification works with no CA file. Escape hatch: set `PGSSL_NO_VERIFY=1` if a future env lacks the chain.
- **HTML injection escaped.** `esc()` in services/emailService.ts (trial/role/upgrade templates incl. toPlan/fromPlan) and `escapeHtml()` in routes/children.ts — both the confirm-promotion browser page (real XSS) AND the welcome email. Remaining raw interpolation lives in other route email builders (events/fee-events/employment/etc.) — lower risk (email clients strip script), apply same treatment over time. Browser-served HTML in events.ts (stripe callback/cancel) is fully static = safe.

# Known remaining items (need USER action / future work)

- **CRITICAL — user must still ROTATE the service_role key in the Supabase dashboard.** The old key is in git HISTORY (past commits of `.replit`), so removal alone is not enough — it must be regenerated, then the `SUPABASE_SERVICE_ROLE_KEY` secret updated and the app republished. Only the user can do this.
- Dependency audit: 0 critical / ~30 high / ~21 moderate (mostly transitive build/Expo deps). Deliberately NOT mass-bumped — blind upgrades across the large Expo app risk breaking the build. Do incrementally with testing.
- CSV exports (expenses.ts, schedule-management.ts) — consider CSV formula-injection guard (prefix leading =,+,-,@ with '). Not done; low risk.
