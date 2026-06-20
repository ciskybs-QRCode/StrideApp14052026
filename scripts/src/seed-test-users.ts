/**
 * seed-test-users.ts
 * Creates the 4 canonical test users in Supabase (upsert by email).
 * Sets all passwords to "password" and resets super_admin too.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run seed-test-users
 */

import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

const url        = process.env["SUPABASE_URL"]!;
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
if (!url || !serviceKey) { console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const PASS = "password";

const USERS: { email: string; name: string; role: string; roles: string }[] = [
  { email: "genitore@test.com",  name: "Test Member",   role: "parent",   roles: '["parent"]' },
  { email: "operatore@test.com", name: "Test Operator", role: "operator", roles: '["operator"]' },
  { email: "admin@test.com",     name: "Test Admin",    role: "admin",    roles: '["admin"]' },
];

async function main() {
  console.log("\n🌱  Seeding test users (password = \"password\") …\n");
  const hash = await bcrypt.hash(PASS, 10);

  // ── 1. Check / get org id ────────────────────────────────────────────────────
  const { data: orgs } = await sb.from("organizations").select("id, name").limit(1);
  const orgId = (orgs as { id: number; name: string }[] | null)?.[0]?.id ?? 1;
  console.log(`  Using org_id=${orgId}\n`);

  // ── 2. Upsert test users ──────────────────────────────────────────────────────
  for (const u of USERS) {
    // Check if exists
    const { data: existing } = await sb.from("users").select("id, email").ilike("email", u.email).limit(1);
    const user = (existing as { id: number; email: string }[] | null)?.[0];

    if (user) {
      // Update password
      const { error } = await sb.from("users").update({ password_hash: hash }).eq("id", user.id);
      if (error) console.log(`  ❌  ${u.email} — update error: ${error.message}`);
      else       console.log(`  ✅  ${u.email} (id=${user.id}) — password reset to "password"`);
    } else {
      // Insert new user
      const { data: inserted, error } = await sb.from("users").insert({
        email:         u.email,
        name:          u.name,
        role:          u.role,
        roles:         u.roles,
        password_hash: hash,
        organization_id: orgId,
        blocked:       false,
      }).select("id").maybeSingle();

      if (error) console.log(`  ❌  ${u.email} — insert error: ${error.message}`);
      else       console.log(`  ✅  ${u.email} (id=${(inserted as { id: number } | null)?.id ?? "?"}) — created`);
    }
  }

  // ── 3. Reset super_admin password too ────────────────────────────────────────
  const { data: sa } = await sb.from("users").select("id").eq("role", "super_admin").limit(1);
  const saRow = (sa as { id: number }[] | null)?.[0];
  if (saRow) {
    const { error } = await sb.from("users").update({ password_hash: hash }).eq("id", saRow.id);
    if (error) console.log(`  ❌  super_admin reset failed: ${error.message}`);
    else       console.log(`  ✅  super_admin (id=${saRow.id}) — password reset to "password"`);
  }

  console.log("\n  Done. Login with any of these users using password: password\n");
}

main().catch(e => { console.error(e); process.exit(1); });
