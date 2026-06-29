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

# Known remaining items (not yet fixed — need user action / decision)

- **CRITICAL — rotate Supabase service_role key.** A plaintext service_role JWT is committed in `.replit` (`[env]` SUPABASE_KEY). It is in git history, so it must be rotated in the Supabase dashboard, then stored only as a Secret and the plaintext line removed. Also consider switching the public client to the anon key and using `supabaseAdmin` only where elevated access is truly required.
- pg.ts sets `ssl: { rejectUnauthorized: false }` (TLS verification off on the DB connection) — MITM risk; prefer a proper CA.
- Many server-generated HTML emails/receipts interpolate variables without HTML-encoding (semgrep html-in-template-string / raw-html-format) — escape user-controlled values to avoid HTML/email injection.
- Dependency audit: 0 critical / ~30 high / ~21 moderate (mostly transitive build/Expo deps) — run periodic `pnpm audit` and bump.
