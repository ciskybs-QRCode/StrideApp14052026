/**
 * reset-test-passwords.ts
 * One-time script: sets all 3 test users' passwords to "password"
 * so test-identity.ts can authenticate against them reliably.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run reset-test-passwords
 */

import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

const url        = process.env["SUPABASE_URL"];
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

if (!url || !serviceKey) {
  console.error("❌  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TEST_EMAILS = [
  "genitore@test.com",
  "operatore@test.com",
  "admin@test.com",
];

const RESET_PASSWORD = "password";

async function main() {
  console.log("\n🔧  Resetting test user passwords to \"password\" …\n");

  const hash = await bcrypt.hash(RESET_PASSWORD, 10);

  for (const email of TEST_EMAILS) {
    const { data, error } = await admin
      .from("users")
      .update({ password_hash: hash })
      .ilike("email", email)
      .select("id, email, role");

    if (error) {
      console.log(`  ❌  ${email} — ${error.message}`);
    } else if (!data || data.length === 0) {
      console.log(`  ⚠️   ${email} — not found in users table`);
    } else {
      const u = data[0] as { id: number; email: string; role: string };
      console.log(`  ✅  ${u.email}  (id=${u.id}, role=${u.role})`);
    }
  }

  console.log("\n  Done. You can now run: pnpm --filter @workspace/scripts run test-identity\n");
}

main().catch((err: unknown) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
