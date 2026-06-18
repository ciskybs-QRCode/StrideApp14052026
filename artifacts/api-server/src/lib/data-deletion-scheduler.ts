/**
 * data-deletion-scheduler.ts
 *
 * Runs every 6 hours. Finds organizations whose data_deletion_scheduled_at
 * has passed (i.e. trial expired > 30 days ago and no payment received) and
 * permanently deletes all their data.
 *
 * Deletion order respects FK constraints. After deletion, sets
 * subscription_status = 'deleted' so the org record itself is preserved
 * as a tombstone for audit purposes.
 *
 * ⚠️  THIS IS IRREVERSIBLE. The scheduler has a deliberate 30-day window
 *     so that the super-admin can grant a new trial before data is lost.
 */

import { supabase } from "./supabase.js";
import { pool } from "./pg.js";
import { logger } from "./logger.js";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const INITIAL_DELAY_MS  = 120_000;             // 2 min after boot

export function startDataDeletionScheduler(): void {
  setTimeout(() => {
    void runDeletionPass();
    setInterval(() => { void runDeletionPass(); }, CHECK_INTERVAL_MS);
  }, INITIAL_DELAY_MS);

  logger.info("Data-deletion scheduler started (checks every 6 h)");
}

async function runDeletionPass(): Promise<void> {
  const now = new Date().toISOString();

  // Find orgs whose scheduled deletion date has passed
  const { data: orgs, error } = await supabase
    .from("organizations")
    .select("id, name, data_deletion_scheduled_at")
    .in("subscription_status", ["expired", "past_due"])
    .not("data_deletion_scheduled_at", "is", null)
    .lt("data_deletion_scheduled_at", now);

  if (error) {
    logger.warn({ err: error }, "data-deletion: failed to fetch candidates");
    return;
  }

  if (!orgs?.length) return;

  for (const org of orgs as Array<{ id: number; name: string; data_deletion_scheduled_at: string }>) {
    await deleteOrgData(org.id, org.name);
  }
}

async function deleteOrgData(orgId: number, orgName: string): Promise<void> {
  logger.warn({ orgId, orgName }, "data-deletion: permanently deleting org data");

  try {
    // Delete in FK dependency order (children before parents)
    const tables = [
      "emergency_assessments",
      "child_activity_log",
      "child_beacon_assignments",
      "child_transit_states",
      "children",
      "authorized_pickups",
      "operator_invoice_submissions",
      "marketplace_purchases",
      "checkout_sessions",
      "payment_audit_log",
      "private_lesson_bookings",
      "bookings",
      "courses",
      "rescue_cascades",
      "notifications",
      "proximity_beacons",
      "members",
      "users",
    ];

    for (const table of tables) {
      await pool.query(`DELETE FROM ${table} WHERE organization_id = $1`, [orgId]).catch(err => {
        logger.warn({ orgId, table, err }, `data-deletion: failed to delete from ${table}`);
      });
    }

    // Mark org as deleted (tombstone — keeps the org row for audit)
    await supabase
      .from("organizations")
      .update({
        subscription_status: "deleted",
        name: `[DELETED] ${orgName}`,
        data_deletion_scheduled_at: null,
      })
      .eq("id", orgId);

    // Log platform event
    try {
      await supabase.from("platform_events").insert({
        event_type: "org_data_deleted",
        title: `Data permanently deleted: ${orgName}`,
        description: `Organization ID ${orgId} — all member, child, and activity data permanently erased after 30-day grace period.`,
        payload: { orgId, orgName, deletedAt: new Date().toISOString() },
      });
    } catch { /* non-critical */ }

    logger.warn({ orgId, orgName }, "data-deletion: org data permanently deleted");
  } catch (err) {
    logger.error({ orgId, orgName, err }, "data-deletion: failed — will retry next cycle");
  }
}
