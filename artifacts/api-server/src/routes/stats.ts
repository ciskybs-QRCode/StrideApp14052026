import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// GET /stats/analytics — last-6-months revenue (invoices) + members (users)
router.get("/stats/analytics", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;

  const now = new Date();

  // Build 6-month buckets (oldest → newest)
  const months: { key: string; label: string; revenue: number; members: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("en-US", { month: "short" });
    months.push({ key, label, revenue: 0, members: 0 });
  }

  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();

  // ── Revenue from invoices (PostgreSQL) ────────────────────────────────────
  try {
    const invRes = await pool.query<{ month_key: string; total_cents: string }>(
      `SELECT TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month_key,
              SUM(total_cents)::bigint                          AS total_cents
       FROM invoices
       WHERE organization_id = $1
         AND status IN ('paid', 'approved')
         AND created_at >= $2
       GROUP BY month_key
       ORDER BY month_key`,
      [user.orgId, sixMonthsAgo]
    );
    for (const row of invRes.rows) {
      const bucket = months.find(m => m.key === row.month_key);
      if (bucket) bucket.revenue = Math.round(Number(row.total_cents) / 100);
    }
  } catch {
    // invoices table may be empty — continue gracefully
  }

  // ── New members per month (Supabase) ──────────────────────────────────────
  const { data: newUsers } = await supabase
    .from("users")
    .select("created_at")
    .eq("organization_id", user.orgId)
    .gte("created_at", sixMonthsAgo);

  for (const u of newUsers ?? []) {
    const key    = (u.created_at as string).slice(0, 7);
    const bucket = months.find(m => m.key === key);
    if (bucket) bucket.members++;
  }

  // ── Total active members ──────────────────────────────────────────────────
  const { count: totalMembers } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", user.orgId);

  res.json({ monthly: months, totalMembers: totalMembers ?? 0 });
});

export default router;
