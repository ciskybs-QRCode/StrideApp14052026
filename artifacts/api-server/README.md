# Stride API Server

Express 5 + Supabase backend powering the Stride mobile app.  
All routes are prefixed with `/api` and served through the shared reverse proxy.

---

## Architecture at a glance

```
Mobile App (Expo)
      │
      ▼  HTTPS /api/*
Reverse Proxy (Replit)
      │
      ▼  :8080
API Server (Express 5 + esbuild)
      ├── Supabase (global identity, RLS-protected tables)
      └── PostgreSQL pool (org-level operational tables)
```

**Two separate databases** — never mix their clients:

| Client | Variable | Tables | Notes |
|---|---|---|---|
| `supabase` | `SUPABASE_SERVICE_ROLE_KEY` | users, orgs, courses, … | Trusted server client — RLS bypassed; tenant isolation enforced at the API layer (org-scoped queries) |
| `supabaseAdmin` | `SUPABASE_SERVICE_ROLE_KEY` | global_users, tenant_memberships, system_audit_logs, … | Bypasses RLS — server-only |
| `pool` (pg) | `DATABASE_URL` | Drizzle-managed tables | Custom schema via drizzle-orm |

---

## Global Identity Engine

### What it does

Every user who logs in or registers gets a **global identity** — a single record in `global_users` that persists across tenants. On top of that, a `tenant_memberships` row is created (or confirmed) linking them to their current organisation.

This enables multi-tenant SaaS: one person can be a parent in `school-A` and an operator in `school-B`, with a single global profile and per-tenant data (medical notes, emergency contacts, etc.).

### `resolveGlobalUserId(email, name, orgId, role)`

Called automatically on every **login** and **register** by `routes/auth.ts`.

```
1. normalise email (lowercase + trim)
2. look up global_users by email
   ├── found  → use existing id
   └── not found → INSERT (first_name, last_name, email)
        ├── success → use new id
        └── conflict (race) → retry SELECT → use that id
3. UPSERT tenant_memberships
   (global_user_id, organization_id, role, status=active)
   onConflict=DO NOTHING (preserves existing status)
4. return globalUserId (or null on unrecoverable error — non-fatal)
```

The returned `globalUserId` is embedded in the JWT payload so all subsequent requests carry it without extra DB queries.

### Key tables

```sql
-- One row per human being across the entire platform
global_users (
  id            bigserial PRIMARY KEY,
  first_name    text NOT NULL,
  last_name     text NOT NULL,
  email         text UNIQUE NOT NULL,
  qr_code       text UNIQUE DEFAULT 'STR-' || gen_random_uuid(),
  created_at    timestamptz DEFAULT now()
)

-- One row per (person × organisation) pair
tenant_memberships (
  id              bigserial PRIMARY KEY,
  global_user_id  bigint REFERENCES global_users(id) ON DELETE CASCADE,
  organization_id int,
  role            text,      -- parent | operator | admin
  status          text,      -- invited | active | suspended | expired
  invited_at      timestamptz,
  activated_at    timestamptz,
  expires_at      timestamptz
)

-- Per-tenant sensitive data (RLS-protected)
tenant_specific_data (
  global_user_id        bigint,
  organization_id       int,
  date_of_birth         date,
  medical_notes         text,
  allergies             text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  custom_fields         jsonb,
  PRIMARY KEY (global_user_id, organization_id)
)
```

---

## Import Engine

### Endpoint

```
POST /api/identity/import
Authorization: Bearer <admin-or-operator JWT>
Content-Type: multipart/form-data
  file: <CSV or XLSX file>

Query params:
  ?dryRun=true   — validate only, write nothing
```

### Accepted file formats

| Format | MIME | Extension |
|---|---|---|
| CSV | `text/csv`, `text/plain` | `.csv` |
| Excel | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | `.xlsx` |
| Legacy Excel | `application/vnd.ms-excel` | `.xls` |

**Limits:** 5 MB / 2 000 rows per upload.

### Column schema

The parser accepts flexible header names and normalises them automatically.

| Canonical column | Accepted aliases | Required |
|---|---|---|
| `email` | `Email`, `Email Address`, `e-mail` | ✅ |
| `first_name` | `First Name`, `Given Name`, `firstName` | ✅ |
| `last_name` | `Last Name`, `Surname`, `Family Name`, `lastName` | ✅ |
| `role` | `Role`, `User Role`, `Member Role` | No (defaults to `parent`) |
| `date_of_birth` | `DOB`, `Date of Birth`, `Birthday` | No |
| `phone` | `Phone Number`, `Mobile`, `Contact` | No |

Valid roles: `parent`, `operator`, `admin`.  
`date_of_birth` must be `YYYY-MM-DD`.

### Validation rules (per row)

1. `email` — must be present and match `x@y.z` format
2. `first_name` — must be non-empty
3. `last_name` — must be non-empty
4. `role` — if provided, must be one of the valid roles
5. `date_of_birth` — if provided, must match `YYYY-MM-DD`

### Flow

```
Upload received
      │
      ▼
Parse (CSV / XLSX)
      │
      ▼
Validate all rows → collect per-row errors
      │
      ├── Errors present? ──► Return 422 with { validationErrors: [...] }
      │                        (nothing written, DRY_RUN audit log entry)
      │
      ├── ?dryRun=true? ───► Return 200 with { dryRun: true, summary }
      │                        (nothing written, DRY_RUN audit log entry)
      │
      ▼ (all rows valid, live run)
UPSERT global_users ON CONFLICT (email) DO UPDATE
      │
      ▼
Fetch IDs for any rows not returned by upsert
      │
      ▼
UPSERT tenant_memberships ON CONFLICT (global_user_id, organization_id) DO UPDATE
      │
      ▼
UPSERT tenant_specific_data  (only if dob or phone present)
      │
      ▼
logAction("IMPORT", { filename, imported, total })
      │
      ▼
Return 200 { dryRun: false, summary: { total, valid, imported, skipped }, members: [...] }
```

### Example — dry run

```bash
curl -X POST https://<domain>/api/identity/import?dryRun=true \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@members.csv"
```

```json
{
  "dryRun": true,
  "summary": { "total": 5, "valid": 3, "errors": 2, "filename": "members.csv" },
  "validationErrors": [
    { "row": 2, "email": "", "errors": ["Missing or invalid email"] },
    { "row": 4, "email": "bad", "errors": ["Missing or invalid email"] }
  ]
}
```

### Example — live import

```bash
curl -X POST https://<domain>/api/identity/import \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@members.csv"
```

```json
{
  "dryRun": false,
  "summary": { "total": 3, "valid": 3, "errors": 0, "imported": 3, "skipped": 0, "filename": "members.csv" },
  "members": [
    { "id": 42, "email": "alice@example.com" },
    { "id": 43, "email": "bob@example.com" },
    { "id": 44, "email": "carol@example.com" }
  ]
}
```

---

## Audit Logs

All sensitive operations are recorded in `system_audit_logs` in Supabase.

### Table schema

```sql
system_audit_logs (
  id             bigserial PRIMARY KEY,
  created_at     timestamptz DEFAULT now(),
  user_id        text,    -- local users.id (stringified)
  action         text,    -- see Action Reference below
  table_affected text,
  record_id      text,
  details        jsonb    -- arbitrary metadata
)
```

### Action reference

| Action | Trigger |
|---|---|
| `IMPORT` | Successful CSV/XLSX live import |
| `IMPORT_DRY_RUN` | Dry run or import with validation errors |
| `INTERNAL_ERROR` | Any caught 500-level error (details include stack excerpt) |

### Querying audit logs

**All imports in the last 7 days:**
```sql
SELECT created_at, user_id, details->>'filename' AS file,
       (details->>'imported')::int AS imported,
       (details->>'errors')::int   AS errors
FROM   system_audit_logs
WHERE  action = 'IMPORT'
AND    created_at > now() - interval '7 days'
ORDER  BY created_at DESC;
```

**Internal errors in the last 24 hours:**
```sql
SELECT created_at, user_id, details->>'context' AS context,
       details->>'message' AS message
FROM   system_audit_logs
WHERE  action = 'INTERNAL_ERROR'
AND    created_at > now() - interval '24 hours'
ORDER  BY created_at DESC;
```

**Activity for a specific user:**
```sql
SELECT created_at, action, table_affected, details
FROM   system_audit_logs
WHERE  user_id = '101'
ORDER  BY created_at DESC
LIMIT  50;
```

---

## Rate Limiting

Identity routes are protected by per-user rate limits (keyed on `userId:orgId`).

| Endpoint | Limit |
|---|---|
| All `GET/POST/PATCH/PUT /identity/*` | 100 req / min |
| `POST /identity/import` | 10 req / min |

On limit breach: HTTP `429` with body `{ "error": "Too many requests..." }`.

---

## Security model

- **No internal error details are returned to clients.** All 500 responses return `{ "error": "An internal error occurred. Please try again." }`. The real error (message + stack excerpt) is written to `system_audit_logs` with `action: INTERNAL_ERROR`.
- **Input validation via Zod** runs on all `POST`/`PATCH`/`PUT` bodies before route logic executes. Returns `400` with field-level errors on failure.
- **`supabaseAdmin`** (service role) is never used client-side — only in server code inside `lib/`.
- **JWT tokens** include `globalUserId` so cross-tenant identity lookups require zero extra round-trips.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | ✅ | Supabase project REST URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service-role key used by both server clients. Bypasses RLS — **server only**. Store ONLY as a managed secret, never commit in plaintext. Rotate in the Supabase dashboard if ever exposed. |
| `DATABASE_URL` | ✅ | PostgreSQL connection string (Drizzle tables) |
| `SESSION_SECRET` | ✅ | JWT signing secret (≥ 32 random chars) |
| `PORT` | Set by workflow | Defaults to 8080 |

All secrets are managed via **Replit Secrets** (the lock icon in the sidebar). Never commit values to source control.

To update a secret:
1. Open **Secrets** in the Replit sidebar
2. Find the key and update the value
3. Restart the API Server workflow (see below)

---

## Running and restarting the server

The API server runs as a managed **Workflow** in Replit.

**Restart from the UI:** Workflows panel → `API Server` → Restart button.

**Restart from the shell:**
```bash
# This is handled automatically by the workflow; to trigger manually during development:
pnpm --filter @workspace/api-server run dev
```

**Typecheck before deploying:**
```bash
pnpm --filter @workspace/api-server run typecheck
```

**Run the backend test suite:**
```bash
# Full identity engine test
pnpm --filter @workspace/scripts run test-identity

# Import engine test (requires server running)
pnpm --filter @workspace/scripts run test-import

# Reset test user passwords (if credentials change)
pnpm --filter @workspace/scripts run reset-test-passwords
```

---

## Database migrations

Supabase schema changes are in `supabase-migrations/` at the repo root. Run them manually in the **Supabase SQL editor** for your project.

| File | Description |
|---|---|
| `001_global_identity.sql` | `global_users`, `tenant_memberships`, `tenant_specific_data`, RLS |
| `002_pending_invites.sql` | `pending_invites` table |
| `003_system_audit_logs.sql` | `system_audit_logs` table + indexes |
