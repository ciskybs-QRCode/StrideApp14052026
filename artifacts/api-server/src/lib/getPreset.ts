import { pool } from "./pg.js";

export interface PresetRow {
  subject: string;
  body: string;
  channel_inapp: boolean;
  channel_push: boolean;
  channel_email: boolean;
}

/**
 * Fetches the org-level preset for a given template key from preset_messages.
 * Returns null if the row does not exist or on DB error — caller must supply its own fallback.
 */
export async function getPreset(orgId: number, key: string): Promise<PresetRow | null> {
  try {
    const { rows } = await pool.query<PresetRow>(
      `SELECT subject, body, channel_inapp, channel_push, channel_email
         FROM preset_messages WHERE org_id = $1 AND key = $2 LIMIT 1`,
      [orgId, key],
    );
    return rows[0] ?? null;
  } catch {
    return null;
  }
}
