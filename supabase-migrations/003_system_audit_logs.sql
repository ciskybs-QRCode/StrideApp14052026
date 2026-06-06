-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003: system_audit_logs
-- Run this in the Supabase SQL editor for your project.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists system_audit_logs (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  user_id     text,                     -- JWT sub / local user id (string to be flexible)
  action      text not null,            -- e.g. 'LOGIN', 'IMPORT', 'ROLE_CHANGE', 'MEMBER_SUSPEND'
  table_affected text,                  -- e.g. 'global_users', 'tenant_memberships'
  record_id   text,                     -- stringified PK of the affected row
  details     jsonb                     -- arbitrary structured metadata
);

-- Only service-role (server-side) can insert; admins can read their own org's logs.
alter table system_audit_logs enable row level security;

-- Service role bypasses RLS — no extra policy needed for server writes.
-- Allow admins to SELECT rows (read-only, no tenant filter here — adjust if needed).
create policy "admins_read_audit_logs"
  on system_audit_logs
  for select
  using (true);   -- RLS check is enforced at the API layer; service-role writes bypass this.

-- Speed up common queries
create index if not exists system_audit_logs_user_id_idx     on system_audit_logs (user_id);
create index if not exists system_audit_logs_action_idx       on system_audit_logs (action);
create index if not exists system_audit_logs_created_at_idx   on system_audit_logs (created_at desc);
