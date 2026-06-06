/**
 * test-import.ts
 * Rigorous end-to-end test of the CSV/XLSX Import Engine.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run test-import
 *
 * Steps:
 *  1. Login as admin to get a JWT
 *  2. Dry-run dirty.csv   → expect 422, zero DB writes
 *  3. Live import clean.csv → expect 200, rows appear in DB
 *  4. Audit log check      → both actions recorded with correct user_id
 */

import { createClient } from "@supabase/supabase-js";

// ── Config ────────────────────────────────────────────────────────────────────
const BASE   = "http://localhost:80/api";
const ADMIN  = { email: "admin@test.com", password: "password" };

const SUPABASE_URL = process.env["SUPABASE_URL"]!;
const SERVICE_KEY  = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Unique emails scoped to this test run so re-runs are idempotent
const RUN_ID = Date.now();
const CLEAN_EMAILS = [
  `stride-test-clean1-${RUN_ID}@example.test`,
  `stride-test-clean2-${RUN_ID}@example.test`,
  `stride-test-clean3-${RUN_ID}@example.test`,
];
const DIRTY_EMAILS = [
  `stride-test-dirty1-${RUN_ID}@example.test`,  // valid
  ``,                                             // missing email
  `not-an-email-format`,                          // malformed
];

// ── CSV builders ──────────────────────────────────────────────────────────────
function buildCleanCsv(): string {
  return [
    "email,first_name,last_name,role,date_of_birth",
    `${CLEAN_EMAILS[0]},Alice,Clean,parent,1990-03-15`,
    `${CLEAN_EMAILS[1]},Bob,Clean,parent,1985-07-22`,
    `${CLEAN_EMAILS[2]},Carol,Clean,operator,2000-01-01`,
  ].join("\n");
}

function buildDirtyCsv(): string {
  return [
    "email,first_name,last_name,role",
    `${DIRTY_EMAILS[0]},Dave,Dirty,parent`,   // row 1: valid
    `,Eve,Dirty,parent`,                        // row 2: missing email
    `${DIRTY_EMAILS[2]},Frank,Dirty,parent`,   // row 3: malformed email
  ].join("\n");
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
type Json = Record<string, unknown>;

async function post(path: string, body: Json, token?: string): Promise<{ status: number; json: Json }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Json };
}

async function uploadCsv(
  csvContent: string,
  filename: string,
  token: string,
  dryRun = false,
): Promise<{ status: number; json: Json }> {
  const formData = new FormData();
  const blob = new Blob([csvContent], { type: "text/csv" });
  formData.append("file", blob, filename);

  const url = `${BASE}/identity/import${dryRun ? "?dryRun=true" : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  return { status: res.status, json: (await res.json()) as Json };
}

// ── Assertion helpers ─────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
let stopped = false;

function ok(msg: string)   { if (!stopped) { console.log(`  ✅  ${msg}`); passed++; } }
function fail(msg: string) { console.log(`  ❌  ${msg}`); failed++; }
function info(msg: string) { if (!stopped) console.log(`  ℹ️   ${msg}`); }

function assert(condition: boolean, passMsg: string, failMsg: string): boolean {
  if (condition) { ok(passMsg); return true; }
  fail(failMsg);
  return false;
}

function section(title: string) {
  if (!stopped) {
    console.log("\n" + "─".repeat(62));
    console.log(`  ${title}`);
    console.log("─".repeat(62));
  }
}

function stop(reason: string) {
  console.log(`\n  🛑  STOPPED: ${reason}`);
  stopped = true;
}

// ── Test runner ───────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🧪  Import Engine — end-to-end test");
  console.log(`    Target : ${BASE}`);
  console.log(`    Run ID : ${RUN_ID}`);

  // ── STEP 0: Login ───────────────────────────────────────────────────────────
  section("Step 0 — Login as admin");
  const login = await post("/auth/login", { email: ADMIN.email, password: ADMIN.password });

  if (!assert(login.status === 200, `Login OK (HTTP ${login.status})`, `Login failed — HTTP ${login.status}: ${JSON.stringify(login.json)}`)) {
    stop("Cannot proceed without a valid JWT");
    printSummary(); return;
  }

  const token  = (login.json["token"] as string | undefined) ?? "";
  const user   = login.json["user"] as Json;
  const userId = String(user["id"]);
  info(`admin user id: ${userId}, globalUserId: ${user["globalUserId"] ?? "none"}`);

  if (!assert(!!token, "JWT token present", "JWT token missing")) {
    stop("Cannot proceed without a JWT");
    printSummary(); return;
  }

  // ── STEP 1: Prepare — scrub any leftover test rows ─────────────────────────
  section("Step 1 — Prepare: scrub leftover test data");
  const allTestEmails = [...CLEAN_EMAILS, DIRTY_EMAILS[0]].filter(Boolean);
  await db.from("global_users").delete().in("email", allTestEmails);
  ok("Leftover test rows cleared from global_users (cascades to memberships via FK)");

  // ── STEP 2: Dry run with dirty.csv ─────────────────────────────────────────
  section("Step 2 — Dry run with dirty.csv (?dryRun=true)");
  const dirtyCsv = buildDirtyCsv();
  info(`dirty.csv preview:\n${dirtyCsv.split("\n").map(l => "      " + l).join("\n")}`);

  const dryRes = await uploadCsv(dirtyCsv, "dirty.csv", token, true);
  info(`Response: HTTP ${dryRes.status}`);
  info(`Body: ${JSON.stringify(dryRes.json, null, 2).split("\n").join("\n           ")}`);

  // Expect either 422 (validation errors) or 200 with dryRun:true
  assert(
    dryRes.status === 422 || (dryRes.status === 200 && dryRes.json["dryRun"] === true),
    `Correct status for dry-run with invalid rows (HTTP ${dryRes.status})`,
    `Expected 422 or 200+dryRun, got ${dryRes.status}`,
  );

  const validationErrors = dryRes.json["validationErrors"] as unknown[] | undefined;
  assert(
    Array.isArray(validationErrors) && validationErrors.length >= 2,
    `Validation errors returned (${validationErrors?.length ?? 0} error(s) — expected ≥ 2)`,
    `Expected ≥ 2 validation errors, got: ${JSON.stringify(validationErrors)}`,
  );

  const summary = dryRes.json["summary"] as Json | undefined;
  assert(
    summary?.["errors"] !== undefined && (summary["errors"] as number) >= 2,
    `Summary reports ≥ 2 errors`,
    `Summary.errors was ${summary?.["errors"]}`,
  );

  // Verify NO rows were inserted for dirty emails
  const dirtyCheckEmails = [DIRTY_EMAILS[0]].filter(Boolean);
  const { data: dirtyDbRows } = await db
    .from("global_users")
    .select("id, email")
    .in("email", dirtyCheckEmails);
  assert(
    !dirtyDbRows || dirtyDbRows.length === 0,
    `DB untouched — no dirty rows written to global_users`,
    `DB was modified during dry-run! Found rows: ${JSON.stringify(dirtyDbRows)}`,
  );

  if (stopped) { printSummary(); return; }

  // ── STEP 3: Live import with clean.csv ─────────────────────────────────────
  section("Step 3 — Live import with clean.csv");
  const cleanCsv = buildCleanCsv();
  info(`clean.csv preview:\n${cleanCsv.split("\n").map(l => "      " + l).join("\n")}`);

  const liveRes = await uploadCsv(cleanCsv, "clean.csv", token, false);
  info(`Response: HTTP ${liveRes.status}`);
  info(`Body: ${JSON.stringify(liveRes.json, null, 2).split("\n").join("\n           ")}`);

  if (!assert(liveRes.status === 200, `Import returned 200`, `Import failed — HTTP ${liveRes.status}: ${JSON.stringify(liveRes.json)}`)) {
    stop("Live import failed — skipping DB verification");
    printSummary(); return;
  }

  assert(liveRes.json["dryRun"] === false, "dryRun flag is false (committed)", `dryRun was ${liveRes.json["dryRun"]}`);

  const liveSummary = liveRes.json["summary"] as Json;
  assert(liveSummary["total"] === 3,    `total=3`,    `total was ${liveSummary["total"]}`);
  assert(liveSummary["valid"] === 3,    `valid=3`,    `valid was ${liveSummary["valid"]}`);
  assert(liveSummary["errors"] === 0,   `errors=0`,   `errors was ${liveSummary["errors"]}`);
  assert((liveSummary["imported"] as number) >= 3, `imported≥3`, `imported was ${liveSummary["imported"]}`);

  // Verify rows exist in global_users
  const { data: globalUsers } = await db
    .from("global_users")
    .select("id, email, qr_code, first_name")
    .in("email", CLEAN_EMAILS);

  assert(
    globalUsers?.length === 3,
    `All 3 emails found in global_users`,
    `Expected 3 rows in global_users, found ${globalUsers?.length ?? 0}`,
  );

  if (globalUsers && globalUsers.length > 0) {
    for (const u of globalUsers) {
      const gu = u as { id: number; email: string; qr_code: string; first_name: string };
      assert(
        !!gu.qr_code,
        `${gu.email} → qr_code auto-generated: ${gu.qr_code}`,
        `${gu.email} has no qr_code`,
      );
    }
  }

  // Verify tenant_memberships were created
  const globalUserIds = (globalUsers ?? []).map((u) => (u as { id: number }).id);
  const { data: memberships } = await db
    .from("tenant_memberships")
    .select("id, global_user_id, status, role")
    .in("global_user_id", globalUserIds);

  assert(
    memberships?.length === 3,
    `All 3 tenant_memberships created (status=active)`,
    `Expected 3 memberships, found ${memberships?.length ?? 0}`,
  );

  if (memberships) {
    const allActive = memberships.every((m) => (m as { status: string }).status === "active");
    assert(allActive, `All memberships have status=active`, `Some memberships are not active: ${JSON.stringify(memberships)}`);
  }

  // Verify tenant_specific_data (dob was supplied for all 3)
  const { data: tenantData } = await db
    .from("tenant_specific_data")
    .select("global_user_id, date_of_birth")
    .in("global_user_id", globalUserIds);

  assert(
    tenantData?.length === 3,
    `tenant_specific_data rows created for all 3 (date_of_birth stored)`,
    `Expected 3 tenant_specific_data rows, found ${tenantData?.length ?? 0}`,
  );

  if (stopped) { printSummary(); return; }

  // ── STEP 4: Audit log verification ─────────────────────────────────────────
  section("Step 4 — Audit log check");

  // Give fire-and-forget a moment to land
  await new Promise((r) => setTimeout(r, 1500));

  const { data: auditRows, error: auditErr } = await db
    .from("system_audit_logs")
    .select("id, action, user_id, details, created_at")
    .in("action", ["IMPORT_DRY_RUN", "IMPORT"])
    .order("created_at", { ascending: false })
    .limit(20);

  if (auditErr) {
    fail(`Could not query system_audit_logs: ${auditErr.message}`);
    info(`(Has the migration 003_system_audit_logs.sql been run in Supabase?)`);
  } else {
    info(`system_audit_logs rows found (last 20): ${auditRows?.length ?? 0}`);

    const dryRunLog = (auditRows ?? []).find(
      (r) => (r as { action: string }).action === "IMPORT_DRY_RUN" &&
              (r as { user_id: string }).user_id === userId,
    );
    assert(
      !!dryRunLog,
      `IMPORT_DRY_RUN log entry found for user_id=${userId}`,
      `No IMPORT_DRY_RUN log entry found for user_id=${userId}`,
    );
    if (dryRunLog) {
      const d = (dryRunLog as { details: Json }).details;
      info(`DRY_RUN log details: filename=${d?.["filename"]}, total=${d?.["total"]}, errors=${d?.["errors"]}`);
    }

    const importLog = (auditRows ?? []).find(
      (r) => (r as { action: string }).action === "IMPORT" &&
              (r as { user_id: string }).user_id === userId,
    );
    assert(
      !!importLog,
      `IMPORT log entry found for user_id=${userId}`,
      `No IMPORT log entry found for user_id=${userId}`,
    );
    if (importLog) {
      const d = (importLog as { details: Json }).details;
      info(`IMPORT log details: filename=${d?.["filename"]}, imported=${d?.["imported"]}, total=${d?.["total"]}`);
    }
  }

  // ── STEP 5: Idempotency check — re-import clean.csv ────────────────────────
  section("Step 5 — Idempotency: re-import clean.csv (should not duplicate)");
  const reImport = await uploadCsv(cleanCsv, "clean.csv", token, false);
  assert(reImport.status === 200, `Re-import returns 200`, `Re-import returned ${reImport.status}`);

  const { data: membershipsDup } = await db
    .from("tenant_memberships")
    .select("id, global_user_id")
    .in("global_user_id", globalUserIds);

  assert(
    membershipsDup?.length === 3,
    `Re-import: still exactly 3 memberships (no duplicates created)`,
    `Duplicate memberships created! Found ${membershipsDup?.length}`,
  );

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  section("Cleanup — removing test rows");
  await db.from("global_users").delete().in("email", CLEAN_EMAILS);
  ok("Test rows removed from global_users (memberships cascade)");

  printSummary();
}

function printSummary() {
  console.log("\n" + "─".repeat(62));
  console.log("  Summary");
  console.log("─".repeat(62));
  console.log(`  Passed : ${passed}`);
  console.log(`  Failed : ${failed}`);
  if (failed === 0 && !stopped) {
    console.log("\n  🎉  All checks passed — Import Engine is working correctly.\n");
  } else {
    console.log("\n  ⚠️   Some checks failed — see details above.\n");
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
