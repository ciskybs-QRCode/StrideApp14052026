import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// GET /private-notifications — user's own notifications
router.get("/private-notifications", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const { data, error } = await supabase
    .from("private_notifications")
    .select("*")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

// POST /private-notifications/:id/read
router.post("/private-notifications/:id/read", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const { error } = await supabase
    .from("private_notifications")
    .update({ read: true })
    .eq("id", parseInt(req.params.id))
    .eq("recipient_id", user.id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true });
});

// POST /private-notifications/read-all
router.post("/private-notifications/read-all", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const { error } = await supabase
    .from("private_notifications")
    .update({ read: true })
    .eq("recipient_id", user.id)
    .eq("read", false);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true });
});

export default router;
