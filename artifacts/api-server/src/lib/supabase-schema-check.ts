import { supabase } from "./supabase.js";
import { logger } from "./logger.js";

/**
 * Critical Supabase column manifest.
 *
 * Every column listed here must exist in Supabase before the server is
 * allowed to accept requests. Add a new column here BEFORE deploying code
 * that references it. If a column is missing the server crashes at boot
 * with a clear error — not a silent "Invalid credentials" in production.
 *
 * HOW TO ADD A NEW COLUMN:
 *   1. Add it to the Supabase table via the dashboard (ALTER TABLE).
 *   2. Add it to this manifest.
 *   3. Add the usage in code.
 *   4. Deploy.
 *
 * Columns that live only in the pg pool (pool.query / ensureTables) must
 * NOT appear here — this manifest only covers Supabase tables.
 */
const REQUIRED_COLUMNS: Record<string, string[]> = {
  users: [
    // Core auth — must all exist or login breaks for every user
    "id", "name", "email", "password_hash",
    "role", "roles", "organization_id", "blocked",
    "profile_photo_url",
    // Used in registration / activation flow
    "activation_status",
    // Used in invite / multi-org flow
    "created_at",
  ],
  organizations: [
    // Core org fields used in login + trial check
    "id", "name", "trial_ends_at", "subscription_status",
    // Billing
    "stripe_customer_id", "stripe_subscription_id",
    "stripe_secret_key",
    // Branding used in receipts + white-label
    "branding_primary_color", "branding_secondary_color", "branding_logo_url",
    // School info
    "logo_url", "contact_phone", "official_email",
    "legal_address", "region", "currency",
  ],
  operator_profiles: [
    "id", "user_id", "profile_type",
    "contractor_rate_cents", "contractor_billing_unit",
  ],
};

/**
 * Verifies that all required Supabase columns actually exist.
 * Crashes the process if any are missing so the problem is caught at boot,
 * not silently in a live request.
 */
export async function verifySupabaseSchema(): Promise<void> {
  const errors: string[] = [];

  await Promise.all(
    Object.entries(REQUIRED_COLUMNS).map(async ([table, cols]) => {
      const { error } = await supabase
        .from(table)
        .select(cols.join(", "))
        .limit(0);

      if (error) {
        const msg = `[schema-check] ${table}: ${error.message} (code ${error.code})`;
        errors.push(msg);
        logger.error({ table, error }, msg);
      } else {
        logger.info({ table, cols: cols.length }, `[schema-check] ✓ ${table}`);
      }
    }),
  );

  if (errors.length > 0) {
    logger.fatal(
      { errors },
      `[schema-check] FATAL: ${errors.length} Supabase column(s) missing — ` +
      "add them in the Supabase dashboard before deploying.\n" +
      errors.join("\n"),
    );
    process.exit(1);
  }
}
