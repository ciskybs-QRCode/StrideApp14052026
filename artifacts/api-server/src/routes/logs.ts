import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

router.post("/pdf-logs", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const body = req.body as Record<string, unknown>;
  const { error } = await supabase.from("pdf_generation_logs").insert({
    operator_id: parseInt(user.id),
    operator_email: user.email,
    period: body.period,
    month: body.month,
    total_amount: body.total_amount,
    action: body.action,
    created_at: new Date().toISOString(),
  });
  if (error) req.log.warn({ err: error.message }, "pdf-logs insert failed (table may not exist yet)");
  res.json({ ok: true });
});

router.post("/emergency-logs", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const body = req.body as Record<string, unknown>;
  const { error } = await supabase.from("emergency_protocol_logs").insert({
    operator_id: parseInt(user.id),
    operator_email: user.email,
    protocol_id: body.protocol_id,
    protocol_title: body.protocol_title,
    step_index: body.step_index,
    step_text: body.step_text,
    created_at: new Date().toISOString(),
  });
  if (error) req.log.warn({ err: error.message }, "emergency-logs insert failed (table may not exist yet)");
  res.json({ ok: true });
});

export default router;
