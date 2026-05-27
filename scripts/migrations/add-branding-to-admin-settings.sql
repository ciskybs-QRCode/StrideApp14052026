-- Migration: add white-label branding columns to admin_settings
-- Run once against the PostgreSQL / Supabase database.

ALTER TABLE admin_settings
  ADD COLUMN IF NOT EXISTS app_logo_url     TEXT,
  ADD COLUMN IF NOT EXISTS primary_color    TEXT,
  ADD COLUMN IF NOT EXISTS secondary_color  TEXT;
