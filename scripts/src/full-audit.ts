/**
 * full-audit.ts — comprehensive endpoint audit for all 4 roles
 * Usage: pnpm --filter @workspace/scripts run full-audit
 */

const BASE = "http://localhost:80/api";

let passed = 0;
let failed = 0;
const issues: string[] = [];

function ok(label: string)           { console.log(`  ✅  ${label}`); passed++; }
function fail(label: string, detail = "") { console.log(`  ❌  ${label}${detail ? " — " + detail : ""}`); failed++; issues.push(label + (detail ? ": " + detail : "")); }
function warn(label: string)         { console.log(`  ⚠️   ${label}`); }
function section(title: string)      { console.log(`\n${"─".repeat(64)}\n  ${title}\n${"─".repeat(64)}`); }

type Json = Record<string, unknown>;

async function post(path: string, body: Json, token?: string) {
  const headers: Record<string,string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const json = await r.json().catch(() => ({})) as Json;
  return { status: r.status, json };
}

async function get(path: string, token?: string) {
  const headers: Record<string,string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { headers });
  const json = await r.json().catch(() => ({})) as Json;
  return { status: r.status, json };
}

async function del(path: string, token: string) {
  const r = await fetch(`${BASE}${path}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  const json = await r.json().catch(() => ({})) as Json;
  return { status: r.status, json };
}

async function login(email: string, password: string): Promise<{ token: string; user: Json } | null> {
  const { status, json } = await post("/auth/login", { email, password });
  if (status !== 200 || !json["token"]) {
    fail(`Login ${email}`, `HTTP ${status}: ${JSON.stringify(json)}`);
    return null;
  }
  ok(`Login ${email} (role=${( json["user"] as Json)?.["role"]})`);
  return { token: json["token"] as string, user: json["user"] as Json };
}

function check(label: string, status: number, json: Json, expectedStatus = 200, mustHaveKey?: string) {
  if (status !== expectedStatus) {
    fail(label, `HTTP ${status} (expected ${expectedStatus}): ${JSON.stringify(json).slice(0, 120)}`);
    return;
  }
  if (mustHaveKey && !(mustHaveKey in json)) {
    fail(label, `Missing key "${mustHaveKey}" in response`);
    return;
  }
  ok(label);
}

// ─── PUBLIC ENDPOINTS ────────────────────────────────────────────────────────
async function testPublic() {
  section("PUBLIC ENDPOINTS (no auth)");

  const h = await get("/healthz");
  check("GET /healthz", h.status, h.json, 200, "status");

  const ss = await get("/auth/system-status");
  check("GET /auth/system-status", ss.status, ss.json, 200, "configured");

  const lp = await get("/live-pulse");
  check("GET /live-pulse", lp.status, lp.json, 200);
  if (lp.status === 200) {
    const hasEvents = "recentEvents" in lp.json || "events" in lp.json || "pulse" in lp.json;
    if (hasEvents) ok("  live-pulse returns events data");
    else warn("  live-pulse response shape unexpected: " + JSON.stringify(lp.json).slice(0, 100));
  }

  const fp = await post("/auth/forgot-password", { email: "genitore@test.com" });
  if (fp.status === 200 || fp.status === 201) ok("POST /auth/forgot-password (smoke)");
  else warn(`POST /auth/forgot-password → ${fp.status}: ${JSON.stringify(fp.json)}`);
}

// ─── MEMBER (parent) ─────────────────────────────────────────────────────────
async function testMember(tok: string) {
  section("MEMBER ROLE — genitore@test.com");

  const me = await get("/auth/me", tok);
  check("GET /auth/me", me.status, me.json, 200, "user");

  const courses = await get("/courses", tok);
  check("GET /courses", courses.status, courses.json, 200);

  const bookings = await get("/private-bookings", tok);
  check("GET /private-bookings", bookings.status, bookings.json, 200);

  const notifs = await get("/private-notifications", tok);
  check("GET /private-notifications", notifs.status, notifs.json, 200);

  const wallet = await get("/wallet/balance", tok);
  if (wallet.status === 200 || wallet.status === 404) ok("GET /wallet/balance (smoke)");
  else fail("GET /wallet/balance", `HTTP ${wallet.status}`);

  const docs = await get("/documents", tok);
  if (docs.status === 200 || docs.status === 404) ok("GET /documents (smoke)");
  else fail("GET /documents", `HTTP ${docs.status}`);

  const children = await get("/children", tok);
  check("GET /children", children.status, children.json, 200);

  const marketplace = await get("/marketplace/products", tok);
  if (marketplace.status === 200 || marketplace.status === 403) ok("GET /marketplace/products (smoke)");
  else fail("GET /marketplace/products", `HTTP ${marketplace.status}`);

  const events = await get("/events", tok);
  if (events.status === 200 || events.status === 404) ok("GET /events (smoke)");
  else fail("GET /events", `HTTP ${events.status}`);

  const myTickets = await get("/events/my-tickets", tok);
  if (myTickets.status === 200 || myTickets.status === 404) ok("GET /events/my-tickets (smoke)");
  else fail("GET /events/my-tickets", `HTTP ${myTickets.status}`);

  // Member should NOT access admin endpoints
  const adminBlock = await get("/admin/settings", tok);
  if (adminBlock.status === 403 || adminBlock.status === 401) ok("Admin endpoint correctly blocked for member");
  else fail("Admin endpoint NOT blocked for member", `HTTP ${adminBlock.status}`);

  // Member should NOT access operator endpoints
  const opBlock = await get("/operator/sessions", tok);
  if (opBlock.status === 403 || opBlock.status === 401 || opBlock.status === 404) ok("Operator endpoint correctly blocked for member");
  else fail("Operator endpoint NOT blocked for member", `HTTP ${opBlock.status}`);
}

// ─── OPERATOR ────────────────────────────────────────────────────────────────
async function testOperator(tok: string) {
  section("OPERATOR ROLE — operatore@test.com");

  const me = await get("/auth/me", tok);
  check("GET /auth/me", me.status, me.json, 200, "user");

  const sessions = await get("/sessions", tok);
  if (sessions.status === 200 || sessions.status === 404) ok("GET /sessions (smoke)");
  else fail("GET /sessions", `HTTP ${sessions.status}`);

  const schedule = await get("/scheduled-courses", tok);
  if (schedule.status === 200 || schedule.status === 404) ok("GET /scheduled-courses (smoke)");
  else fail("GET /scheduled-courses", `HTTP ${schedule.status}`);

  const members = await get("/members", tok);
  if (members.status === 200 || members.status === 404) ok("GET /members (smoke)");
  else fail("GET /members", `HTTP ${members.status}`);

  const presence = await get("/presence", tok);
  if (presence.status === 200 || presence.status === 404) ok("GET /presence (smoke)");
  else fail("GET /presence", `HTTP ${presence.status}`);

  const rescue = await get("/rescue/pending", tok);
  if (rescue.status === 200 || rescue.status === 404) ok("GET /rescue/pending (smoke)");
  else fail("GET /rescue/pending", `HTTP ${rescue.status}`);

  const transit = await get("/proximity/transit-warnings", tok);
  if (transit.status === 200 || transit.status === 404) ok("GET /proximity/transit-warnings (smoke)");
  else fail("GET /proximity/transit-warnings", `HTTP ${transit.status}`);

  const emergency = await get("/emergency/active", tok);
  if (emergency.status === 200 || emergency.status === 404) ok("GET /emergency/active (smoke)");
  else fail("GET /emergency/active", `HTTP ${emergency.status}`);

  const notifs = await get("/private-notifications", tok);
  check("GET /private-notifications", notifs.status, notifs.json, 200);

  // Operator should NOT access admin-only endpoints
  const adminBlock = await get("/admin/settings", tok);
  if (adminBlock.status === 403 || adminBlock.status === 401) ok("Admin endpoint correctly blocked for operator");
  else fail("Admin endpoint NOT blocked for operator", `HTTP ${adminBlock.status}`);
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────
async function testAdmin(tok: string) {
  section("ADMIN ROLE — admin@test.com");

  const me = await get("/auth/me", tok);
  check("GET /auth/me", me.status, me.json, 200);

  const settings = await get("/admin/settings", tok);
  if (settings.status === 200 || settings.status === 404) ok("GET /admin/settings (smoke)");
  else fail("GET /admin/settings", `HTTP ${settings.status}`);

  const users = await get("/users", tok);
  if (users.status === 200 || users.status === 404) ok("GET /users (smoke)");
  else fail("GET /users", `HTTP ${users.status}`);

  const courses = await get("/courses", tok);
  check("GET /courses", courses.status, courses.json, 200);

  const disciplines = await get("/disciplines", tok);
  check("GET /disciplines", disciplines.status, disciplines.json, 200);

  const availability = await get("/availability", tok);
  check("GET /availability", availability.status, availability.json, 200);

  const stats = await get("/stats/dashboard", tok);
  if (stats.status === 200 || stats.status === 404) ok("GET /stats/dashboard (smoke)");
  else fail("GET /stats/dashboard", `HTTP ${stats.status}`);

  const marketplace = await get("/marketplace/products", tok);
  if (marketplace.status === 200 || marketplace.status === 404) ok("GET /marketplace/products (smoke)");
  else fail("GET /marketplace/products", `HTTP ${marketplace.status}`);

  const beacons = await get("/proximity/beacons", tok);
  if (beacons.status === 200 || beacons.status === 404) ok("GET /proximity/beacons (smoke)");
  else fail("GET /proximity/beacons", `HTTP ${beacons.status}`);

  const pricing = await get("/pricing", tok);
  if (pricing.status === 200 || pricing.status === 404) ok("GET /pricing (smoke)");
  else fail("GET /pricing", `HTTP ${pricing.status}`);

  const invites = await get("/admin/invites", tok);
  if (invites.status === 200 || invites.status === 404) ok("GET /admin/invites (smoke)");
  else fail("GET /admin/invites", `HTTP ${invites.status}`);

  const communications = await get("/communications", tok);
  if (communications.status === 200 || communications.status === 404) ok("GET /communications (smoke)");
  else fail("GET /communications", `HTTP ${communications.status}`);
}

// ─── SUPER ADMIN ──────────────────────────────────────────────────────────────
async function testSuperAdmin(tok: string) {
  section("SUPER_ADMIN ROLE — ciskybs@gmail.com");

  const me = await get("/auth/me", tok);
  check("GET /auth/me", me.status, me.json, 200);

  const orgs = await get("/system/organizations", tok);
  if (orgs.status === 200 || orgs.status === 404) ok("GET /system/organizations (smoke)");
  else fail("GET /system/organizations", `HTTP ${orgs.status}`);

  const features = await get("/system/config/features", tok);
  if (features.status === 200 || features.status === 404) ok("GET /system/config/features (smoke)");
  else fail("GET /system/config/features", `HTTP ${features.status}`);

  const adminSettings = await get("/admin/settings", tok);
  if (adminSettings.status === 200 || adminSettings.status === 404) ok("GET /admin/settings (smoke)");
  else fail("GET /admin/settings", `HTTP ${adminSettings.status}`);

  const users = await get("/users", tok);
  if (users.status === 200 || users.status === 404) ok("GET /users (smoke)");
  else fail("GET /users", `HTTP ${users.status}`);
}

// ─── CROSS-ROLE / GUARD CHECKS ───────────────────────────────────────────────
async function testGuards(memberTok: string, operatorTok: string) {
  section("SECURITY GUARDS — role isolation checks");

  // Unauthenticated access to protected routes
  const noAuth = await get("/courses");
  if (noAuth.status === 401 || noAuth.status === 403) ok("Protected route blocks unauthenticated request");
  else fail("Protected route allows unauthenticated access", `HTTP ${noAuth.status} to /courses`);

  // Member cannot POST emergency broadcast
  const emBroadcast = await post("/emergency/broadcast", { message: "test", severity: "low" }, memberTok);
  if (emBroadcast.status === 403 || emBroadcast.status === 401) ok("Emergency broadcast blocked for member");
  else fail("Emergency broadcast NOT blocked for member", `HTTP ${emBroadcast.status}`);

  // Member cannot access /scan (QR)
  const scan = await post("/scan", { qrCode: "FAKE-QR" }, memberTok);
  if (scan.status === 403 || scan.status === 401) ok("QR /scan blocked for member");
  else warn(`QR /scan returned ${scan.status} for member (check if intentional): ${JSON.stringify(scan.json).slice(0,80)}`);

  // Member cannot access SOS
  const sos = await post("/sos", { location: "test" }, memberTok);
  if (sos.status === 403 || sos.status === 401) ok("SOS blocked for member");
  else warn(`SOS returned ${sos.status} for member: ${JSON.stringify(sos.json).slice(0,80)}`);

  // Operator CAN post SOS
  const sosByOp = await post("/sos", { location: "test hall", message: "test" }, operatorTok);
  if (sosByOp.status === 200 || sosByOp.status === 201 || sosByOp.status === 400) ok("SOS accepted for operator (or 400 due to missing fields)");
  else warn(`SOS for operator → ${sosByOp.status}: ${JSON.stringify(sosByOp.json).slice(0,80)}`);
}

// ─── DB CONNECTIVITY ─────────────────────────────────────────────────────────
async function testDBConnectivity(adminTok: string) {
  section("DB CONNECTIVITY — Supabase + Replit PG");

  // These endpoints touch Supabase:
  const supabaseTests = [
    ["/courses",        "Supabase: courses table"],
    ["/members",        "Supabase: members/users table"],
    ["/disciplines",    "Supabase: disciplines table"],
    ["/availability",   "Supabase: availability table"],
    ["/events",         "Supabase: events table"],
  ] as [string, string][];

  for (const [path, label] of supabaseTests) {
    const r = await get(path, adminTok);
    if (r.status === 200) ok(label);
    else if (r.status === 404) warn(`${label} → 404 (table may be empty)`);
    else fail(label, `HTTP ${r.status}: ${JSON.stringify(r.json).slice(0,100)}`);
  }

  // These endpoints touch Replit PG:
  const pgTests = [
    ["/rescue/pending",            "Replit PG: rescue_cascades"],
    ["/proximity/beacons",         "Replit PG: proximity_beacons"],
    ["/system/config/features",    "Replit PG: system_config"],
    ["/emergency/active",          "Replit PG: emergency_alerts"],
  ] as [string, string][];

  for (const [path, label] of pgTests) {
    const r = await get(path, adminTok);
    if (r.status === 200 || r.status === 404) ok(label);
    else fail(label, `HTTP ${r.status}: ${JSON.stringify(r.json).slice(0,100)}`);
  }
}

// ─── KNOWN ISSUES PROBE ──────────────────────────────────────────────────────
async function testKnownIssues(adminTok: string) {
  section("KNOWN ISSUES PROBE — scheduled_courses + disciplines FK");

  // From the logs: PGRST200 error on scheduled_courses + disciplines join
  const sc = await get("/scheduled-courses", adminTok);
  if (sc.status === 200) ok("GET /scheduled-courses — no FK error");
  else if (sc.status === 500 || (sc.json["error"] as string | undefined)?.includes("PGRST200")) {
    fail("GET /scheduled-courses — PGRST200 FK error (scheduled_courses↔disciplines)", JSON.stringify(sc.json).slice(0,150));
  } else {
    warn(`GET /scheduled-courses → ${sc.status}: ${JSON.stringify(sc.json).slice(0,100)}`);
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🔬  STRIDE FULL AUDIT — " + new Date().toISOString());
  console.log(`    Target: ${BASE}\n`);

  await testPublic();

  const member   = await login("genitore@test.com",  "password");
  const operator = await login("operatore@test.com", "password");
  const admin    = await login("admin@test.com",     "password");
  const super_   = await login("ciskybs@gmail.com",  "password");

  if (member)   await testMember(member.token);
  if (operator) await testOperator(operator.token);
  if (admin)    await testAdmin(admin.token);
  if (super_)   await testSuperAdmin(super_.token);

  if (member && operator) await testGuards(member.token, operator.token);
  if (admin)              await testDBConnectivity(admin.token);
  if (admin)              await testKnownIssues(admin.token);

  section(`SUMMARY — ${new Date().toISOString()}`);
  console.log(`\n  ✅  Passed:  ${passed}`);
  console.log(`  ❌  Failed:  ${failed}`);

  if (issues.length > 0) {
    console.log("\n  ANOMALIES FOUND:");
    issues.forEach((i, n) => console.log(`    ${n+1}. ${i}`));
  } else {
    console.log("\n  🎉  No anomalies detected.");
  }
  console.log();
}

main().catch(e => { console.error(e); process.exit(1); });

export {};
