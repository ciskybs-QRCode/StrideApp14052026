import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

router.get("/promo-codes", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { data, error } = await supabase
    .from("promo_codes")
    .select("*")
    .eq("organization_id", user.orgId)
    .order("created_at", { ascending: false });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.post("/promo-codes", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const body = req.body as Record<string, unknown>;
  const { data, error } = await supabase
    .from("promo_codes")
    .insert({ ...body, organization_id: user.orgId, created_by_id: parseInt(user.id), uses: 0 })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

router.patch("/promo-codes/:id/toggle", requireAuth, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const { active } = req.body as { active: boolean };
  const update = active
    ? { valid_from: new Date().toISOString() }
    : { valid_until: new Date().toISOString() };
  const { data, error } = await supabase
    .from("promo_codes")
    .update(update)
    .eq("id", parseInt(String(id)))
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.delete("/promo-codes/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("promo_codes").delete().eq("id", parseInt(String(id)));
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
});

// ── GET /promo-codes/mine ─────────────────────────────────────────────────────
// Returns active promo assignments for the current user (auto-apply at checkout)
router.get("/promo-codes/mine", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const userId = Number(user.id);
  try {
    const { rows } = await pool.query(
      `SELECT id, promo_code, discount_type, discount_value, message, valid_until, created_at
       FROM user_promo_assignments
       WHERE user_id = $1
         AND is_used = false
         AND (valid_until IS NULL OR valid_until > NOW())
       ORDER BY created_at DESC`,
      [userId],
    );
    res.json({ promos: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── POST /promo-codes/mine/:id/mark-used ─────────────────────────────────────
router.post("/promo-codes/mine/:id/mark-used", requireAuth, async (req, res) => {
  const user   = (req as AuthReq).user;
  const userId = Number(user.id);
  const assignId = parseInt(String(req.params["id"]), 10);
  if (isNaN(assignId)) { res.status(400).json({ error: "invalid id" }); return; }
  try {
    const { rows } = await pool.query(
      `UPDATE user_promo_assignments SET is_used = true, used_at = NOW()
       WHERE id = $1 AND user_id = $2 AND is_used = false
       RETURNING *`,
      [assignId, userId],
    );
    if (!rows[0]) { res.status(404).json({ error: "Promo not found or already used" }); return; }
    res.json({ success: true, promo: rows[0] });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
