import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// GET /terminology — public, no auth — returns role terminology for the primary org
router.get("/terminology", async (_req, res) => {
  const { data } = await supabase
    .from("organizations")
    .select("member_label")
    .eq("id", 1)
    .maybeSingle();
  const raw = (data as { member_label?: string } | null)?.member_label ?? "";
  let primaryRoleName = "Parent";
  let secondaryRoleName = "Child";
  if (raw.includes(":")) {
    // compact format: "Primary:Secondary" (stored to fit varchar(32))
    const [p, s] = raw.split(":");
    if (p) primaryRoleName = p;
    if (s) secondaryRoleName = s;
  } else if (raw && raw !== "{}") {
    // legacy: plain string was the secondary label only
    secondaryRoleName = raw;
  }
  res.json({ primaryRoleName, secondaryRoleName });
});

router.get("/org", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", user.orgId)
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.patch("/org", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const body = req.body as Record<string, unknown>;
  const { data, error } = await supabase
    .from("organizations")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", user.orgId)
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

export default router;
