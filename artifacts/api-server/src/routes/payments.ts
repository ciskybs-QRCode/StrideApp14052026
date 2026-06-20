import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

router.get("/payments", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;

  let query = supabase
    .from("checkout_sessions")
    .select("id, session_id, amount_cents, status, created_at, items, invoice_number")
    .eq("organization_id", user.orgId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (user.role === "parent") {
    query = query.eq("user_id", String(user.id));
  }

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }

  const mapped = (data ?? []).map((s) => {
    const items = s.items as { description?: string }[] | null;
    const firstDesc = Array.isArray(items) && items.length > 0
      ? (items[0].description ?? null)
      : null;
    return {
      id:          s.id,
      amount:      (s.amount_cents ?? 0) / 100,
      created_at:  s.created_at,
      description: firstDesc ?? s.invoice_number ?? "Payment",
      status:      s.status ?? "pending",
    };
  });

  res.json(mapped);
});

export default router;
