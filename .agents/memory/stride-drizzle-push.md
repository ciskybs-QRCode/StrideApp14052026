---
name: Stride Drizzle push dry-run warning
description: Drizzle-kit push behavior and suspicious rename diff observed during schema update
---

## The issue

When running `pnpm --filter @workspace/db run push` (without `--force`), drizzle-kit shows an interactive diff and waits for confirmation. In a non-TTY environment it exits without applying.

## Suspicious diff observed

During the zero-trust refactor (adding unique constraints to bookings + disciplines), the preview showed a large batch of **"rename table → conversations"** operations, e.g.:
- `~ system_config › conversations  rename table`
- `~ checkout_sessions › conversations  rename table`

This does NOT match our schema. No table is named "conversations".

**Why:** The Drizzle migration journal (`.drizzle/` or `meta/`) may be out of sync with the actual DB state, causing Drizzle to try to "fix" perceived discrepancies in a destructive way.

**How to apply:**
1. Review the full diff carefully before running `push-force`
2. Run `pnpm --filter @workspace/db run push` interactively in a terminal
3. If the renames still appear, check the Drizzle snapshot in `lib/db/.drizzle/meta/` for corruption
4. Never run `push-force` without reviewing the full diff first

**Current state:** The unique constraints (`bookings_availability_unique`, `disciplines_org_name_unique`) are in the TypeScript schema only. They need to be manually pushed to the live DB once the rename issue is investigated.
