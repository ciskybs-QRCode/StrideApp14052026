import { Router, type Request } from "express";
import { pool, ensureTables } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// GET /blacklist — admin/operator: list all blacklisted entries for this org
router.get("/blacklist", requireAuth, requireRole("admin", "operator"), async (req, res) => {
  await ensureTables();
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const { rows } = await pool.query(
    `SELECT id, organization_id, email, phone_number, first_name, last_name, reason, created_at
     FROM blacklist
     WHERE organization_id = $1
     ORDER BY created_at DESC`,
    [orgId]
  );
  res.json(rows);
});

// POST /blacklist — admin: add entry
router.post("/blacklist", requireAuth, requireRole("admin"), async (req, res) => {
  await ensureTables();
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

  const { rows } = await pool.query(
    `INSERT INTO blacklist (organization_id, email, phone_number, first_name, last_name, reason)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [orgId, email ?? null, phone_number ?? null, first_name ?? null, last_name ?? null, reason ?? null]
  );

  req.log.info({ blacklistId: rows[0].id, orgId }, "blacklist entry added");
  res.status(201).json(rows[0]);
});

// DELETE /blacklist/:id — admin: remove entry (org-scoped to prevent cross-tenant deletion)
router.delete("/blacklist/:id", requireAuth, requireRole("admin"), async (req, res) => {
  await ensureTables();
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const { id } = req.params;
  const { rowCount } = await pool.query(
    "DELETE FROM blacklist WHERE id = $1 AND organization_id = $2",
    [parseInt(String(id), 10), orgId],
  );
  if (!rowCount) { res.status(403).json({ error: "Forbidden" }); return; }
  res.status(204).end();
});

// POST /blacklist/check — check if registration data matches a blacklist entry
router.post("/blacklist/check", requireAuth, async (req, res) => {
  await ensureTables();
  const user = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const { email, phone_number, first_name, last_name } = req.body as {
    email?: string; phone_number?: string;
    first_name?: string; last_name?: string;
  };

  const { rows } = await pool.query(
    `SELECT id, reason, email, phone_number, first_name, last_name FROM blacklist WHERE organization_id = $1`,
    [orgId]
  );

  const emailLow   = email?.toLowerCase().trim();
  const phoneTrim  = phone_number?.replace(/\s/g, "");
  const fnLow      = first_name?.toLowerCase().trim();
  const lnLow      = last_name?.toLowerCase().trim();

  const match = rows.find((entry: Record<string, string | null>) => {
    if (emailLow  && entry.email?.toLowerCase().trim() === emailLow) return true;
    if (phoneTrim && entry.phone_number?.replace(/\s/g, "") === phoneTrim) return true;
    if (fnLow && lnLow && entry.first_name?.toLowerCase().trim() === fnLow &&
        entry.last_name?.toLowerCase().trim() === lnLow) return true;
    return false;
  });

  res.json({ blocked: !!match, reason: match?.reason ?? null });
});

export default router;
