import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── Blacklist helper ──────────────────────────────────────────────────────────
async function isBlacklisted(
  orgId: number,
  opts: { firstName?: string; lastName?: string; phoneNumber?: string }
): Promise<{ blocked: boolean; reason?: string }> {
  const { data } = await supabase
    .from("blacklist")
    .select("id, reason, first_name, last_name, phone_number")
    .eq("organization_id", orgId);

  if (!data?.length) return { blocked: false };

  const fnLow = opts.firstName?.toLowerCase().trim();
  const lnLow = opts.lastName?.toLowerCase().trim();
  const phoneTrim = opts.phoneNumber?.replace(/\s/g, "");

  const match = data.find(entry => {
    if (phoneTrim && entry.phone_number?.replace(/\s/g, "") === phoneTrim) return true;
    if (fnLow && lnLow &&
        entry.first_name?.toLowerCase().trim() === fnLow &&
        entry.last_name?.toLowerCase().trim() === lnLow) return true;
    return false;
  });

  return { blocked: !!match, reason: match?.reason ?? undefined };
}

// ── Routes ───────────────────────────────────────────────────────────────────

router.get("/members", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("user_id", parseInt(user.id))
    .order("first_name");
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.post("/members", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const body = req.body as Record<string, unknown>;
  const orgId = user.orgId ?? 1;

  const check = await isBlacklisted(orgId, {
    firstName:   typeof body.first_name === "string" ? body.first_name : undefined,
    lastName:    typeof body.last_name  === "string" ? body.last_name  : undefined,
    phoneNumber: typeof body.phone      === "string" ? body.phone      : undefined,
  });

  if (check.blocked) {
    req.log.warn({ orgId, firstName: body.first_name, lastName: body.last_name },
      "blocked registration: blacklist match");
    res.status(403).json({
      error: "Registrazione non consentita. Contattare l'amministrazione per ulteriori informazioni.",
      blocked: true,
    });
    return;
  }

  const { data, error } = await supabase
    .from("members")
    .insert({
      ...body,
      user_id: parseInt(user.id),
      organization_id: body.organization_id ?? (user.orgId ?? 1),
    })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

router.patch("/members/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const body = req.body as Record<string, unknown>;
  const { data, error } = await supabase
    .from("members")
    .update(body)
    .eq("id", parseInt(String(id)))
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.delete("/members/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase
    .from("members")
    .delete()
    .eq("id", parseInt(String(id)));
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
});

export default router;
