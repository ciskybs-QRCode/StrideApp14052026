import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// GET /blacklist — admin/operator: list all blacklisted entries for this org
router.get("/blacklist", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const { data, error } = await supabase
    .from("blacklist")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

// POST /blacklist — admin: add entry
router.post("/blacklist", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const { email, phone_number, first_name, last_name, reason } = req.body as {
    email?: string; phone_number?: string;
    first_name?: string; last_name?: string; reason?: string;
  };

  if (!email && !phone_number && !(first_name && last_name)) {
    res.status(400).json({ error: "Provide at least one identifier: email, phone_number, or first_name+last_name" });
    return;
  }

  const { data, error } = await supabase
    .from("blacklist")
    .insert({
      organization_id: orgId,
      email: email ?? null,
      phone_number: phone_number ?? null,
      first_name: first_name ?? null,
      last_name: last_name ?? null,
      reason: reason ?? null,
      blocked_by_user_id: parseInt(user.id),
    })
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  req.log.info({ blacklistId: data.id, orgId }, "blacklist entry added");
  res.status(201).json(data);
});

// DELETE /blacklist/:id — admin: remove entry
router.delete("/blacklist/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase
    .from("blacklist")
    .delete()
    .eq("id", parseInt(String(id), 10));
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).end();
});

// POST /blacklist/check — check if registration data matches a blacklist entry
router.post("/blacklist/check", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const { email, phone_number, first_name, last_name } = req.body as {
    email?: string; phone_number?: string;
    first_name?: string; last_name?: string;
  };

  const { data, error } = await supabase
    .from("blacklist")
    .select("id, reason, email, phone_number, first_name, last_name")
    .eq("organization_id", orgId);

  if (error || !data) { res.json({ blocked: false }); return; }

  const emailLow = email?.toLowerCase().trim();
  const phoneTrim = phone_number?.replace(/\s/g, "");
  const fnLow = first_name?.toLowerCase().trim();
  const lnLow = last_name?.toLowerCase().trim();

  const match = data.find(entry => {
    if (emailLow && entry.email?.toLowerCase().trim() === emailLow) return true;
    if (phoneTrim && entry.phone_number?.replace(/\s/g, "") === phoneTrim) return true;
    if (fnLow && lnLow && entry.first_name?.toLowerCase().trim() === fnLow &&
        entry.last_name?.toLowerCase().trim() === lnLow) return true;
    return false;
  });

  res.json({ blocked: !!match, reason: match?.reason ?? null });
});

export default router;
