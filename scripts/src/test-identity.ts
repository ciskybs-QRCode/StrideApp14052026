/**
 * test-identity.ts
 * Verifies the Global Identity Engine backend integrity.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run test-identity
 *
 * It will:
 *  1. Log in as each of the 3 test users
 *  2. Call GET /api/identity/me  (all users)
 *  3. Call GET /api/identity/memberships  (operator + admin only)
 *  4. Print a clear pass/fail summary
 */

const BASE = "http://localhost:80/api";

const TEST_USERS = [
  { email: "genitore@test.com",  password: "password", label: "Parent   (genitore)" },
  { email: "operatore@test.com", password: "password", label: "Operator (operatore)" },
  { email: "admin@test.com",     password: "password", label: "Admin    (admin)" },
];

type Json = Record<string, unknown>;

async function post(path: string, body: Json): Promise<{ status: number; json: Json }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Json };
}

async function get(path: string, token: string): Promise<{ status: number; json: Json }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, json: (await res.json()) as Json };
}

function section(title: string) {
  console.log("\n" + "─".repeat(60));
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

function ok(msg: string)   { console.log(`  ✅  ${msg}`); }
function fail(msg: string) { console.log(`  ❌  ${msg}`); }
function info(msg: string) { console.log(`  ℹ️   ${msg}`); }

let totalPassed = 0;
let totalFailed = 0;

async function testUser(user: (typeof TEST_USERS)[number]) {
  section(user.label);

  // ── 1. Login ────────────────────────────────────────────────────────────────
  const login = await post("/auth/login", { email: user.email, password: user.password });

  if (login.status !== 200) {
    fail(`Login failed — HTTP ${login.status}: ${JSON.stringify(login.json)}`);
    totalFailed++;
    return;
  }

  const token  = login.json["token"] as string | undefined;
  const u      = login.json["user"] as Json | undefined;

  if (!token) {
    fail("Login returned no token");
    totalFailed++;
    return;
  }

  ok(`Login OK — role: ${u?.["role"]}, orgId: ${u?.["orgId"]}`);

  const gid = u?.["globalUserId"];
  if (gid !== undefined && gid !== null) {
    ok(`globalUserId in JWT payload: ${gid}`);
    totalPassed++;
  } else {
    fail("globalUserId is MISSING from the login response — resolveGlobalUserId may have failed");
    totalFailed++;
  }
  totalPassed++; // login itself

  // ── 2. GET /identity/me ──────────────────────────────────────────────────
  const me = await get("/identity/me", token);
  info(`GET /identity/me → HTTP ${me.status}`);

  if (me.status === 200) {
    const globalUser  = me.json["globalUser"]  as Json | null;
    const memberships = me.json["memberships"] as unknown[] | null;
    const tenantData  = me.json["tenantData"];

    ok(`globalUser: id=${globalUser?.["id"]}, email=${globalUser?.["email"]}, qr_code=${globalUser?.["qr_code"] ?? "(none yet)"}`);
    ok(`memberships count: ${Array.isArray(memberships) ? memberships.length : "?"}`);
    info(`tenantData: ${tenantData === null ? "null (not yet set)" : JSON.stringify(tenantData)}`);
    totalPassed++;
  } else {
    fail(`/identity/me failed — ${JSON.stringify(me.json)}`);
    totalFailed++;
  }

  // ── 3. GET /identity/memberships (operators + admins only) ──────────────
  const role = (u?.["role"] as string) ?? "";
  if (role === "operator" || role === "admin") {
    const memberships = await get("/identity/memberships", token);
    info(`GET /identity/memberships → HTTP ${memberships.status}`);

    if (memberships.status === 200) {
      const list = memberships.json["memberships"] as unknown[] | undefined;
      ok(`Returned ${Array.isArray(list) ? list.length : "?"} tenant membership(s)`);
      if (Array.isArray(list) && list.length > 0) {
        const first = list[0] as Json;
        info(`First entry: status=${first["status"]}, role=${first["role"]}`);
      }
      totalPassed++;
    } else {
      fail(`/identity/memberships failed — ${JSON.stringify(memberships.json)}`);
      totalFailed++;
    }
  } else {
    // Parent should get 403 from this endpoint — that is CORRECT behaviour
    const memberships = await get("/identity/memberships", token);
    if (memberships.status === 403) {
      ok(`/identity/memberships correctly returned 403 for a parent role`);
      totalPassed++;
    } else {
      fail(`/identity/memberships returned ${memberships.status} for parent — expected 403`);
      totalFailed++;
    }
  }
}

async function main() {
  console.log("\n🧪  Global Identity Engine — backend integrity test");
  console.log(`    Target: ${BASE}`);

  for (const user of TEST_USERS) {
    await testUser(user);
  }

  section("Summary");
  console.log(`  Passed: ${totalPassed}`);
  console.log(`  Failed: ${totalFailed}`);
  if (totalFailed === 0) {
    console.log("\n  🎉  All checks passed — Global Identity Engine is wired correctly.\n");
  } else {
    console.log("\n  ⚠️   Some checks failed — see details above.\n");
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});

export {};
