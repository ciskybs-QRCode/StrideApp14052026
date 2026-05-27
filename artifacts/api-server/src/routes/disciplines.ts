import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { pool, ensureTables } from "../lib/pg.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// GET /disciplines
router.get("/disciplines", requireAuth, async (req, res) => {
  await ensureTables();
  const user = (req as AuthReq).user;
  const { rows } = await pool.query(
    `SELECT * FROM disciplines WHERE organization_id = $1 ORDER BY name`,
    [user.orgId],
  );
  res.json(rows);
});

// POST /disciplines
router.post("/disciplines", requireAuth, requireRole("admin"), async (req, res) => {
  await ensureTables();
  const user = (req as AuthReq).user;
  const { name, description } = req.body as { name: string; description?: string };
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const { rows } = await pool.query(
    `INSERT INTO disciplines (organization_id, name, description) VALUES ($1, $2, $3) RETURNING *`,
    [user.orgId, name, description ?? null],
  );
  res.status(201).json(rows[0]);
});

// PATCH /disciplines/:id
router.patch("/disciplines/:id", requireAuth, requireRole("admin"), async (req, res) => {
  await ensureTables();
  const user = (req as AuthReq).user;
  const { name, description, active } = req.body as { name?: string; description?: string; active?: boolean };
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (name !== undefined)        { fields.push(`name = $${i++}`);        values.push(name); }
  if (description !== undefined) { fields.push(`description = $${i++}`); values.push(description); }
  if (active !== undefined)      { fields.push(`active = $${i++}`);      values.push(active); }
  if (!fields.length) { res.status(400).json({ error: "no fields to update" }); return; }
  values.push(parseInt(String(req.params.id)), user.orgId);
  const { rows } = await pool.query(
    `UPDATE disciplines SET ${fields.join(", ")} WHERE id = $${i++} AND organization_id = $${i} RETURNING *`,
    values,
  );
  if (!rows.length) { res.status(404).json({ error: "not found" }); return; }
  res.json(rows[0]);
});

// DELETE /disciplines/:id
router.delete("/disciplines/:id", requireAuth, requireRole("admin"), async (req, res) => {
  await ensureTables();
  const user = (req as AuthReq).user;
  await pool.query(
    `DELETE FROM disciplines WHERE id = $1 AND organization_id = $2`,
    [parseInt(String(req.params.id)), user.orgId],
  );
  res.status(204).send();
});

// GET /operator-profiles
router.get("/operator-profiles", requireAuth, async (req, res) => {
  await ensureTables();
  const user = (req as AuthReq).user;

  const { rows: profiles } = await pool.query(
    `SELECT op.*,
       COALESCE(
         json_agg(json_build_object(
           'id', odr.id,
           'operator_profile_id', odr.operator_profile_id,
           'discipline_id', odr.discipline_id,
           'hourly_rate_cents', odr.hourly_rate_cents,
           'discipline', json_build_object('id', d.id, 'name', d.name)
         )) FILTER (WHERE odr.id IS NOT NULL),
         '[]'
       ) AS rates
     FROM operator_profiles op
     LEFT JOIN operator_discipline_rates odr ON odr.operator_profile_id = op.id
     LEFT JOIN disciplines d ON d.id = odr.discipline_id
     WHERE op.organization_id = $1
     GROUP BY op.id
     ORDER BY op.id`,
    [user.orgId],
  );

  if (profiles.length > 0) {
    const userIds = [...new Set(profiles.map((p: { user_id: number }) => p.user_id))];
    const { data: users } = await supabase
      .from("users")
      .select("id, name, email")
      .in("id", userIds);
    const userMap: Record<number, { id: number; name: string; email: string }> = {};
    (users ?? []).forEach((u: { id: number; name: string; email: string }) => { userMap[u.id] = u; });
    profiles.forEach((p: { user_id: number; user?: unknown }) => {
      p.user = userMap[p.user_id] ?? null;
    });
  }

  res.json(profiles);
});

// POST /operator-profiles
router.post("/operator-profiles", requireAuth, requireRole("admin"), async (req, res) => {
  await ensureTables();
  const user = (req as AuthReq).user;
  const { userId, profileType, bio, rates } = req.body as {
    userId: number;
    profileType: "paid" | "volunteer";
    bio?: string;
    rates?: Array<{ disciplineId: number; hourlyRateCents: number }>;
  };
  if (!userId || !profileType) { res.status(400).json({ error: "userId and profileType required" }); return; }

  const { rows } = await pool.query(
    `INSERT INTO operator_profiles (user_id, organization_id, profile_type, bio)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, organization_id)
       DO UPDATE SET profile_type = EXCLUDED.profile_type, bio = EXCLUDED.bio
     RETURNING *`,
    [userId, user.orgId, profileType, bio ?? null],
  );
  const profile = rows[0] as { id: number };

  if (rates && rates.length > 0 && profileType === "paid") {
    for (const r of rates) {
      await pool.query(
        `INSERT INTO operator_discipline_rates (operator_profile_id, discipline_id, hourly_rate_cents)
         VALUES ($1, $2, $3)
         ON CONFLICT (operator_profile_id, discipline_id)
           DO UPDATE SET hourly_rate_cents = EXCLUDED.hourly_rate_cents`,
        [profile.id, r.disciplineId, r.hourlyRateCents],
      );
    }
  }

  res.status(201).json(profile);
});

// PATCH /operator-profiles/:id
router.patch("/operator-profiles/:id", requireAuth, requireRole("admin"), async (req, res) => {
  await ensureTables();
  const user = (req as AuthReq).user;
  const { profileType, bio, active, rates } = req.body as {
    profileType?: "paid" | "volunteer";
    bio?: string;
    active?: boolean;
    rates?: Array<{ disciplineId: number; hourlyRateCents: number }>;
  };
  const profileId = parseInt(String(req.params.id));

  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (profileType !== undefined) { fields.push(`profile_type = $${i++}`); values.push(profileType); }
  if (bio !== undefined)         { fields.push(`bio = $${i++}`);          values.push(bio); }
  if (active !== undefined)      { fields.push(`active = $${i++}`);       values.push(active); }

  let profile: Record<string, unknown>;
  if (fields.length > 0) {
    values.push(profileId, user.orgId);
    const { rows } = await pool.query(
      `UPDATE operator_profiles SET ${fields.join(", ")} WHERE id = $${i++} AND organization_id = $${i} RETURNING *`,
      values,
    );
    if (!rows.length) { res.status(404).json({ error: "not found" }); return; }
    profile = rows[0] as Record<string, unknown>;
  } else {
    const { rows } = await pool.query(
      `SELECT * FROM operator_profiles WHERE id = $1 AND organization_id = $2`,
      [profileId, user.orgId],
    );
    if (!rows.length) { res.status(404).json({ error: "not found" }); return; }
    profile = rows[0] as Record<string, unknown>;
  }

  if (rates !== undefined) {
    await pool.query(
      `DELETE FROM operator_discipline_rates WHERE operator_profile_id = $1`,
      [profileId],
    );
    for (const r of rates) {
      await pool.query(
        `INSERT INTO operator_discipline_rates (operator_profile_id, discipline_id, hourly_rate_cents) VALUES ($1, $2, $3)`,
        [profileId, r.disciplineId, r.hourlyRateCents],
      );
    }
  }

  res.json(profile);
});

// DELETE /operator-profiles/:id
router.delete("/operator-profiles/:id", requireAuth, requireRole("admin"), async (req, res) => {
  await ensureTables();
  const user = (req as AuthReq).user;
  const profileId = parseInt(String(req.params.id));
  try {
    await pool.query(`DELETE FROM operator_discipline_rates WHERE operator_profile_id = $1`, [profileId]);
    const { rows } = await pool.query(
      `DELETE FROM operator_profiles WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [profileId, user.orgId],
    );
    if (!rows.length) { res.status(404).json({ error: "not found" }); return; }
    res.status(204).end();
  } catch (e: unknown) {
    req.log.error(e);
    res.status(500).json({ error: "Failed to delete operator profile" });
  }
});

export default router;
