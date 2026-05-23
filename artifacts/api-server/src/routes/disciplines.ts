import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// GET /disciplines — all disciplines for the org
router.get("/disciplines", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const { data, error } = await supabase
    .from("disciplines")
    .select("*")
    .eq("organization_id", user.orgId)
    .order("name");
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

// POST /disciplines — admin creates a discipline
router.post("/disciplines", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { name, description } = req.body as { name: string; description?: string };
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const { data, error } = await supabase
    .from("disciplines")
    .insert({ organization_id: user.orgId, name, description })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

// PATCH /disciplines/:id
router.patch("/disciplines/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { name, description, active } = req.body as { name?: string; description?: string; active?: boolean };
  const { data, error } = await supabase
    .from("disciplines")
    .update({ name, description, active })
    .eq("id", parseInt(req.params.id))
    .eq("organization_id", user.orgId)
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// DELETE /disciplines/:id
router.delete("/disciplines/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { error } = await supabase
    .from("disciplines")
    .delete()
    .eq("id", parseInt(req.params.id))
    .eq("organization_id", user.orgId);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
});

// GET /operator-profiles — list profiles with rates
router.get("/operator-profiles", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const { data, error } = await supabase
    .from("operator_profiles")
    .select(`
      *,
      user:users!user_id(id,name,email),
      rates:operator_discipline_rates(*, discipline:disciplines(id,name))
    `)
    .eq("organization_id", user.orgId)
    .order("id");
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

// POST /operator-profiles — admin creates profile for an operator
router.post("/operator-profiles", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { userId, profileType, bio, rates } = req.body as {
    userId: number;
    profileType: "paid" | "volunteer";
    bio?: string;
    rates?: Array<{ disciplineId: number; hourlyRateCents: number }>;
  };
  if (!userId || !profileType) { res.status(400).json({ error: "userId and profileType required" }); return; }

  const { data: profile, error } = await supabase
    .from("operator_profiles")
    .upsert({ user_id: userId, organization_id: user.orgId, profile_type: profileType, bio })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }

  if (rates && rates.length > 0 && profileType === "paid") {
    const rateRows = rates.map(r => ({
      operator_profile_id: profile.id,
      discipline_id: r.disciplineId,
      hourly_rate_cents: r.hourlyRateCents,
    }));
    await supabase.from("operator_discipline_rates").upsert(rateRows);
  }
  res.status(201).json(profile);
});

// PATCH /operator-profiles/:id
router.patch("/operator-profiles/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { profileType, bio, active, rates } = req.body as {
    profileType?: "paid" | "volunteer";
    bio?: string;
    active?: boolean;
    rates?: Array<{ disciplineId: number; hourlyRateCents: number }>;
  };
  const profileId = parseInt(req.params.id);
  const { data: profile, error } = await supabase
    .from("operator_profiles")
    .update({ profile_type: profileType, bio, active })
    .eq("id", profileId)
    .eq("organization_id", user.orgId)
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }

  if (rates) {
    await supabase.from("operator_discipline_rates").delete().eq("operator_profile_id", profileId);
    if (rates.length > 0) {
      await supabase.from("operator_discipline_rates").insert(
        rates.map(r => ({ operator_profile_id: profileId, discipline_id: r.disciplineId, hourly_rate_cents: r.hourlyRateCents }))
      );
    }
  }
  res.json(profile);
});

export default router;
