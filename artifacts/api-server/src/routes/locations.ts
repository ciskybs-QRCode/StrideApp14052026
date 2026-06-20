import { Router, type Request } from "express";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_locations (
      id              SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      name            TEXT    NOT NULL,
      description     TEXT,
      active          BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS org_locations_org_idx ON org_locations (organization_id);
  `).catch(() => {});
})();

router.get("/locations", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  try {
    const { rows } = await pool.query(
      `SELECT id, name, description, active FROM org_locations
       WHERE organization_id = $1 AND active = true
       ORDER BY name`,
      [user.orgId],
    );
    res.json(rows);
  } catch {
    res.json([]);
  }
});

router.post("/locations", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { name, description } = req.body as { name?: string; description?: string };
  if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
  try {
    const { rows } = await pool.query(
      `INSERT INTO org_locations (organization_id, name, description)
       VALUES ($1, $2, $3) RETURNING id, name, description, active`,
      [user.orgId, name.trim(), description ?? null],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    req.log.error(err, "locations POST");
    res.status(500).json({ error: "Failed to create location" });
  }
});

router.patch("/locations/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const id   = parseInt(String(req.params.id), 10);
  const { name, description, active } = req.body as { name?: string; description?: string; active?: boolean };
  try {
    const { rows } = await pool.query(
      `UPDATE org_locations
       SET name        = COALESCE($1, name),
           description = COALESCE($2, description),
           active      = COALESCE($3, active)
       WHERE id = $4 AND organization_id = $5
       RETURNING id, name, description, active`,
      [name ?? null, description ?? null, active ?? null, id, user.orgId],
    );
    if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
    res.json(rows[0]);
  } catch (err) {
    req.log.error(err, "locations PATCH");
    res.status(500).json({ error: "Failed to update location" });
  }
});

router.delete("/locations/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const id   = parseInt(String(req.params.id), 10);
  try {
    await pool.query(
      `DELETE FROM org_locations WHERE id = $1 AND organization_id = $2`,
      [id, user.orgId],
    );
    res.status(204).end();
  } catch (err) {
    req.log.error(err, "locations DELETE");
    res.status(500).json({ error: "Failed to delete location" });
  }
});

export default router;
