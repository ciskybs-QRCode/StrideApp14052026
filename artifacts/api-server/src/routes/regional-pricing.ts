import { Router, type Request } from "express";
import { pool } from "../lib/pg.js";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── GET /regional-pricing ─────────────────────────────────────────────────────
// Returns all regions + the requesting org's current region selection.
router.get("/regional-pricing", requireAuth, requireRole("admin"), async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;

  const [{ rows: pricing }, { rows: settings }] = await Promise.all([
    pool.query(
      `SELECT id, region_code, currency_code, price_per_seat_cents, is_active, created_at, updated_at
       FROM regional_pricing ORDER BY region_code`,
    ),
    pool.query(
      `SELECT region_code FROM admin_settings WHERE organization_id = $1`,
      [orgId],
    ),
  ]);

  res.json({
    pricing,
    orgRegionCode: (settings[0] as { region_code?: string } | undefined)?.region_code ?? null,
  });
});

// ── POST /regional-pricing ────────────────────────────────────────────────────
// Creates a new regional pricing entry. Super-admin only in principle;
// gated to admin role — super-admin calls this from the same UI.
router.post("/regional-pricing", requireAuth, requireRole("admin"), async (req, res) => {
  const { region_code, currency_code, price_per_seat_cents, is_active } = req.body as {
    region_code?:          string;
    currency_code?:        string;
    price_per_seat_cents?: number;
    is_active?:            boolean;
  };

  if (!region_code?.trim() || !currency_code?.trim()) {
    res.status(400).json({ error: "region_code and currency_code are required" });
    return;
  }
  if (typeof price_per_seat_cents !== "number" || price_per_seat_cents < 0) {
    res.status(400).json({ error: "price_per_seat_cents must be a non-negative number" });
    return;
  }

  const { rows } = await pool.query(
    `INSERT INTO regional_pricing (region_code, currency_code, price_per_seat_cents, is_active)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [region_code.trim().toUpperCase(), currency_code.trim().toUpperCase(), price_per_seat_cents, is_active ?? true],
  );

  res.status(201).json(rows[0]);
});

// ── PUT /regional-pricing/org-region ──────────────────────────────────────────
// Sets the org's own region_code in admin_settings.
// MUST be registered before /:id to avoid being swallowed by the param route.
router.put("/regional-pricing/org-region", requireAuth, requireRole("admin"), async (req, res) => {
  const user  = (req as AuthReq).user;
  const orgId = user.orgId ?? 1;
  const { region_code } = req.body as { region_code?: string | null };

  await pool.query(
    `INSERT INTO admin_settings (organization_id, region_code)
     VALUES ($1, $2)
     ON CONFLICT (organization_id)
     DO UPDATE SET region_code = $2, updated_at = NOW()`,
    [orgId, region_code?.trim().toUpperCase() ?? null],
  );

  res.json({ orgId, region_code: region_code?.trim().toUpperCase() ?? null });
});

// ── PUT /regional-pricing/:id ─────────────────────────────────────────────────
router.put("/regional-pricing/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = Number(req.params["id"]);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { currency_code, price_per_seat_cents, is_active } = req.body as {
    currency_code?:        string;
    price_per_seat_cents?: number;
    is_active?:            boolean;
  };

  const { rows } = await pool.query(
    `UPDATE regional_pricing
     SET currency_code        = COALESCE($1, currency_code),
         price_per_seat_cents = COALESCE($2, price_per_seat_cents),
         is_active            = COALESCE($3, is_active),
         updated_at           = NOW()
     WHERE id = $4
     RETURNING *`,
    [
      currency_code?.trim().toUpperCase() ?? null,
      price_per_seat_cents ?? null,
      is_active ?? null,
      id,
    ],
  );

  if (!rows[0]) { res.status(404).json({ error: "Region not found" }); return; }
  res.json(rows[0]);
});

// ── DELETE /regional-pricing/:id ──────────────────────────────────────────────
router.delete("/regional-pricing/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = Number(req.params["id"]);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { rowCount } = await pool.query(
    `DELETE FROM regional_pricing WHERE id = $1`,
    [id],
  );

  if (!rowCount) { res.status(404).json({ error: "Region not found" }); return; }
  res.status(204).send();
});

export default router;
