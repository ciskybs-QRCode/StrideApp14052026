/**
 * owner-config.ts
 *
 * Manages the platform owner email dynamically via the system_config table.
 * Falls back to the bootstrap value when the DB is unavailable.
 *
 * Usage:
 *   - getOwnerEmail()   — sync, reads from in-memory cache
 *   - setOwnerEmail()   — async, writes to DB and updates cache immediately
 *   - initOwnerEmail()  — async, call once at startup (or lazily before first use)
 */

import { pool } from "./pg.js";

const BOOTSTRAP_OWNER_EMAIL = process.env["STRIDE_OWNER_EMAIL"] ?? "";

let _ownerEmail: string = BOOTSTRAP_OWNER_EMAIL;
let _initialized = false;

export async function initOwnerEmail(): Promise<void> {
  if (_initialized) return;
  try {
    const result = await pool.query<{ value: string }>(
      `SELECT value FROM system_config WHERE key = 'owner_email' LIMIT 1`,
    );
    if (result.rows.length > 0) {
      _ownerEmail = result.rows[0].value.toLowerCase();
    } else {
      await pool.query(
        `INSERT INTO system_config (key, value)
         VALUES ('owner_email', $1)
         ON CONFLICT (key) DO NOTHING`,
        [BOOTSTRAP_OWNER_EMAIL],
      );
      _ownerEmail = BOOTSTRAP_OWNER_EMAIL;
    }
    _initialized = true;
  } catch {
    _ownerEmail = BOOTSTRAP_OWNER_EMAIL;
  }
}

export function getOwnerEmail(): string {
  return _ownerEmail;
}

export async function setOwnerEmail(newEmail: string): Promise<void> {
  const normalized = newEmail.trim().toLowerCase();
  await pool.query(
    `INSERT INTO system_config (key, value, updated_at)
     VALUES ('owner_email', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [normalized],
  );
  _ownerEmail = normalized;
  _initialized = true;
}
