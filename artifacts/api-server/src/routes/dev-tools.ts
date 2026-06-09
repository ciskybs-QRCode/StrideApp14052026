/**
 * Dev Tools routes — Testing & Integration Suite for sandbox org (id = 999).
 *
 * ALL endpoints return 403 in production (NODE_ENV === "production").
 * No auth middleware — the dev guard is the only gatekeeper.
 *
 * Table access split:
 *   • Supabase client  → organizations, users, members (children), courses, enrollments
 *   • pool (postgres)  → notifications, emergency_pulses, rescue_cascades,
 *                         child_proximity_states, security_escalation_events
 *
 * Endpoints:
 *   GET    /dev/status                       — health check + env info
 *   GET    /dev/sandbox/status               — record counts for org 999
 *   POST   /dev/sandbox/seed                 — populate org 999 with dummy data
 *   DELETE /dev/sandbox/reset                — wipe transactional data for org 999
 *   POST   /dev/trigger/emergency-pulse      — fire an emergency pulse
 *   POST   /dev/trigger/rescue-cascade       — trigger substitute cascade
 *   POST   /dev/trigger/ble-transit-timeout  — simulate child stuck IN_TRANSIT > 15 min
 *   POST   /dev/trigger/security-escalation  — fire a phase-1 security alert
 *   POST   /dev/trigger/push-notification    — log a broadcast push notification
 *   POST   /dev/trigger/payment-received     — log a payment receipt notification
 *   GET    /dev/notification-log             — last 50 events for org 999
 */

import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { pool, ensureTables } from "../lib/pg.js";
import { supabase } from "../lib/supabase.js";
import { RescueCascadeService } from "../lib/RescueCascadeService.js";

const router = Router();

const SANDBOX_ORG_ID = 999;
const SANDBOX_PW     = "sandbox123!";

// ── Dev guard ─────────────────────────────────────────────────────────────────

function devGuard(req: Request, res: Response): boolean {
  if (process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "Dev tools are disabled in production." });
    return false;
  }
  return true;
}

// ── Helper: write an event row to notifications table for org 999 ─────────────

async function logEvent(
  title:       string,
  body:        string,
  type:        string,
  recipientId: number = 1,
): Promise<void> {
  await pool.query(
    `INSERT INTO notifications (organization_id, recipient_id, type, title, body)
     VALUES ($1, $2, $3, $4, $5)`,
    [SANDBOX_ORG_ID, recipientId, type, title, body],
  );
}

// ── GET /dev/status ───────────────────────────────────────────────────────────

router.get("/dev/status", (req: Request, res: Response) => {
  if (!devGuard(req, res)) return;
  res.json({ ok: true, env: process.env.NODE_ENV ?? "development", sandboxOrgId: SANDBOX_ORG_ID });
});

// ── GET /dev/sandbox/status ────────────────────────────────────────────────────

router.get("/dev/sandbox/status", async (req: Request, res: Response) => {
  if (!devGuard(req, res)) return;
  try {
    const { data: org } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("id", SANDBOX_ORG_ID)
      .single();

    if (!org) {
      res.json({ seeded: false, userCount: 0, childCount: 0 });
      return;
    }

    const [{ count: userCount }, { count: childCount }] = await Promise.all([
      supabase.from("users").select("id", { count: "exact", head: true }).eq("organization_id", SANDBOX_ORG_ID),
      supabase.from("members").select("id", { count: "exact", head: true }).eq("organization_id", SANDBOX_ORG_ID),
    ]);

    const { rows: courseRows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM notifications WHERE organization_id = $1`,
      [SANDBOX_ORG_ID],
    ).catch(() => ({ rows: [{ count: "0" }] }));

    res.json({
      seeded:     true,
      orgName:    org.name,
      userCount:  userCount ?? 0,
      childCount: childCount ?? 0,
      eventCount: parseInt(courseRows[0]?.count ?? "0", 10),
    });
  } catch (err) {
    req.log.error(err, "dev/sandbox/status error");
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /dev/sandbox/seed ─────────────────────────────────────────────────────

router.post("/dev/sandbox/seed", async (req: Request, res: Response) => {
  if (!devGuard(req, res)) return;
  try {
    // Ensure all pool-managed tables (emergency_pulses, notifications, etc.) exist
    await ensureTables();

    const hash = await bcrypt.hash(SANDBOX_PW, 10);

    // ── 1. Upsert sandbox organisation ────────────────────────────────────────
    // subscription_status and system_configured were added via ALTER TABLE and
    // are not yet visible in PostgREST's schema cache for INSERT — use raw
    // fetch for the initial upsert and a PATCH for those extra columns.
    const supabaseUrl  = process.env.SUPABASE_URL!;
    const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const trialEnd     = new Date(Date.now() + 90 * 24 * 3600_000).toISOString();

    const orgRes = await fetch(`${supabaseUrl}/rest/v1/organizations`, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
        "apikey":        serviceKey,
        "Prefer":        "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        id:            SANDBOX_ORG_ID,
        name:          "Stride Sandbox Org",
        invite_code:   "SANDBOX-DEV99",
        trial_ends_at: trialEnd,
        plan:          "active",
        region:        "AU",
        date_format:   "DD/MM/YYYY",
      }),
    });
    if (!orgRes.ok) {
      const txt = await orgRes.text().catch(() => "");
      throw new Error(`org upsert HTTP ${orgRes.status}: ${txt}`);
    }
    await fetch(`${supabaseUrl}/rest/v1/organizations?id=eq.${SANDBOX_ORG_ID}`, {
      method:  "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
        "apikey":        serviceKey,
        "Prefer":        "return=minimal",
      },
      body: JSON.stringify({ system_configured: true }),
    }).catch(() => {});

    // ── 2. Parents ────────────────────────────────────────────────────────────
    const PARENTS = [
      { email: "sandbox_parent1@test.com", name: "Alice Sanderson" },
      { email: "sandbox_parent2@test.com", name: "Bob Testafer"    },
      { email: "sandbox_parent3@test.com", name: "Carol Dummy"     },
    ];

    const parentRows: { id: number; name: string }[] = [];
    for (const p of PARENTS) {
      const { data, error } = await supabase
        .from("users")
        .upsert(
          { organization_id: SANDBOX_ORG_ID, email: p.email, name: p.name, role: "parent", password_hash: hash },
          { onConflict: "email" },
        )
        .select("id")
        .single();
      if (data) parentRows.push({ id: (data as { id: number }).id, name: p.name });
      else if (error) req.log.warn({ msg: error.message }, "seed: parent upsert warning");
    }

    // ── 3. Operators ──────────────────────────────────────────────────────────
    const OPERATORS = [
      { email: "sandbox_op1@test.com", name: "Dan Instructor" },
      { email: "sandbox_op2@test.com", name: "Eva Coach"      },
      { email: "sandbox_op3@test.com", name: "Frank Trainer"  },
    ];

    const operatorRows: { id: number }[] = [];
    for (const o of OPERATORS) {
      const { data, error } = await supabase
        .from("users")
        .upsert(
          { organization_id: SANDBOX_ORG_ID, email: o.email, name: o.name, role: "operator", password_hash: hash },
          { onConflict: "email" },
        )
        .select("id")
        .single();
      if (data) operatorRows.push(data as { id: number });
      else if (error) req.log.warn({ msg: error.message }, "seed: operator upsert warning");
    }

    // ── 4. Children (members) + authorized_pickups ────────────────────────────
    // Members: original schema is (organization_id, user_id, full_name).
    // first_name, last_name, parent_id are ALTER-TABLE additions not yet in
    // PostgREST's schema cache — raw fetch keeps the INSERT safe.
    // We set user_id = parent's user id for the base schema link.
    // A PATCH for parent_id is attempted and will succeed once the cache
    // is reloaded. authorized_pickups (local postgres) provides an immediate
    // reliable parent-child link regardless of cache state.
    const CHILDREN = [
      { pIdx: 0, firstName: "Lily",  lastName: "Sanderson" },
      { pIdx: 0, firstName: "Max",   lastName: "Sanderson" },
      { pIdx: 1, firstName: "Noah",  lastName: "Testafer"  },
      { pIdx: 1, firstName: "Zoe",   lastName: "Testafer"  },
      { pIdx: 2, firstName: "Mia",   lastName: "Dummy"     },
      { pIdx: 2, firstName: "Leo",   lastName: "Dummy"     },
    ];

    let childCount = 0;
    for (const c of CHILDREN) {
      const parent = parentRows[c.pIdx];
      if (!parent) continue;

      const mbRes = await fetch(`${supabaseUrl}/rest/v1/members`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
          "apikey":        serviceKey,
          "Prefer":        "return=representation",
        },
        body: JSON.stringify({
          organization_id: SANDBOX_ORG_ID,
          user_id:         parent.id,
          full_name:       `${c.firstName} ${c.lastName}`,
        }),
      });

      if (!mbRes.ok) {
        const t = await mbRes.text().catch(() => "");
        req.log.warn({ msg: t }, "seed: member insert warning");
        continue;
      }

      childCount++;
      const mbJson = await mbRes.json().catch(() => []) as Array<{ id: number }>;
      const memberId = mbJson[0]?.id;

      if (memberId) {
        // Best-effort: set parent_id (succeeds once PostgREST cache is current)
        await fetch(`${supabaseUrl}/rest/v1/members?id=eq.${memberId}`, {
          method:  "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
            "apikey":        serviceKey,
            "Prefer":        "return=minimal",
          },
          body: JSON.stringify({ parent_id: parent.id }),
        }).catch(() => {});

        // Reliable cross-reference in local postgres — tagged 'sandbox-seed'
        // for easy cleanup in the reset endpoint
        await pool.query(
          `INSERT INTO authorized_pickups
             (child_id, guardian_name, guardian_email, is_active, created_by)
           VALUES ($1, $2, $3, true, 'sandbox-seed')`,
          [String(memberId), parent.name, PARENTS[c.pIdx]?.email ?? ""],
        ).catch(() => {});
      }
    }

    // ── 5. Broadcast notification to mark the seed event ─────────────────────
    const firstOpId = operatorRows[0]?.id ?? 1;
    await logEvent(
      "🌱 Sandbox Seeded",
      `Org 999 ready — ${parentRows.length} parents · ${operatorRows.length} operators · ${childCount} children`,
      "broadcast",
      firstOpId,
    );

    res.status(201).json({
      ok:        true,
      parents:   parentRows.length,
      operators: operatorRows.length,
      children:  childCount,
    });
  } catch (err) {
    req.log.error(err, "dev/sandbox/seed error");
    res.status(500).json({ error: String(err) });
  }
});

// ── DELETE /dev/sandbox/reset ─────────────────────────────────────────────────

router.delete("/dev/sandbox/reset", async (req: Request, res: Response) => {
  if (!devGuard(req, res)) return;
  try {
    const wipe = (sql: string) => pool.query(sql, [SANDBOX_ORG_ID]).catch(() => {});

    await wipe(`DELETE FROM attendance_records          WHERE organization_id = $1`);
    await wipe(`DELETE FROM checkout_sessions           WHERE organization_id = $1`);
    await wipe(`DELETE FROM transactions                WHERE organization_id = $1`);
    await wipe(`DELETE FROM payment_audit_log           WHERE organization_id = $1`);
    await wipe(`DELETE FROM emergency_pulse_acks        WHERE pulse_id IN (SELECT id FROM emergency_pulses WHERE org_id = $1)`);
    await wipe(`DELETE FROM emergency_pulses            WHERE org_id          = $1`);
    await wipe(`DELETE FROM cascade_contacts            WHERE cascade_id IN (SELECT id FROM rescue_cascades WHERE org_id = $1)`);
    await wipe(`DELETE FROM rescue_cascades             WHERE org_id          = $1`);
    await wipe(`DELETE FROM notifications               WHERE organization_id = $1`);
    // child_transit_states has no org_id column — scope by sandbox prefix set during seed
    await pool.query(`DELETE FROM child_transit_states WHERE child_id LIKE 'sandbox-ble-%'`).catch(() => {});
    await wipe(`DELETE FROM security_escalation_events WHERE organization_id = $1`);
    await wipe(`DELETE FROM operator_absences           WHERE org_id          = $1`);
    // authorized_pickups — tagged 'sandbox-seed' in the seed endpoint
    await pool.query(`DELETE FROM authorized_pickups WHERE created_by = 'sandbox-seed'`).catch(() => {});

    res.json({ ok: true, message: "Sandbox transactional data wiped. User/child seed records preserved." });
  } catch (err) {
    req.log.error(err, "dev/sandbox/reset error");
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /dev/trigger/emergency-pulse ─────────────────────────────────────────

router.post("/dev/trigger/emergency-pulse", async (req: Request, res: Response) => {
  if (!devGuard(req, res)) return;
  try {
    const { data: opData } = await supabase
      .from("users")
      .select("id")
      .eq("organization_id", SANDBOX_ORG_ID)
      .eq("role", "operator")
      .limit(1)
      .single();
    const triggeredBy = (opData as { id: number } | null)?.id ?? 1;

    const { rows } = await pool.query<{ id: string; triggered_at: string }>(
      `INSERT INTO emergency_pulses (org_id, triggered_by, location_label)
       VALUES ($1, $2, 'Dev Trigger — Main Campus')
       RETURNING id, triggered_at`,
      [SANDBOX_ORG_ID, triggeredBy],
    );

    await logEvent(
      "🚨 Emergency Pulse Fired",
      `Dev trigger · Pulse ID ${rows[0].id} · Location: Main Campus`,
      "emergency_pulse",
      triggeredBy,
    );

    res.status(201).json({ ok: true, pulse_id: rows[0].id, triggered_at: rows[0].triggered_at });
  } catch (err) {
    req.log.error(err, "dev/trigger/emergency-pulse error");
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /dev/trigger/rescue-cascade ──────────────────────────────────────────

router.post("/dev/trigger/rescue-cascade", async (req: Request, res: Response) => {
  if (!devGuard(req, res)) return;
  try {
    // Resolve a discipline for org 999 (or fallback to id=1)
    const { rows: discRows } = await pool.query<{ id: number }>(
      `SELECT id FROM disciplines WHERE organization_id = $1 LIMIT 1`,
      [SANDBOX_ORG_ID],
    );
    const disciplineId = discRows[0]?.id ?? 1;

    const { data: opData } = await supabase
      .from("users")
      .select("id")
      .eq("organization_id", SANDBOX_ORG_ID)
      .eq("role", "operator")
      .limit(1)
      .single();
    const absentOperatorId = String((opData as { id: number } | null)?.id ?? "sandbox_op1");

    const cascadeId = await RescueCascadeService.triggerCascade({
      orgId:              SANDBOX_ORG_ID,
      autoTriggered:      false,
      disciplineId,
      absentOperatorId,
      absentOperatorName: "Dev Absent Operator",
      courseName:         "Sandbox Ballet Class",
      classDatetime:      new Date(Date.now() + 3_600_000).toISOString(),
    });

    await logEvent(
      "🔁 Rescue Cascade Triggered",
      `Dev trigger · Cascade ID ${cascadeId} · Discipline ${disciplineId}`,
      "substitute_request",
    );

    res.status(201).json({ ok: true, cascade_id: cascadeId });
  } catch (err) {
    req.log.error(err, "dev/trigger/rescue-cascade error");
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /dev/trigger/ble-transit-timeout ─────────────────────────────────────

router.post("/dev/trigger/ble-transit-timeout", async (req: Request, res: Response) => {
  if (!devGuard(req, res)) return;
  try {
    const { data: childData } = await supabase
      .from("members")
      .select("id, full_name")
      .eq("organization_id", SANDBOX_ORG_ID)
      .limit(1)
      .single();

    // Use a string key prefixed with 'sandbox-ble-' so the reset DELETE can target it
    const childId   = (childData as { id: number; full_name: string } | null)?.id ?? 9999;
    const childName = (childData as { id: number; full_name: string } | null)?.full_name ?? "Sandbox Child";
    const childKey  = `sandbox-ble-${childId}`;

    // child_transit_states schema: child_id (text UNIQUE), status, transit_lock,
    // transit_started_at, updated_at — no organization_id/wearable_uuid columns
    await pool.query(
      `INSERT INTO child_transit_states (child_id, status, transit_lock, transit_started_at)
       VALUES ($1, 'IN_TRANSIT', true, NOW() - INTERVAL '20 minutes')
       ON CONFLICT (child_id) DO UPDATE
         SET status             = 'IN_TRANSIT',
             transit_lock       = true,
             transit_started_at = NOW() - INTERVAL '20 minutes',
             updated_at         = NOW()`,
      [childKey],
    );

    await logEvent(
      "📡 BLE Transit Timeout Simulated",
      `${childName} (ID ${childId}) set IN_TRANSIT 20 min ago — appears in /proximity/transit-warnings`,
      "ble_timeout",
    );

    res.status(201).json({ ok: true, child_id: childId, child_name: childName, status: "IN_TRANSIT", minutes_ago: 20 });
  } catch (err) {
    req.log.error(err, "dev/trigger/ble-transit-timeout error");
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /dev/trigger/security-escalation ─────────────────────────────────────

router.post("/dev/trigger/security-escalation", async (req: Request, res: Response) => {
  if (!devGuard(req, res)) return;
  try {
    const { data: childData } = await supabase
      .from("members")
      .select("id, full_name")
      .eq("organization_id", SANDBOX_ORG_ID)
      .limit(1)
      .single();

    const childId   = (childData as { id: number; full_name: string } | null)?.id        ?? 9999;
    const childName = (childData as { id: number; full_name: string } | null)?.full_name ?? "Sandbox Child";

    await pool.query(
      `INSERT INTO security_escalation_events
         (organization_id, child_id, child_name, phase, triggered_at, status)
       VALUES ($1, $2, $3, 1, NOW(), 'active')
       ON CONFLICT DO NOTHING`,
      [SANDBOX_ORG_ID, childId, childName],
    ).catch(() => { /* table may not exist yet; notification still logs */ });

    await logEvent(
      "⚠️ Security Escalation — Phase 1",
      `Dev trigger · ${childName} (ID ${childId}) · Alert phase: 1`,
      "security_escalation",
    );

    res.status(201).json({ ok: true, child_id: childId, child_name: childName, phase: 1 });
  } catch (err) {
    req.log.error(err, "dev/trigger/security-escalation error");
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /dev/trigger/push-notification ───────────────────────────────────────

router.post("/dev/trigger/push-notification", async (req: Request, res: Response) => {
  if (!devGuard(req, res)) return;
  try {
    const { data: users } = await supabase
      .from("users")
      .select("id, name")
      .eq("organization_id", SANDBOX_ORG_ID)
      .limit(5);

    const recipients = (users ?? []) as { id: number; name: string }[];
    let sent = 0;

    for (const user of recipients) {
      await pool.query(
        `INSERT INTO notifications (organization_id, recipient_id, type, title, body)
         VALUES ($1, $2, 'broadcast', '🔔 Test Push Notification', $3)`,
        [
          SANDBOX_ORG_ID,
          user.id,
          `Dev push to ${user.name} · ${new Date().toLocaleTimeString()}`,
        ],
      );
      sent++;
    }

    res.status(201).json({ ok: true, sent_to: sent, recipients: recipients.map(u => u.name) });
  } catch (err) {
    req.log.error(err, "dev/trigger/push-notification error");
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /dev/trigger/payment-received ────────────────────────────────────────

router.post("/dev/trigger/payment-received", async (req: Request, res: Response) => {
  if (!devGuard(req, res)) return;
  try {
    const { data: parentData } = await supabase
      .from("users")
      .select("id, name")
      .eq("organization_id", SANDBOX_ORG_ID)
      .eq("role", "parent")
      .limit(1)
      .single();

    const parent = (parentData as { id: number; name: string } | null) ?? { id: 1, name: "Sandbox Parent" };
    const amount = Math.floor(Math.random() * 120) + 30;

    await pool.query(
      `INSERT INTO notifications (organization_id, recipient_id, type, title, body)
       VALUES ($1, $2, 'reimbursement', '💳 Payment Received', $3)`,
      [SANDBOX_ORG_ID, parent.id, `Dev · ${parent.name} paid $${amount}.00 AUD for Sandbox Course`],
    );

    res.status(201).json({ ok: true, parent_id: parent.id, parent_name: parent.name, amount_aud: amount });
  } catch (err) {
    req.log.error(err, "dev/trigger/payment-received error");
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /dev/notification-log ─────────────────────────────────────────────────
// Returns the last 50 events for org 999, unified across tables.

router.get("/dev/notification-log", async (req: Request, res: Response) => {
  if (!devGuard(req, res)) return;
  try {
    // App notifications (Drizzle / pool)
    const { rows: notifRows } = await pool.query<{
      id: number; type: string; title: string; body: string; created_at: string;
    }>(
      `SELECT id, type, title, body, created_at
       FROM notifications
       WHERE organization_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [SANDBOX_ORG_ID],
    );

    // Emergency pulses (pool)
    const { rows: pulseRows } = await pool.query<{
      id: string; location_label: string; status: string; triggered_at: string;
    }>(
      `SELECT id, location_label, status, triggered_at
       FROM emergency_pulses
       WHERE org_id = $1
       ORDER BY triggered_at DESC
       LIMIT 10`,
      [SANDBOX_ORG_ID],
    ).catch(() => ({ rows: [] as { id: string; location_label: string; status: string; triggered_at: string }[] }));

    // Rescue cascades (pool)
    const { rows: cascadeRows } = await pool.query<{
      id: number; course_name: string; status: string; created_at: string;
    }>(
      `SELECT id, course_name, status, created_at
       FROM rescue_cascades
       WHERE org_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [SANDBOX_ORG_ID],
    ).catch(() => ({ rows: [] as { id: number; course_name: string; status: string; created_at: string }[] }));

    type LogEvent = { id: string; channel: string; type: string; title: string; body: string; created_at: string };

    const events: LogEvent[] = [
      ...notifRows.map(n => ({
        id:         `notif-${n.id}`,
        channel:    "notification",
        type:       n.type,
        title:      n.title,
        body:       n.body,
        created_at: n.created_at,
      })),
      ...pulseRows.map(p => ({
        id:         `pulse-${p.id}`,
        channel:    "emergency",
        type:       "emergency_pulse",
        title:      `🚨 Emergency Pulse — ${p.location_label}`,
        body:       `Status: ${p.status}`,
        created_at: p.triggered_at,
      })),
      ...cascadeRows.map(c => ({
        id:         `cascade-${c.id}`,
        channel:    "system",
        type:       "rescue_cascade",
        title:      `🔁 Rescue Cascade — ${c.course_name ?? "Unknown course"}`,
        body:       `Status: ${c.status}`,
        created_at: c.created_at,
      })),
    ]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 50);

    res.json({ total: events.length, events });
  } catch (err) {
    req.log.error(err, "dev/notification-log error");
    res.status(500).json({ error: String(err) });
  }
});

export default router;
