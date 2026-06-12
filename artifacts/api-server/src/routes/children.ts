import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

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

  // Resolve org: prefer body-supplied orgId, then JWT orgId; never allow 0 (invalid)
  const resolvedOrg = Number(body.organization_id) || Number(user.orgId) || null;
  if (!resolvedOrg) {
    res.status(400).json({
      error: "No organization context. Complete school setup before adding dependents.",
    });
    return;
  }

  const { data, error } = await supabase
    .from("members")
    .insert({
      ...body,
      user_id: parseInt(user.id),
      organization_id: resolvedOrg,
    })
    .select()
    .single();
  if (error) {
    req.log.error({ err: error, userId: user.id, orgId: resolvedOrg }, "POST /members insert failed");
    res.status(500).json({ error: error.message });
    return;
  }
  res.status(201).json(data);
});

router.patch("/members/:id", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { id } = req.params;

  // Ownership check
  const { data: existing } = await supabase
    .from("members").select("id")
    .eq("id", parseInt(String(id), 10)).eq("organization_id", user.orgId).maybeSingle();
  if (!existing) { res.status(403).json({ error: "Forbidden" }); return; }

  // Field whitelist — prevent arbitrary column injection
  const ALLOWED = [
    "first_name","last_name","date_of_birth","allergies",
    "notes","phone","emergency_contact","photo_uri","medical_notes",
  ] as const;
  const patch: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in (req.body as Record<string, unknown>)) {
      patch[key] = (req.body as Record<string, unknown>)[key];
    }
  }
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const { data, error } = await supabase
    .from("members").update(patch).eq("id", parseInt(String(id), 10)).select().single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.delete("/members/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { id } = req.params;
  // Ownership check before delete
  const { data: existing } = await supabase
    .from("members").select("id")
    .eq("id", parseInt(String(id), 10)).eq("organization_id", user.orgId).maybeSingle();
  if (!existing) { res.status(403).json({ error: "Forbidden" }); return; }
  const { error } = await supabase.from("members").delete().eq("id", parseInt(String(id), 10));
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
});

export default router;
