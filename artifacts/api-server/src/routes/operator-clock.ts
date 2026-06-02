import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// POST /operator-clock/in
// Record clock-in for an operator. Idempotent: if already clocked in today, returns existing record.
router.post("/operator-clock/in", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { session_id, notes } = req.body as { session_id?: number; notes?: string };
  const operatorId = parseInt(user.id);

  // Check for an open record today (no clock_out yet)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: open } = await supabase
    .from("operator_clock_records")
    .select("*")
    .eq("operator_id", operatorId)
    .gte("clock_in", todayStart.toISOString())
    .is("clock_out", null)
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (open) {
    res.json({ ...open, already_clocked_in: true });
    return;
  }

  const { data, error } = await supabase
    .from("operator_clock_records")
    .insert({
      operator_id: operatorId,
      session_id:  session_id ?? null,
      notes:       notes ?? null,
    })
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  req.log.info({ operatorId, session_id }, "operator clock-in");
  res.status(201).json(data);
});

// POST /operator-clock/out
// Record clock-out by closing the latest open record for this operator.
router.post("/operator-clock/out", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { notes } = req.body as { notes?: string };
  const operatorId = parseInt(user.id);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: open } = await supabase
    .from("operator_clock_records")
    .select("*")
    .eq("operator_id", operatorId)
    .gte("clock_in", todayStart.toISOString())
    .is("clock_out", null)
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!open) {
    res.status(404).json({ error: "No open clock-in found for today." });
    return;
  }

  const { data, error } = await supabase
    .from("operator_clock_records")
    .update({ clock_out: new Date().toISOString(), notes: notes ?? (open as Record<string,unknown>).notes })
    .eq("id", (open as Record<string,unknown>).id)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  req.log.info({ operatorId, recordId: (open as Record<string,unknown>).id }, "operator clock-out");
  res.json(data);
});

// GET /operator-clock
// Returns clock records for payroll cross-reference.
// Admin: all operators. Operator: own records only.
router.get("/operator-clock", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { date, operatorId: qOperatorId } = req.query as { date?: string; operatorId?: string };

  let query = supabase
    .from("operator_clock_records")
    .select("*")
    .order("clock_in", { ascending: false });

  if (user.role === "operator") {
    query = query.eq("operator_id", parseInt(user.id));
  } else if (qOperatorId) {
    query = query.eq("operator_id", parseInt(qOperatorId));
  }

  if (date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    query = query.gte("clock_in", start.toISOString()).lte("clock_in", end.toISOString());
  }

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

// GET /operator-clock/status
// Quick check: is this operator currently clocked in?
router.get("/operator-clock/status", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from("operator_clock_records")
    .select("id, clock_in, clock_out, session_id")
    .eq("operator_id", parseInt(user.id))
    .gte("clock_in", todayStart.toISOString())
    .is("clock_out", null)
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle();

  res.json({ clocked_in: !!data, record: data ?? null });
});

export default router;
