import { supabaseAdmin } from "./supabase.js";

export interface AuditEntry {
  userId?: string | number | null;
  action: string;
  tableAffected?: string;
  recordId?: string | number | null;
  details?: Record<string, unknown>;
}

/**
 * Fire-and-forget audit logger.
 * Writes to `system_audit_logs` via the service-role client (bypasses RLS).
 * Never throws — failures are swallowed so they don't disrupt the request.
 */
export function logAction(entry: AuditEntry): void {
  const row = {
    user_id:        entry.userId !== undefined ? String(entry.userId) : null,
    action:         entry.action,
    table_affected: entry.tableAffected ?? null,
    record_id:      entry.recordId !== undefined ? String(entry.recordId) : null,
    details:        entry.details ?? null,
  };

  void Promise.resolve(
    supabaseAdmin.from("system_audit_logs").insert(row),
  ).then(({ error }) => {
    if (error) {
      console.error("[audit] insert failed:", error.message);
    }
  }).catch((err: unknown) => {
    console.error("[audit] unexpected error:", err);
  });
}

/**
 * Awaitable version — use when you need the log to land before responding.
 */
export async function logActionAsync(entry: AuditEntry): Promise<void> {
  const row = {
    user_id:        entry.userId !== undefined ? String(entry.userId) : null,
    action:         entry.action,
    table_affected: entry.tableAffected ?? null,
    record_id:      entry.recordId !== undefined ? String(entry.recordId) : null,
    details:        entry.details ?? null,
  };

  const { error } = await supabaseAdmin.from("system_audit_logs").insert(row);
  if (error) {
    console.error("[audit] insert failed:", error.message);
  }
}
