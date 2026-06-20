#!/bin/bash
set -e
pnpm install --frozen-lockfile

# Apply schema changes that drizzle-kit push would block on interactively.
# Using psql directly is safe and non-interactive.
psql "$DATABASE_URL" -c "ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS payout_frequency TEXT;" 2>/dev/null || true

# scheduled_courses payment configuration columns (monthly_billing feature)
psql "$DATABASE_URL" -c "ALTER TABLE scheduled_courses ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'single';" 2>/dev/null || true
psql "$DATABASE_URL" -c "ALTER TABLE scheduled_courses ADD COLUMN IF NOT EXISTS price_per_lesson_cents INTEGER;" 2>/dev/null || true
psql "$DATABASE_URL" -c "ALTER TABLE scheduled_courses ADD COLUMN IF NOT EXISTS package_size INTEGER;" 2>/dev/null || true
psql "$DATABASE_URL" -c "ALTER TABLE scheduled_courses ADD COLUMN IF NOT EXISTS package_price_cents INTEGER;" 2>/dev/null || true
psql "$DATABASE_URL" -c "ALTER TABLE scheduled_courses ADD COLUMN IF NOT EXISTS monthly_price_cents INTEGER;" 2>/dev/null || true
psql "$DATABASE_URL" -c "ALTER TABLE scheduled_courses ADD COLUMN IF NOT EXISTS billing_day_of_month INTEGER;" 2>/dev/null || true
psql "$DATABASE_URL" -c "ALTER TABLE scheduled_courses ADD COLUMN IF NOT EXISTS billing_end_date TEXT;" 2>/dev/null || true
