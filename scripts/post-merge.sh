#!/bin/bash
set -e
pnpm install --frozen-lockfile

# Apply schema changes that drizzle-kit push would block on interactively.
# Using psql directly is safe and non-interactive.
psql "$DATABASE_URL" -c "ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS payout_frequency TEXT;" 2>/dev/null || true
